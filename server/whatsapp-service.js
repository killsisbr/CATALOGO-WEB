import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import qrcodeImage from 'qrcode';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client, LocalAuth } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho para salvar as sessões
const SESSIONS_DIR = path.join(__dirname, 'whatsapp-sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

class WhatsAppService {
  constructor() {
    this.client = null;
    this.clients = new Map(); // Para armazenar dados temporários dos clientes
    this.groupId = process.env.WHATSAPP_GROUP_ID || null; // ID do grupo para envio de pedidos
    this.lastQRCode = null; // Armazenar o último QR Code gerado
    this.isConnected = false; // Status da conexão
    this.robotEnabledCallback = null; // Função para verificar se o robô está ligado
    // Distância máxima (km) para incluir link de mapa (padrão 70km)
    this.deliveryLinkMaxDistanceKm = parseFloat(process.env.DELIVERY_LINK_MAX_DISTANCE_KM || '70');
    // Caminho para armazenar log de welcome (por dia)
    this.welcomeLogPath = path.join(SESSIONS_DIR, 'welcome-log.json');
    this.welcomeLog = this._loadWelcomeLog();

    // Intervalo (em horas) para reenvio do welcome. Pode ser parametrizado via .env
    const envHours = parseFloat(process.env.WELCOME_RESEND_HOURS);
    this.welcomeResendHours = (!isNaN(envHours) && envHours > 0) ? envHours : 12;
    console.log('🔧 Welcome resend interval (hours):', this.welcomeResendHours);

    // Debug: Verificar se o ID do grupo foi carregado
    console.log('🔧 WhatsApp Service - Group ID configurado:', this.groupId);
    console.log('🔧 Tipo do Group ID:', typeof this.groupId);
    console.log('🔧 WHATSAPP_GROUP_ID do .env:', process.env.WHATSAPP_GROUP_ID);
    console.log('🔧 APP_DOMAIN do .env:', process.env.APP_DOMAIN);
    console.log('🔧 RESTAURANT_NAME do .env:', process.env.RESTAURANT_NAME);
  }

  // Carregar log de welcomes (persistente simples em JSON)
  _loadWelcomeLog() {
    try {
      if (fs.existsSync(this.welcomeLogPath)) {
        const content = fs.readFileSync(this.welcomeLogPath, 'utf8') || '{}';
        return JSON.parse(content);
      }

    } catch (err) {
      console.warn('Não foi possível ler welcome-log.json:', err && err.message);
    }
    return {};
  }

  // Verificar se devemos enviar a mensagem de boas-vindas (intervalo configurable)
  // Alterado para 12 horas: retorna true se já se passaram 12 horas desde o último envio.
  // Mantém compatibilidade com entradas antigas no formato YYYY-MM-DD.
  shouldSendWelcomeToday(whatsappId) {
    try {
      const last = this.welcomeLog[whatsappId];
      if (!last) return true;

      // Compatibilidade: se o valor for somente uma data YYYY-MM-DD (formato antigo),
      // considerar que não reenviamos no mesmo dia.
      if (typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last)) {
        const today = new Date().toISOString().slice(0, 10);
        return last !== today; // se for o mesmo dia, não enviar; caso contrário, enviar
      }

      // Caso normal: last pode ser timestamp (number) ou string ISO; parse para ms
      const lastTs = (typeof last === 'number') ? last : Date.parse(last);
      if (isNaN(lastTs)) return true;

      const intervalMs = this.welcomeResendHours * 60 * 60 * 1000;
      return (Date.now() - lastTs) >= intervalMs;
    } catch (err) {
      return true;
    }
  }

  // Marcar que enviamos a mensagem de boas-vindas para whatsappId
  // Agora gravamos um timestamp (ms desde epoch) para permitir checagens em horas.
  markWelcomeSent(whatsappId) {
    try {
      this.welcomeLog[whatsappId] = Date.now();
      this._saveWelcomeLog();
    } catch (err) {
      console.warn('Falha ao marcar welcome como enviado:', err && err.message);
    }
  }

  _saveWelcomeLog() {
    try {
      fs.writeFileSync(this.welcomeLogPath, JSON.stringify(this.welcomeLog || {}, null, 2), 'utf8');
    } catch (err) {
      console.warn('Falha ao salvar welcome-log.json:', err && err.message);
    }
  }

  // Definir callback para verificar se o robô está ligado
  setRobotEnabledCallback(callback) {
    this.robotEnabledCallback = callback;
  }

  // Verificar se o robô está ligado
  isRobotEnabled() {
    if (this.robotEnabledCallback) {
      return this.robotEnabledCallback();
    }
    return true; // Por padrão, considerar ligado se não houver callback
  }

  // Inicializar o cliente do WhatsApp
  initialize() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'brutus-web',
        dataPath: SESSIONS_DIR
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      }
    });

    this.client.on('qr', async qr => {
      console.log('QR Code recebido, escaneie com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
      // Armazenar o QR Code para uso posterior
      this.lastQRCode = qr;
      this.isConnected = false;
    });

    this.client.on('ready', () => {
      console.log('Cliente do WhatsApp pronto!');
      this.isConnected = true;
    });

    this.client.on('disconnected', (reason) => {
      console.log('Cliente do WhatsApp desconectado:', reason);
      this.isConnected = false;
      this.lastQRCode = null;
    });

    this.client.on('message', async message => {
      await this.handleMessage(message);
    });

    this.client.initialize();
  }

  // Método para obter o QR Code como imagem Data URL
  async getQRCodeDataURL() {
    if (!this.lastQRCode) {
      throw new Error('Nenhum QR Code disponível. O cliente do WhatsApp ainda não foi inicializado ou já está conectado.');
    }

    try {
      // Gerar QR Code como Data URL
      const dataURL = await qrcodeImage.toDataURL(this.lastQRCode, { width: 300 });
      return dataURL;
    } catch (error) {
      throw new Error('Erro ao gerar QR Code: ' + error.message);
    }
  }

  // Método para obter o status da conexão do WhatsApp
  getStatus() {
    return {
      connected: this.isConnected,
      qrCodeAvailable: !!this.lastQRCode
    };
  }

  // Listar todos os grupos disponíveis (útil para descobrir o ID correto)
  async listGroups() {
    if (!this.isConnected) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      const chats = await this.client.getChats();
      const groups = chats.filter(chat => chat.isGroup);

      console.log('\n📋 Grupos disponíveis no WhatsApp:');
      console.log('═'.repeat(60));

      groups.forEach((group, index) => {
        console.log(`${index + 1}. Nome: ${group.name}`);
        console.log(`   ID: ${group.id._serialized}`);
        console.log(`   Participantes: ${group.participants.length}`);
        console.log('─'.repeat(60));
      });

      return groups.map(g => ({
        name: g.name,
        id: g.id._serialized,
        participants: g.participants.length
      }));
    } catch (error) {
      console.error('Erro ao listar grupos:', error);
      throw error;
    }
  }

  // Manipular mensagens recebidas
  async handleMessage(message) {
    try {
      const chat = await message.getChat();

      // Tentativa principal de obter contato via API do whatsapp-web.js
      // (pode falhar se a API do WhatsApp Web mudar e o puppeteer executar códigos que não existem)
      let contact;
      try {
        contact = await message.getContact();
      } catch (err) {
        // Fallback: criar um contato mínimo a partir dos dados da mensagem
        console.warn('Falha ao obter contato via getContact() — usando fallback:', err && err.message);
        const possibleId = message.author || message.from || (message._data && (message._data.author || message._data.from));
        const pushname = (message._data && (message._data.notifyName || (message._data.sender && message._data.sender.pushname))) || null;
        contact = {
          id: { _serialized: possibleId || 'unknown@c.us' },
          pushname: pushname || 'Contato'
        };
      }
      const whatsappId = contact.id._serialized;

      // Ignorar mensagens de grupos e transmissões
      if (chat.isGroup) {
        const grpMsgPreview = message.body && message.body.length > 50 ? message.body.substring(0, 50) + '...' : message.body;
        console.log(`Mensagem de grupo ignorada de ${contact.pushname}: ${grpMsgPreview}`);
        return;
      }

      if (message.broadcast) {
        const brdMsgPreview = message.body && message.body.length > 50 ? message.body.substring(0, 50) + '...' : message.body;
        console.log(`Mensagem de transmissão ignorada de ${contact.pushname}: ${brdMsgPreview}`);
        return;
      }

      // Log de mensagem recebida (truncar se muito longa para evitar spam de base64)
      const msgPreview = message.body && message.body.length > 100
        ? message.body.substring(0, 100) + '... [truncado]'
        : message.body;
      console.log(`Mensagem recebida de ${contact.pushname} (${whatsappId}): ${msgPreview}`);

      // Verificar se o robô está ligado
      if (!this.isRobotEnabled()) {
        console.log(`🤖 Robô desligado - Mensagem de ${contact.pushname} NÃO respondida`);
        return;
      }

      // Comandos disponíveis
      const msg = message.body.toLowerCase().trim();
      // Verificar se já enviamos o link de boas-vindas hoje para este usuário
      let welcomeSentNow = false;
      try {
        if (this.shouldSendWelcomeToday(whatsappId)) {
          await this.sendWelcomeMessage(chat, whatsappId);
          this.markWelcomeSent(whatsappId);
          welcomeSentNow = true;
          console.log(`✅ Enviado link de boas-vindas para ${whatsappId} (daily)`);
        }
      } catch (err) {
        console.warn('Erro ao enviar welcome automático:', err && err.message);
      }

      // Se já enviamos a mensagem de boas-vindas agora, pular o ramo de cumprimento para evitar duplicação
      if (!welcomeSentNow && (msg === 'oi' || msg === 'olá' || msg === 'ola' || msg === 'oola' || msg === 'opa' || msg === 'noite')) {
        await this.sendWelcomeMessage(chat, whatsappId);
      } else if (msg === 'pedir' || msg === 'pedido' || msg.startsWith('pedido')) {
        await this.handleOrderRequest(chat, whatsappId);
      } else if (msg === 'ajuda' || msg === 'menu' || msg === 'cardapio' || msg === 'cardápio') {
        await this.sendHelpMessage(chat);
      }
    } catch (err) {
      console.error('Erro no handleMessage:', err && err.message);
    }
  }

  // Enviar mensagem de boas-vindas
  async sendWelcomeMessage(chat, whatsappId) {
    // Gerar link sem expor JWT ao cliente — usar somente o número do WhatsApp (apenas dígitos)
    const sanitizedNumber = String(whatsappId || '').replace(/[^0-9]/g, '');
    const appDomain = process.env.APP_DOMAIN || 'brutusburger.online';
    const restaurantName = process.env.RESTAURANT_NAME || 'Brutus Burger';
    const orderLink = `https://${appDomain}/pedido?whatsapp=${encodeURIComponent(sanitizedNumber)}`;

    const welcomeMessage = `Olá! Bem-vindo ao ${restaurantName}! 🍔\n\n` +
      `Eu sou o robô de atendimento do ${restaurantName}. Posso te ajudar a fazer pedidos rapidamente!\n\n` +
      `👉 Para começar seu pedido agora, clique no link abaixo:\n${orderLink}\n\n` +
      `💡 *Dica:* Peça rapidamente usando o link acima!`;

    await chat.sendMessage(welcomeMessage);
  }

  // Enviar mensagem de ajuda
  async sendHelpMessage(chat) {
    const helpMessage = `🤖 *Como fazer seu pedido:*

🍔 *Para fazer um pedido:*
1. Clique no link que enviei
2. Monte seu pedido no site
3. Confirme e receba atualizações pelo WhatsApp

💬 Qualquer dúvida, estou aqui para ajudar!`;

    await chat.sendMessage(helpMessage);
  }

  // Manipular solicitação de pedido
  async handleOrderRequest(chat, whatsappId) {
    // Gerar link sem expor JWT ao cliente — usar somente o número do WhatsApp (apenas dígitos)
    const sanitizedNumberQuick = String(whatsappId || '').replace(/[^0-9]/g, '');
    const appDomainQuick = process.env.APP_DOMAIN || 'brutusburger.online';
    const quickLink = `https://${appDomainQuick}/pedido?whatsapp=${encodeURIComponent(sanitizedNumberQuick)}`;

    const orderMessage = `🍔 Vamos criar seu pedido!\n\nClique no link abaixo para acessar seu pedido personalizado:\n${quickLink}\n\nApós finalizar seu pedido no site, você receberá um resumo aqui no WhatsApp!`;

    await chat.sendMessage(orderMessage);
  }

  // Enviar resumo do pedido
  _ensureChatId(id) {
    // Normalize an identifier: if it's just digits, append @c.us; if already contains @ keep as is
    if (!id) return id;
    const str = String(id);
    // If it already contains an @, assume it's serialized
    if (str.includes('@')) return str;
    const digits = str.replace(/\D/g, '');
    return digits + '@c.us';
  }

  // Helper: calcular distância entre duas coordenadas em km (fórmula Haversine)
  _distanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (v) => v * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _buildOrderSummaryMessage(orderData) {
    // Extract message builder from sendOrderSummary to be reused by fallback senders
    let itemsList = '';
    // Defensivo: garantir arrays e objetos
    orderData.itens = orderData.itens || [];
    orderData.cliente = orderData.cliente || {};
    let subtotal = 0;
    orderData.itens.forEach(item => {
      const basePrice = (item.produto && (item.produto.preco || item.produto.preco_unitario)) || item.preco || 0;
      const qty = item.quantidade || 1;
      const itemTotal = parseFloat(basePrice) * qty;
      subtotal += itemTotal;
      itemsList += `• ${qty}x ${item.produto && (item.produto.nome || item.produto_nome) || item.nome} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;

      // Adicionar adicionais se houver
      if (item.adicionais && item.adicionais.length > 0) {
        item.adicionais.forEach(adicional => {
          const precoAdicional = adicional.preco || adicional.preco_unitario || 0;
          subtotal += precoAdicional * qty;
          itemsList += `  + ${adicional.nome || adicional.produto_nome} - R$ ${(precoAdicional * qty).toFixed(2).replace('.', ',')}\n`;
        });
      }

      // Observações do item
      if (item.observacao && String(item.observacao || '').trim().length > 0) {
        itemsList += `  📝 ${item.observacao.trim()}\n`;
      }
    });

    let deliveryInfo = '';
    let total = subtotal;
    if (orderData.entrega && orderData.entrega.price) {
      const deliveryValue = parseFloat(orderData.entrega.price);
      if (!isNaN(deliveryValue) && deliveryValue > 0) {
        deliveryInfo = `• Taxa de entrega - R$ ${deliveryValue.toFixed(2).replace('.', ',')}\n`;
        total += deliveryValue;
      }
    }

    let deliveryLocationLink = '';
    if (orderData.entrega && !orderData.entrega.enderecoDigitado) {
      try {
        let coords = orderData.entrega.coordenadas || orderData.entrega.coordinates || orderData.entrega.coordenadas_cliente || null;
        if (typeof coords === 'string') {
          try { coords = JSON.parse(coords); } catch (e) { /* ignore */ }
        }
        if (coords && (coords.lat !== undefined || coords.latitude !== undefined)) {
          const lat = coords.lat !== undefined ? coords.lat : coords.latitude;
          const lng = coords.lng !== undefined ? coords.lng : coords.longitude || coords.lng !== undefined ? coords.lng : coords.longitude;
          if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
            // Calcula distância do restaurante e só adiciona link se dentro do limite configurado
            const rLat = parseFloat(process.env.RESTAURANT_LATITUDE || 0);
            const rLng = parseFloat(process.env.RESTAURANT_LONGITUDE || 0);
            let withinLimit = true;
            try {
              const dist = this._distanceKm(rLat, rLng, parseFloat(lat), parseFloat(lng));
              withinLimit = dist <= (this.deliveryLinkMaxDistanceKm || 70);
            } catch (e) { /* se falhar, não bloquear por padrão */ }
            if (withinLimit) {
              deliveryLocationLink = `\nLocalização: https://www.google.com/maps?q=${lat},${lng}`;
            }
          }
        }
      } catch (err) { /* ignore */ }
    }

    const summaryLines = [];
    summaryLines.push('✅ *Pedido Confirmado!*');
    summaryLines.push('');
    summaryLines.push(`Número do pedido: #${orderData.pedidoId}`);
    summaryLines.push('');
    summaryLines.push('Itens:');
    summaryLines.push(itemsList.trim());
    if (deliveryInfo) summaryLines.push(deliveryInfo.trim());
    summaryLines.push(`Total: R$ ${total.toFixed(2).replace('.', ',')}`);
    summaryLines.push('');
    summaryLines.push('Informações do cliente:');
    summaryLines.push(`Nome: ${orderData.cliente.nome}`);
    summaryLines.push(`Telefone: ${orderData.cliente.telefone}`);
    if (orderData.cliente && orderData.cliente.endereco) {
      const addr = String(orderData.cliente.endereco || '');
      const addrLines = addr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (addrLines.length > 0) {
        summaryLines.push(`Endereço: ${addrLines.shift()}`);
        addrLines.forEach(l => summaryLines.push(l));
      } else {
        if (deliveryLocationLink) summaryLines.push(`Endereço: ${addr}${deliveryLocationLink}`);
        else summaryLines.push(`Endereço: ${addr}`);
      }
    } else {
      if (deliveryLocationLink) summaryLines.push(`Endereço: ${deliveryLocationLink.trim()}`);
    }
    // Observação do local (cor da casa, ponto de referência, etc.)
    const addressNote = orderData.entrega && (orderData.entrega.addressNote || orderData.entrega.observacao);
    if (addressNote && String(addressNote).trim().length > 0) {
      summaryLines.push('');
      summaryLines.push(`Observações do local: ${String(addressNote).trim()}`);
    }
    summaryLines.push(`Forma de pagamento: ${orderData.cliente.pagamento}`);
    summaryLines.push('');
    summaryLines.push('*Seu pedido será preparado e entregue em breve!*');
    return summaryLines.filter(Boolean).join('\n');
  }

  async sendOrderSummary(chat, orderData) {
    const summaryMessage = this._buildOrderSummaryMessage(orderData);
    try {
      if (!orderData.cliente || !orderData.cliente.telefone) {
        // Usar apenas o whatsappId do cliente ou o _serialized do chat do cliente (não de grupo)
        let possible = orderData.cliente && (orderData.cliente.whatsappId || orderData.cliente.whatsapp);

        // Se o possible for um ID de grupo (contém '@g.us'), ignorar — não extrair números de grupos
        if (possible && String(possible).includes('@g.us')) {
          possible = null;
        }

        // Se ainda não temos e o chat existe, usar o ID do chat (que é do cliente individual)
        if (!possible && chat && chat.id && chat.id._serialized) {
          // Verificar se é um chat individual (termina com @c.us)
          if (chat.id._serialized.includes('@c.us')) {
            possible = chat.id._serialized;
          }
        }

        if (possible) {
          const digits = String(possible).replace(/\D/g, '');
          if (digits.length > 0) {
            orderData.cliente = orderData.cliente || {};
            orderData.cliente.telefone = digits;
            console.log('🔧 Telefone extraído para confirmação:', digits);
          }
        }
      }
    } catch (err) {
      console.warn('Falha ao auto-preencher telefone do cliente:', err.message);
    }

    // Delivery price and location link are handled within _buildOrderSummaryMessage
    // Montar a mensagem de resumo de forma controlada (sem indentação extra)
    // Se a forma de pagamento for PIX, anexar a chave PIX configurada nas custom-settings
    try {
      const pagamento = (orderData.cliente && orderData.cliente.pagamento) ? String(orderData.cliente.pagamento).toLowerCase() : '';
      if (pagamento.includes('pix')) {
        // Preferir o custom-settings dentro da pasta server; alguns deployments tinham o arquivo na pasta pai
        let settingsPath = path.join(__dirname, 'custom-settings.json');
        if (!fs.existsSync(settingsPath)) {
          // fallback para compatibilidade com instalações antigas
          settingsPath = path.join(__dirname, '..', 'custom-settings.json');
        }

        if (fs.existsSync(settingsPath)) {
          try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
            const pixKey = settings.pixKey || settings.pix_key || settings.pix || '';
            const pixName = settings.pixName || settings.pix_name || settings.pix_titular || '';
            if (pixKey && String(pixKey).trim().length > 0) {
              // acrescentar a informação da chave PIX ao final da mensagem
              const pixLines = [];
              pixLines.push('');
              pixLines.push('CHAVE PIX: ' + pixKey);
              if (pixName && String(pixName).trim().length > 0) pixLines.push('Titular: ' + pixName);
              const finalMessage = [summaryMessage, pixLines.join('\n')].join('\n');
              await chat.sendMessage(finalMessage);
              return;
            }
          } catch (err) {
            console.warn('Não foi possível ler custom-settings para anexar PIX:', err && err.message);
          }
        } else {
          console.warn('custom-settings.json não encontrado em', path.join(__dirname, 'custom-settings.json'), 'nem em', path.join(__dirname, '..', 'custom-settings.json'));
        }
      }
    } catch (err) {
      console.warn('Erro ao tentar anexar CHAVE PIX:', err && err.message);
    }

    await chat.sendMessage(summaryMessage);
  }

  // Enviar resumo do pedido diretamente para um whatsappId (aceita 'digits' or 'digits@c.us')
  async sendOrderSummaryToId(idOrDigits, orderData) {
    if (!this.client) {
      throw new Error('WhatsApp client não inicializado');
    }
    const chatId = this._ensureChatId(idOrDigits);
    try {
      const chat = await this.client.getChatById(chatId);
      return await this.sendOrderSummary(chat, orderData);
    } catch (err) {
      // fallback: tentar enviar texto direto via client.sendMessage
      try {
        const summaryMessage = this._buildOrderSummaryMessage(orderData);
        await this.client.sendMessage(chatId, summaryMessage);
      } catch (err2) {
        console.error('Erro no fallback de envio para cliente:', err2 && err2.message);
        throw err2;
      }
    }
  }

  // Enviar notificação de status do pedido
  async sendOrderStatusUpdate(chat, orderId, status) {
    const statusMessages = {
      'preparando': '🍽 Seu pedido está sendo preparado!',
      'pronto': '✅ Seu pedido está pronto e será entregue em breve!',
      'entregue': '🎉 Seu pedido foi entregue! Agradecemos sua preferência!'
    };

    const statusMessage = `📢 *Atualização do Pedido #${orderId}*
    
${statusMessages[status] || 'Seu pedido foi atualizado!'}`;

    await chat.sendMessage(statusMessage);
  }

  // Enviar pedido para o grupo de entregas
  async sendOrderToDeliveryGroup(orderData) {
    // Verificar se o ID do grupo está configurado
    if (!this.groupId || this.groupId.trim() === '') {
      console.log('❌ ID do grupo do WhatsApp não configurado. Não é possível enviar pedido para o grupo.');
      console.log('📋 Group ID atual:', this.groupId);
      console.log('💡 Configure WHATSAPP_GROUP_ID no arquivo .env');
      return;
    }

    console.log('✅ Enviando pedido para o grupo:', this.groupId);

    // Verificar se o cliente está conectado
    if (!this.isConnected) {
      console.log('Cliente do WhatsApp não está conectado. Não é possível enviar pedido para o grupo.');
      return;
    }

    try {
      console.log('📋 Dados do pedido recebidos:', {
        pedidoId: orderData.pedidoId,
        clienteWhatsappId: orderData.cliente?.whatsappId,
        clienteTelefone: orderData.cliente?.telefone,
        clienteNome: orderData.cliente?.nome
      });

      // Formatar o ID do grupo corretamente (deve terminar com @g.us)
      let formattedGroupId = this.groupId;
      if (!formattedGroupId.includes('@')) {
        formattedGroupId = `${formattedGroupId}@g.us`;
      }

      console.log('📱 ID formatado do grupo:', formattedGroupId);

      // Obter o chat do grupo
      const groupChat = await this.client.getChatById(formattedGroupId);

      // Preparar a lista de itens
      let itemsList = '';
      let subtotal = 0;

      orderData.itens.forEach(item => {
        const itemTotal = item.produto.preco * item.quantidade;
        subtotal += itemTotal;
        itemsList += `• ${item.quantidade}x ${item.produto.nome} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;

        // Adicionar adicionais se houver
        if (item.adicionais && item.adicionais.length > 0) {
          item.adicionais.forEach(adicional => {
            const precoAdicional = adicional.preco || adicional.preco_unitario || 0;
            subtotal += precoAdicional * item.quantidade;
            itemsList += `  + ${adicional.nome || adicional.produto_nome} - R$ ${(precoAdicional * item.quantidade).toFixed(2).replace('.', ',')}\n`;
          });
        }

        // Adicionar observações se houver
        if (item.observacao && item.observacao.trim()) {
          itemsList += `  📝 ${item.observacao}\n`;
        }
      });

      // Calcular taxa de entrega
      const totalPedido = orderData.total || 0;
      const taxaEntrega = totalPedido - subtotal;

      // Verificar se há informações de entrega (aceitar 'coordenadas' ou 'coordinates')
      // MAS não gerar link se o endereço foi digitado manualmente
      let deliveryInfo = '';
      console.log('🔧 sendOrderToDeliveryGroup - entrega flag:', orderData.entrega && orderData.entrega.enderecoDigitado);
      if (orderData.entrega && !orderData.entrega.enderecoDigitado) {
        try {
          let coords = orderData.entrega.coordenadas || orderData.entrega.coordinates || orderData.entrega.coordenadas_cliente || null;
          if (typeof coords === 'string') {
            try { coords = JSON.parse(coords); } catch (e) { /* ignore */ }
          }
          // Garantir que temos coordenadas numéricas válidas antes de criar link (evitar link indevido)
          if (coords && (coords.lat !== undefined || coords.latitude !== undefined)) {
            const lat = coords.lat !== undefined ? coords.lat : coords.latitude;
            const lng = coords.lng !== undefined ? coords.lng : coords.longitude || coords.lng !== undefined ? coords.lng : coords.longitude;
            if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
              // calcular distância e verificar se dentro do limite configurado
              const rLat = parseFloat(process.env.RESTAURANT_LATITUDE || 0);
              const rLng = parseFloat(process.env.RESTAURANT_LONGITUDE || 0);
              let withinLimit = true;
              try {
                const dist = this._distanceKm(rLat, rLng, parseFloat(lat), parseFloat(lng));
                withinLimit = dist <= (this.deliveryLinkMaxDistanceKm || 70);
              } catch (e) { /* ignore */ }
              if (withinLimit) {
                deliveryInfo = `\n📍 *Localização*: https://www.google.com/maps?q=${lat},${lng}\n`;
              }
            }
          }
        } catch (err) {
          // ignore
        }
      }

      // Verificar se há informações de troco
      let changeInfo = '';
      if (orderData.cliente.troco !== null && orderData.cliente.troco !== undefined) {
        const valorPago = parseFloat(orderData.cliente.troco);
        const total = orderData.total;

        // Se o valor pago for 0, significa que o cliente quer troco sem especificar valor
        if (valorPago === 0) {
          changeInfo = `💵 *Troco*: Cliente deseja troco (valor não especificado)\n`;
        } else if (valorPago > total) {
          const change = valorPago - total;
          changeInfo = `💵 *Troco*: R$ ${change.toFixed(2).replace('.', ',')} (para R$ ${valorPago.toFixed(2).replace('.', ',')})\n`;
        } else if (valorPago === total) {
          changeInfo = `💵 *Troco*: Sem troco (valor exato)\n`;
        }
      }

      // Criar link para o WhatsApp do cliente
      // Garantir que temos um telefone válido (usar apenas whatsappId do cliente)
      try {
        if (!orderData.cliente || !orderData.cliente.telefone) {
          // Tentar preencher apenas do whatsappId do cliente (NUNCA do grupo)
          let possible = orderData.cliente && (orderData.cliente.whatsappId || orderData.cliente.whatsapp);

          // Não usar IDs de grupo (@g.us) como fonte de telefone
          if (possible && String(possible).includes('@g.us')) {
            possible = null;
          }

          if (possible) {
            const digits = String(possible).replace(/\D/g, '');
            console.log('🔧 Telefone extraído do whatsappId:', digits);
            orderData.cliente = orderData.cliente || {};
            orderData.cliente.telefone = digits;
          } else {
            console.warn('⚠️ WhatsappId do cliente não encontrado ou é um grupo (@g.us)');
          }
        }
      } catch (err) {
        console.warn('Falha ao auto-preencher telefone ao enviar para grupo:', err && err.message);
      }

      let clientWhatsAppLink = '';
      if (orderData.cliente && orderData.cliente.telefone) {
        // Remover caracteres não numéricos do telefone
        const cleanPhone = String(orderData.cliente.telefone).replace(/\D/g, '');
        console.log('📱 Telefone do cliente para WhatsApp:', cleanPhone);
        if (cleanPhone.length > 0) clientWhatsAppLink = `📱 *WhatsApp do Cliente*: https://wa.me/${cleanPhone}\n`;
      } else {
        console.warn('⚠️ Telefone do cliente não encontrado em orderData.cliente:', orderData.cliente);
      }

      // Capturar observação do local (se houver) para o grupo
      let addressNoteGroup = '';
      if (orderData.entrega && (orderData.entrega.addressNote || orderData.entrega.observacao)) {
        addressNoteGroup = String(orderData.entrega.addressNote || orderData.entrega.observacao).trim();
      }

      // Montar a mensagem para o grupo de forma controlada (sem indentação extra)
      const groupLines = [];
      groupLines.push(`🍔 *NOVO PEDIDO #${orderData.pedidoId}*`);
      groupLines.push('');
      groupLines.push('━━━━━━━━━━━━━━━━━━━━');
      groupLines.push('📦 *ITENS DO PEDIDO*');
      groupLines.push(itemsList.trim());
      groupLines.push('');
      groupLines.push('━━━━━━━━━━━━━━━━━━━━');
      groupLines.push('💰 *VALORES*');
      groupLines.push(`Subtotal dos itens: R$ ${subtotal.toFixed(2).replace('.', ',')}`);

      if (taxaEntrega > 0) {
        groupLines.push(`Taxa de entrega: R$ ${taxaEntrega.toFixed(2).replace('.', ',')}`);
      } else {
        groupLines.push('Taxa de entrega: R$ 0,00 (retirada)');
      }

      groupLines.push(`*TOTAL DO PEDIDO: R$ ${totalPedido.toFixed(2).replace('.', ',')}*`);
      groupLines.push('');
      groupLines.push('━━━━━━━━━━━━━━━━━━━━');
      groupLines.push('👤 *DADOS DO CLIENTE*');
      groupLines.push(`Nome: ${orderData.cliente.nome}`);
      groupLines.push(`Endereço: ${orderData.cliente.endereco}`);
      groupLines.push(`Pagamento: ${orderData.cliente.pagamento}`);
      if (changeInfo) groupLines.push(changeInfo.trim());
      if (clientWhatsAppLink) groupLines.push(clientWhatsAppLink.trim());
      if (deliveryInfo) groupLines.push(deliveryInfo.trim());
      if (addressNoteGroup) groupLines.push(`📝 Observações do local: ${addressNoteGroup}`);
      groupLines.push('');

      const groupMessage = groupLines.filter(Boolean).join('\n');
      // Enviar a mensagem para o grupo
      await groupChat.sendMessage(groupMessage);
      console.log(`✅ Pedido #${orderData.pedidoId} enviado com sucesso para o grupo de entregas`);
    } catch (error) {
      console.error('❌ Erro ao enviar pedido para o grupo de entregas:', error.message);

      // Mensagens de erro mais específicas
      if (error.message.includes('Evaluation failed')) {
        console.error('💡 Dica: Verifique se:');
        console.error('   1. O WhatsApp Web está conectado (acesse /admin.html)');
        console.error('   2. O ID do grupo está correto:', this.groupId);
        console.error('   3. O bot está adicionado ao grupo do WhatsApp');
        console.error('   4. Você tem permissão para enviar mensagens no grupo');
      }
    }
  }
}

export default WhatsAppService;