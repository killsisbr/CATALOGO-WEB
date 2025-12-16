import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import WhatsAppService from './whatsapp-service.js';
import DeliveryService from './services/delivery-service.js';
import jwt from 'jsonwebtoken';
import { darkenColor, lightenColor } from './helpers/colorHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente do diretório raiz
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Debug: Verificar variáveis de ambiente carregadas
console.log('🔧 Variáveis de ambiente carregadas:');
console.log('   PORT:', process.env.PORT);
console.log('   WHATSAPP_GROUP_ID:', process.env.WHATSAPP_GROUP_ID);
console.log('   ORS_API_KEY:', process.env.ORS_API_KEY ? '✅ Configurada' : '❌ Não configurada');
console.log('   RESTAURANT_LATITUDE:', process.env.RESTAURANT_LATITUDE);
console.log('   RESTAURANT_LONGITUDE:', process.env.RESTAURANT_LONGITUDE);
console.log('   APP_DOMAIN:', process.env.APP_DOMAIN);
console.log('   RESTAURANT_NAME:', process.env.RESTAURANT_NAME);

const app = express();
const PORT = process.env.PORT || 4004;

// Configurar EJS como template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Middleware para parsing de JSON (aumentar limite para suportar imagens base64)
app.use(express.json({ limit: '10mb' }));

// Middleware para parsing de formulários
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// SEGURANÇA
// ============================================================

// Headers de segurança HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitar CSP para permitir inline scripts
  crossOriginEmbedderPolicy: false
}));

// Rate limiting para proteção contra ataques de DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // máximo 200 requisições por IP por janela
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Limiter mais restritivo para criação de pedidos
const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // máximo 10 pedidos por minuto por IP
  message: { error: 'Limite de pedidos atingido. Aguarde um momento.' }
});

// Aplicar rate limiting nas rotas de API
app.use('/api/', apiLimiter);
app.use('/api/pedidos', createOrderLimiter);

console.log('🛡️ Segurança: Helmet e Rate Limiting ativados');

// ============================================================
// AUTENTICAÇÃO ADMIN - SISTEMA DE LOGIN
// ============================================================

// Credenciais do admin (configurar via .env)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'campestre123';

// Endpoint de login admin
app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const jwtSecret = process.env.JWT_SECRET || 'campestre_secret_2024';
      const token = jwt.sign(
        { role: 'admin', user: username },
        jwtSecret,
        { expiresIn: '7d' } // Token válido por 7 dias
      );

      console.log(`✅ Admin login: ${username}`);
      res.json({ success: true, token });
    } else {
      console.log(`❌ Admin login falhou: ${username}`);
      res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Endpoint para verificar token
app.get('/api/admin/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ valid: false });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'campestre_secret_2024';

    try {
      const payload = jwt.verify(token, jwtSecret);
      res.json({ valid: true, user: payload.user, role: payload.role });
    } catch (err) {
      res.json({ valid: false });
    }
  } catch (error) {
    res.json({ valid: false });
  }
});

console.log('🔐 Sistema de autenticação admin configurado');

// Endpoint para receber token JWT e setar cookie de sessão, depois redirecionar para /pedido
app.get('/auth/welcome', (req, res) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.redirect('/pedido');
    }

    const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (err) {
      console.warn('Token invalid or expired in /auth/welcome:', err && err.message);
      return res.redirect('/pedido');
    }

    // Calcular maxAge do cookie com base em exp do token (se disponível)
    // default fallback maxAge: 90 days (~3 months)
    let maxAge = 90 * 24 * 60 * 60 * 1000;
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const expMs = decoded.exp * 1000;
        const remaining = expMs - Date.now();
        if (remaining > 0) maxAge = remaining;
      }
    } catch (e) { /* ignore */ }

    // Setar cookie com token (httpOnly para segurança)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: maxAge,
      sameSite: 'Lax',
      path: '/'
    };

    res.cookie('brutus_token', token, cookieOptions);
    return res.redirect('/pedido');
  } catch (err) {
    console.error('Erro no /auth/welcome:', err && err.message);
    return res.redirect('/pedido');
  }
});

// Endpoint que retorna a sessão (whatsappId) a partir do cookie brute_token
app.get('/api/session', (req, res) => {
  try {
    const raw = req.headers.cookie || '';
    const parts = raw.split(';').map(p => p.trim());
    const tokenPart = parts.find(p => p.startsWith('brutus_token='));
    if (!tokenPart) return res.json({ success: false });
    const token = tokenPart.replace('brutus_token=', '');

    const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';
    try {
      const payload = jwt.verify(token, jwtSecret);
      // Return entire payload so frontend can prefill name/phone/address
      return res.json({ success: true, session: payload });
    } catch (err) {
      return res.json({ success: false });
    }
  } catch (err) {
    return res.json({ success: false });
  }
});

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Tentar usar o nome do produto como base do filename (para facilitar identificação)
    try {
      const ext = path.extname(file.originalname) || '';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

      const sanitize = (s) => {
        if (!s) return 'image';
        // remover acentos
        let name = String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '');
        // fallback para suporte em engines antigas
        name = name.replace(/[\u0300-\u036f]/g, '');
        // manter apenas letras, números, traço e underline
        name = name.replace(/[^a-zA-Z0-9-_\.]/g, '-');
        // remover múltiplos traços
        name = name.replace(/-+/g, '-').replace(/(^-|-$)/g, '');
        // limitar comprimento
        return name.substring(0, 80) || 'image';
      };

      const tryGenerate = async () => {
        try {
          const prodId = req.params && req.params.id ? req.params.id : null;
          if (prodId && db) {
            const row = await db.get('SELECT nome FROM produtos WHERE id = ?', [prodId]);
            if (row && row.nome) {
              const base = sanitize(row.nome);
              // anexar sufixo único para evitar sobrescrita
              return cb(null, `${base}-${uniqueSuffix}${ext}`);
            }
          }
        } catch (err) {
          // ignore e cair para fallback
          console.warn('Não foi possível obter nome do produto para naming:', err && err.message);
        }
        // Fallback: nome genérico com campo e sufixo
        return cb(null, file.fieldname + '-' + uniqueSuffix + ext);
      };

      // executar
      tryGenerate();
    } catch (err) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Limite de 5MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos!'));
    }
  }
});

// Diretório para armazenar imagens
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Servir arquivos de upload
app.use('/uploads', express.static(uploadDir));

// Banco de dados será inicializado depois
let db;
let whatsappService;
let deliveryService;

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pedido.html'));
});

// Rota para pedidos via WhatsApp
app.get('/pedido', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pedido.html'));
});

// Rota para página de personalização
app.get('/custom', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/custom.html'));
});

// Rota para página de detalhes do pedido
app.get('/pedido/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pedido-detalhe.html'));
});

// Endpoint para pegar produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await db.all('SELECT * FROM produtos');
    console.log(`GET /api/produtos: returning ${produtos.length} produtos`);
    res.json(produtos);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Endpoint para obter a chave da API do Google Maps
app.get('/api/config/google-maps-key', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'SuaChaveDaApiAqui';
  res.json({ apiKey });
});

// Estado do robô (em memória por enquanto)
let robotEnabled = false;

// Endpoint para verificar status do robô
app.get('/api/robot/status', (req, res) => {
  res.json({
    success: true,
    enabled: robotEnabled
  });
});

// Endpoint para ligar/desligar robô
app.post('/api/robot/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    robotEnabled = enabled === true;

    console.log(`🤖 Robô ${robotEnabled ? 'LIGADO' : 'DESLIGADO'}`);

    res.json({
      success: true,
      enabled: robotEnabled,
      message: robotEnabled ? 'Robô ativado' : 'Robô desativado'
    });
  } catch (error) {
    console.error('Erro ao alternar robô:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao alternar status do robô'
    });
  }
});

// Endpoint para calcular valor da entrega
app.post('/api/entrega/calcular', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const result = await deliveryService.processDelivery({
      lat: parseFloat(latitude),
      lng: parseFloat(longitude)
    });

    res.json(result);
  } catch (error) {
    console.error('Erro ao calcular entrega:', error);
    res.status(500).json({
      error: 'Erro ao calcular valor da entrega'
    });
  }
});

// Novo endpoint para converter endereço em coordenadas
app.post('/api/entrega/endereco-coordenadas', async (req, res) => {
  try {
    const { endereco } = req.body;

    if (!endereco) {
      return res.status(400).json({
        success: false,
        error: 'Endereço não informado'
      });
    }

    const coordinates = await deliveryService.converterEnderecoEmCoordenadas(endereco);

    if (!coordinates) {
      return res.status(400).json({
        success: false,
        error: 'Não foi possível encontrar as coordenadas para o endereço informado. Por favor, verifique se o endereço está correto.'
      });
    }

    // Verificar se está em Imbituva
    const cidadeValida = await deliveryService.verificarSeEstaEmImbituva(coordinates.lat, coordinates.lng);

    if (!cidadeValida) {
      return res.status(400).json({
        success: false,
        error: "❌ *Atendemos apenas em Imbituva!*\n\nSua localização não está em Imbituva, PR. Por favor, digite um endereço em Imbituva ou verifique se sua localização está correta.\n\n_Exemplo: Rua das Flores, 123, Centro, Imbituva_"
      });
    }

    res.json({
      success: true,
      coordinates: coordinates
    });
  } catch (error) {
    console.error('Erro ao converter endereço em coordenadas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao processar o endereço. Por favor, tente novamente.'
    });
  }
});

// Novo endpoint para calcular taxa de entrega com base no endereço
app.post('/api/entrega/calcular-taxa', async (req, res) => {
  try {
    const { endereco } = req.body;

    if (!endereco) {
      return res.status(400).json({
        success: false,
        error: 'Endereço não informado'
      });
    }

    const result = await deliveryService.calcularTaxaPorEndereco(endereco);

    res.json(result);
  } catch (error) {
    console.error('Erro ao calcular taxa de entrega:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao calcular taxa de entrega. Por favor, tente novamente.'
    });
  }
});

// Endpoint para criar pedido
app.post('/api/pedidos', async (req, res) => {
  try {
    const { cliente, itens, total, entrega } = req.body;

    console.log('📥 Dados recebidos no backend - cliente:', {
      whatsappId: cliente.whatsappId,
      telefone: cliente.telefone,
      nome: cliente.nome
    });

    // Optional: enforce geolocation usage if configured via env var
    const enforceGeolocation = process.env.ENFORCE_GEOLOCATION_CALCULATION === 'true';
    if (enforceGeolocation) {
      if (!entrega || !entrega.coordenadas || (!entrega.price && entrega.price !== 0)) {
        return res.status(400).json({ success: false, error: 'Geolocation required to calculate delivery. Use the "Calcular frete" button.' });
      }
    }

    // Verificar se o telefone está na blacklist
    let isBlacklisted = 0;
    try {
      const telefoneNormalizado = String(cliente.telefone).replace(/\D/g, '');
      const blacklistItem = await db.get(
        `SELECT * FROM blacklist WHERE REPLACE(REPLACE(REPLACE(telefone, '-', ''), ' ', ''), '(', '') LIKE ?`,
        [`%${telefoneNormalizado}%`]
      );
      if (blacklistItem) {
        isBlacklisted = 1;
        console.log('⚠️ PEDIDO DE NÚMERO NA BLACKLIST:', cliente.telefone, '-', blacklistItem.motivo);
      }
    } catch (e) {
      console.warn('Erro ao verificar blacklist:', e.message);
    }

    // Inserir pedido
    const nowIso = new Date().toISOString();
    const isPickup = cliente.isPickup ? 1 : 0;
    // Salvar whatsapp_id completo (ex: 5541998765432@c.us) e também o telefone limpo
    const whatsappIdCompleto = cliente.whatsappId || null;
    const result = await db.run(
      'INSERT INTO pedidos (cliente_nome, cliente_telefone, cliente_endereco, forma_pagamento, total, distancia, valor_entrega, coordenadas_cliente, observacao_entrega, data, is_pickup, is_blacklisted, whatsapp_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [cliente.nome, cliente.telefone, cliente.endereco, cliente.pagamento, total, entrega?.distancia || null, (entrega?.price || entrega?.valor) || null, entrega?.coordenadas ? JSON.stringify(entrega.coordenadas) : null, (entrega && (entrega.addressNote || entrega.observacao)) || null, nowIso, isPickup, isBlacklisted, whatsappIdCompleto]
    );

    const pedidoId = result.lastID;

    // Inserir itens do pedido
    for (const item of itens) {
      const adicionais = Array.isArray(item.adicionais) ? item.adicionais : [];
      const buffet = Array.isArray(item.buffet) ? item.buffet : [];
      const acaiData = item.acaiData || null;
      const observacao = item.observacao || '';

      // Combinar adicionais, buffet e açaí para salvar
      const todosExtras = {
        adicionais: adicionais,
        buffet: buffet,
        acaiData: acaiData
      };

      await db.run(
        'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, adicionais, observacao) VALUES (?, ?, ?, ?, ?, ?)',
        [pedidoId, item.produto.id, item.quantidade, item.produto.preco, JSON.stringify(todosExtras), observacao]
      );
    }

    // Se houver um ID do WhatsApp, enviar resumo do pedido (somente se robô estiver ligado)
    if (cliente.whatsappId) {
      if (robotEnabled) {
        // Enviar notificação via WhatsApp (em background)
        setImmediate(async () => {
          try {
            try {
              await whatsappService.sendOrderSummaryToId(cliente.whatsappId, {
                pedidoId,
                cliente,
                itens,
                total,
                entrega
              });
            } catch (error) {
              console.error('Erro ao enviar notificação via WhatsApp:', error);
            }
          } catch (error) {
            console.error('Erro ao enviar notificação via WhatsApp:', error);
          }
        });
      } else {
        console.log('🤖 Robô desligado - Mensagem para cliente NÃO enviada');
      }
    }

    // Enviar pedido para o grupo de entregas (em background) - somente se robô estiver ligado
    if (robotEnabled) {
      setImmediate(async () => {
        try {
          // Passar as informações completas do cliente, incluindo pagamento e troco
          await whatsappService.sendOrderToDeliveryGroup({
            pedidoId,
            cliente: {
              ...cliente,
              pagamento: cliente.pagamento,
              troco: cliente.troco
            },
            itens,
            total,
            entrega
          });
        } catch (error) {
          console.error('Erro ao enviar pedido para o grupo de entregas:', error);
        }
      });
    } else {
      console.log('🤖 Robô desligado - Mensagem para grupo NÃO enviada');
    }

    // Gerar JWT para guardar informações do cliente no browser (cookie httpOnly)
    try {
      const jwtSecret = process.env.JWT_SECRET || 'change_this_secret_in_env';
      // Incluir informações de endereço/entrega para evitar recálculo futuro
      const payload = {
        whatsappId: cliente.whatsappId || null,
        telefone: cliente.telefone || null,
        nome: cliente.nome || null,
        // último endereço conhecido (prefere o campo do cliente, senão dados de entrega)
        endereco: cliente.endereco || (entrega && (entrega.address || entrega.endereco)) || null,
        // taxa de entrega (price ou valor) — será usada para lembrar sem recálculo
        deliveryFee: (entrega && (entrega.price ?? entrega.valor)) ?? null,
        // distância (se disponível)
        distancia: entrega?.distancia ?? null,
        // coordenadas do último endereço (se disponíveis)
        coordenadas: entrega?.coordenadas ?? entrega?.coordinates ?? null
      };
      // Expira em 90 dias
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '90d' });

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 90 * 24 * 60 * 60 * 1000,
        sameSite: 'Lax',
        path: '/'
      };

      // Setar cookie para uso em visitas futuras
      res.cookie('brutus_token', token, cookieOptions);
      // Log seguro: confirmar que o cookie foi setado (não logar o token em si)
      console.log(`🔐 Cookie 'brutus_token' set for whatsappId=${payload.whatsappId || 'unknown'}; maxAge=${cookieOptions.maxAge}ms`);

      // Retornar apenas confirmação (token está no cookie httpOnly)
      res.json({
        success: true,
        pedidoId: pedidoId,
        message: 'Pedido criado com sucesso!'
      });
    } catch (err) {
      console.warn('Não foi possível gerar JWT para o cliente:', err && err.message);
      res.json({
        success: true,
        pedidoId: pedidoId,
        message: 'Pedido criado com sucesso!'
      });
    }
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

// Endpoint para buscar pedidos com itens
app.get('/api/pedidos', async (req, res) => {
  try {
    // Buscar pedidos - p.* já inclui cliente_telefone e whatsapp_id da tabela pedidos
    const pedidos = await db.all(`
      SELECT p.*
      FROM pedidos p
      ORDER BY p.data DESC
    `);

    // Buscar itens de cada pedido
    for (const pedido of pedidos) {
      const itens = await db.all(`
        SELECT pi.*, pr.nome as produto_nome
        FROM pedido_itens pi
        LEFT JOIN produtos pr ON pi.produto_id = pr.id
        WHERE pi.pedido_id = ?
      `, [pedido.id]);
      // Parse adicionais JSON
      pedido.itens = itens.map(i => ({
        ...i,
        adicionais: i.adicionais ? (typeof i.adicionais === 'string' ? JSON.parse(i.adicionais) : i.adicionais) : []
      }));

      // Adicionar status (por padrão, 'pending' para pedidos novos)
      pedido.status = pedido.status || 'pending';
    }

    res.json(pedidos);
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// Endpoint para buscar um pedido específico pelo ID
app.get('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar pedido - p.* já inclui cliente_telefone da tabela pedidos
    const pedido = await db.get(`
      SELECT p.*
      FROM pedidos p
      WHERE p.id = ?
    `, [id]);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Buscar itens do pedido
    const itens = await db.all(`
      SELECT pi.*, pr.nome as produto_nome
      FROM pedido_itens pi
      LEFT JOIN produtos pr ON pi.produto_id = pr.id
      WHERE pi.pedido_id = ?
    `, [id]);
    pedido.itens = itens.map(i => ({
      ...i,
      adicionais: i.adicionais ? (typeof i.adicionais === 'string' ? JSON.parse(i.adicionais) : i.adicionais) : []
    }));

    // Adicionar status (por padrão, 'pending' para pedidos novos)
    pedido.status = pedido.status || 'pending';

    res.json(pedido);
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// ============================================================
// ENDPOINTS DE BLACKLIST (GOLPISTAS)
// ============================================================

// Adicionar telefone à blacklist
app.post('/api/blacklist', async (req, res) => {
  try {
    const { telefone, motivo } = req.body;

    if (!telefone) {
      return res.status(400).json({ success: false, error: 'Telefone é obrigatório' });
    }

    const telefoneNormalizado = String(telefone).replace(/\D/g, '');

    // Verificar se já existe
    const existente = await db.get(
      'SELECT * FROM blacklist WHERE REPLACE(REPLACE(REPLACE(telefone, "-", ""), " ", ""), "(", "") LIKE ?',
      [`%${telefoneNormalizado}%`]
    );

    if (existente) {
      return res.json({ success: true, message: 'Telefone já está na blacklist', id: existente.id });
    }

    // Inserir na blacklist
    const result = await db.run(
      'INSERT INTO blacklist (telefone, motivo, data_inclusao) VALUES (?, ?, ?)',
      [telefoneNormalizado, motivo || 'Golpe', new Date().toISOString()]
    );

    console.log('⚠️ Telefone adicionado à blacklist:', telefoneNormalizado, '-', motivo);

    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error('Erro ao adicionar à blacklist:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar à blacklist' });
  }
});

// Listar blacklist
app.get('/api/blacklist', async (req, res) => {
  try {
    const lista = await db.all('SELECT * FROM blacklist ORDER BY data_inclusao DESC');
    res.json({ success: true, lista });
  } catch (error) {
    console.error('Erro ao buscar blacklist:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar blacklist' });
  }
});

// Remover da blacklist
app.delete('/api/blacklist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM blacklist WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover da blacklist:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover da blacklist' });
  }
});

// Marcar pedido como blacklisted
app.put('/api/pedidos/:id/blacklist', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_blacklisted } = req.body;

    await db.run('UPDATE pedidos SET is_blacklisted = ? WHERE id = ?', [is_blacklisted ? 1 : 0, id]);

    console.log(`⚠️ Pedido #${id} marcado como blacklisted:`, is_blacklisted);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar pedido como blacklisted:', error);
    res.status(500).json({ success: false, error: 'Erro ao marcar pedido' });
  }
});

// Atualizar status do pedido
app.put('/api/pedidos/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.run('UPDATE pedidos SET status = ? WHERE id = ?', [status, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar status' });
  }
});

// ============================================================
// ENDPOINTS PARA GERENCIAR ITENS DO PEDIDO
// ============================================================

// Função auxiliar para recalcular total do pedido
async function recalcularTotalPedido(pedidoId) {
  const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = ?', [pedidoId]);
  let total = 0;
  for (const item of itens) {
    let precoItem = parseFloat(item.preco_unitario || 0);
    // Adicionar preço dos adicionais
    if (item.adicionais) {
      try {
        const extras = typeof item.adicionais === 'string' ? JSON.parse(item.adicionais) : item.adicionais;
        const adicionais = extras.adicionais || extras || [];
        if (Array.isArray(adicionais)) {
          precoItem += adicionais.reduce((acc, a) => acc + parseFloat(a.preco || a.price || 0), 0);
        }
      } catch (e) { /* ignorar */ }
    }
    total += precoItem * (item.quantidade || 1);
  }
  // Buscar valor de entrega
  const pedido = await db.get('SELECT valor_entrega FROM pedidos WHERE id = ?', [pedidoId]);
  total += parseFloat(pedido?.valor_entrega || 0);

  await db.run('UPDATE pedidos SET total = ? WHERE id = ?', [total, pedidoId]);
  return total;
}

// Adicionar item ao pedido
app.post('/api/pedidos/:pedidoId/itens', async (req, res) => {
  try {
    const { pedidoId } = req.params;
    const { produto_id, quantidade, preco_unitario, observacao } = req.body;

    const result = await db.run(
      'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, observacao) VALUES (?, ?, ?, ?, ?)',
      [pedidoId, produto_id, quantidade || 1, preco_unitario, observacao || '']
    );

    // Recalcular total
    const novoTotal = await recalcularTotalPedido(pedidoId);

    console.log(`✅ Item adicionado ao pedido #${pedidoId} - Produto ID: ${produto_id}`);
    res.json({ success: true, itemId: result.lastID, novoTotal });
  } catch (error) {
    console.error('Erro ao adicionar item:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar item' });
  }
});

// Atualizar quantidade de um item
app.put('/api/pedidos/:pedidoId/itens/:itemId', async (req, res) => {
  try {
    const { pedidoId, itemId } = req.params;
    const { quantidade } = req.body;

    if (quantidade < 1) {
      return res.status(400).json({ success: false, error: 'Quantidade mínima é 1' });
    }

    await db.run('UPDATE pedido_itens SET quantidade = ? WHERE id = ? AND pedido_id = ?', [quantidade, itemId, pedidoId]);

    // Recalcular total
    const novoTotal = await recalcularTotalPedido(pedidoId);

    console.log(`📝 Quantidade atualizada - Item #${itemId} do Pedido #${pedidoId}: ${quantidade}`);
    res.json({ success: true, novoTotal });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar item' });
  }
});

// Remover item do pedido
app.delete('/api/pedidos/:pedidoId/itens/:itemId', async (req, res) => {
  try {
    const { pedidoId, itemId } = req.params;

    // Verificar se é o último item
    const countItens = await db.get('SELECT COUNT(*) as count FROM pedido_itens WHERE pedido_id = ?', [pedidoId]);
    if (countItens.count <= 1) {
      return res.status(400).json({ success: false, error: 'Não é possível remover o último item do pedido' });
    }

    await db.run('DELETE FROM pedido_itens WHERE id = ? AND pedido_id = ?', [itemId, pedidoId]);

    // Recalcular total
    const novoTotal = await recalcularTotalPedido(pedidoId);

    console.log(`🗑️ Item #${itemId} removido do Pedido #${pedidoId}`);
    res.json({ success: true, novoTotal });
  } catch (error) {
    console.error('Erro ao remover item:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover item' });
  }
});

// Endpoint para obter estatísticas de produtos mais vendidos
app.get('/api/estatisticas/produtos-mais-vendidos', async (req, res) => {
  try {
    const produtosMaisVendidos = await db.all(`
      SELECT 
        pr.nome as produto_nome,
        pr.categoria as produto_categoria,
        SUM(pi.quantidade) as total_vendido,
        SUM(pi.quantidade * pi.preco_unitario) as valor_total
      FROM pedido_itens pi
      JOIN produtos pr ON pi.produto_id = pr.id
      JOIN pedidos p ON pi.pedido_id = p.id
      WHERE p.status != 'archived'
      GROUP BY pi.produto_id, pr.nome, pr.categoria
      ORDER BY total_vendido DESC
      LIMIT 10
    `);

    res.json(produtosMaisVendidos);
  } catch (error) {
    console.error('Erro ao buscar produtos mais vendidos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos mais vendidos' });
  }
});

// Endpoint para obter estatísticas de melhores clientes
app.get('/api/estatisticas/melhores-clientes', async (req, res) => {
  try {
    const melhoresClientes = await db.all(`
      SELECT 
        c.nome as cliente_nome,
        c.telefone as cliente_telefone,
        COUNT(p.id) as total_pedidos,
        SUM(p.total) as valor_total_gasto
      FROM clientes c
      JOIN pedidos p ON c.nome = p.cliente_nome
      WHERE p.status != 'archived'
      GROUP BY c.id, c.nome, c.telefone
      ORDER BY valor_total_gasto DESC
      LIMIT 10
    `);

    res.json(melhoresClientes);
  } catch (error) {
    console.error('Erro ao buscar melhores clientes:', error);
    res.status(500).json({ error: 'Erro ao buscar melhores clientes' });
  }
});

// Endpoint para obter estatísticas de valores de entrega
app.get('/api/estatisticas/valores-entrega', async (req, res) => {
  try {
    const valoresEntrega = await db.all(`
      SELECT 
        SUM(valor_entrega) as total_valor_entregas,
        AVG(valor_entrega) as media_valor_entregas,
        COUNT(*) as total_entregas
      FROM pedidos
      WHERE valor_entrega IS NOT NULL AND status != 'archived'
    `);

    res.json(valoresEntrega[0] || { total_valor_entregas: 0, media_valor_entregas: 0, total_entregas: 0 });
  } catch (error) {
    console.error('Erro ao buscar valores de entrega:', error);
    res.status(500).json({ error: 'Erro ao buscar valores de entrega' });
  }
});

// Endpoint para obter estatísticas gerais
app.get('/api/estatisticas/gerais', async (req, res) => {
  try {
    const estatisticasGerais = await db.all(`
      SELECT 
        COUNT(*) as total_pedidos,
        SUM(total) as valor_total_pedidos,
        AVG(total) as ticket_medio,
        COUNT(DISTINCT cliente_nome) as total_clientes
      FROM pedidos
      WHERE status != 'archived'
    `);

    res.json(estatisticasGerais[0] || { total_pedidos: 0, valor_total_pedidos: 0, ticket_medio: 0, total_clientes: 0 });
  } catch (error) {
    console.error('Erro ao buscar estatísticas gerais:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas gerais' });
  }
});

// Endpoints para gerenciar categorias
app.get('/api/categorias', async (req, res) => {
  try {
    const categorias = await db.all('SELECT * FROM categorias ORDER BY nome');
    res.json({ success: true, categorias });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar categorias' });
  }
});

app.post('/api/categorias', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || String(nome).trim() === '') return res.status(400).json({ success: false, error: 'Nome inválido' });
    const result = await db.run('INSERT INTO categorias (nome) VALUES (?)', [String(nome).trim()]);
    res.json({ success: true, categoria: { id: result.lastID, nome: String(nome).trim() } });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ success: false, error: 'Erro ao criar categoria' });
  }
});

app.delete('/api/categorias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Antes de remover, setar produtos com essa categoria para NULL
    const categoria = await db.get('SELECT * FROM categorias WHERE id = ?', [id]);
    if (!categoria) return res.status(404).json({ success: false, error: 'Categoria não encontrada' });
    await db.run('UPDATE produtos SET categoria = NULL WHERE categoria = ?', [categoria.nome]);
    await db.run('DELETE FROM categorias WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir categoria' });
  }
});

// ============================================================
// ENDPOINTS PARA GERENCIAR BUFFET DO DIA
// ============================================================

// Listar itens do buffet (apenas ativos)
app.get('/api/buffet', async (req, res) => {
  try {
    const itens = await db.all('SELECT * FROM buffet_dia WHERE ativo = 1 ORDER BY nome');
    res.json({ success: true, itens });
  } catch (error) {
    console.error('Erro ao buscar buffet:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar itens do buffet' });
  }
});

// Listar todos os itens do buffet (incluindo inativos) - para admin
app.get('/api/buffet/todos', async (req, res) => {
  try {
    const itens = await db.all('SELECT * FROM buffet_dia ORDER BY ativo DESC, nome');
    res.json({ success: true, itens });
  } catch (error) {
    console.error('Erro ao buscar todos os itens do buffet:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar itens do buffet' });
  }
});

// Adicionar item ao buffet
app.post('/api/buffet', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || String(nome).trim() === '') {
      return res.status(400).json({ success: false, error: 'Nome do item é obrigatório' });
    }
    const result = await db.run('INSERT INTO buffet_dia (nome, ativo) VALUES (?, 1)', [String(nome).trim()]);
    res.json({ success: true, item: { id: result.lastID, nome: String(nome).trim(), ativo: 1 } });
  } catch (error) {
    console.error('Erro ao adicionar item ao buffet:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar item ao buffet' });
  }
});

// Atualizar item do buffet
app.put('/api/buffet/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, ativo } = req.body;

    const item = await db.get('SELECT * FROM buffet_dia WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item não encontrado' });
    }

    const novoNome = nome !== undefined ? String(nome).trim() : item.nome;
    const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : item.ativo;

    await db.run('UPDATE buffet_dia SET nome = ?, ativo = ? WHERE id = ?', [novoNome, novoAtivo, id]);
    res.json({ success: true, item: { id: parseInt(id), nome: novoNome, ativo: novoAtivo } });
  } catch (error) {
    console.error('Erro ao atualizar item do buffet:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar item do buffet' });
  }
});

// Toggle ativo/inativo do item do buffet
app.patch('/api/buffet/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.get('SELECT * FROM buffet_dia WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item não encontrado' });
    }

    const novoAtivo = item.ativo ? 0 : 1;
    await db.run('UPDATE buffet_dia SET ativo = ? WHERE id = ?', [novoAtivo, id]);
    res.json({ success: true, item: { ...item, ativo: novoAtivo } });
  } catch (error) {
    console.error('Erro ao alternar status do item:', error);
    res.status(500).json({ success: false, error: 'Erro ao alternar status do item' });
  }
});

// Remover item do buffet
app.delete('/api/buffet/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.get('SELECT * FROM buffet_dia WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item não encontrado' });
    }

    await db.run('DELETE FROM buffet_dia WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover item do buffet:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover item do buffet' });
  }
});

// ============================================================
// ENDPOINTS PARA SISTEMA DE AÇAÍ
// ============================================================

// --- TAMANHOS DE AÇAÍ ---

// Listar tamanhos ativos
app.get('/api/acai/tamanhos', async (req, res) => {
  try {
    const tamanhos = await db.all('SELECT * FROM acai_tamanhos WHERE ativo = 1 ORDER BY ordem, nome');
    res.json({ success: true, tamanhos });
  } catch (error) {
    console.error('Erro ao buscar tamanhos de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar tamanhos' });
  }
});

// Listar todos os tamanhos (admin)
app.get('/api/acai/tamanhos/todos', async (req, res) => {
  try {
    const tamanhos = await db.all('SELECT * FROM acai_tamanhos ORDER BY ativo DESC, ordem, nome');
    res.json({ success: true, tamanhos });
  } catch (error) {
    console.error('Erro ao buscar todos os tamanhos de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar tamanhos' });
  }
});

// Adicionar tamanho
app.post('/api/acai/tamanhos', async (req, res) => {
  try {
    const { nome, preco, adicionais_gratis, ordem } = req.body;
    if (!nome || String(nome).trim() === '') {
      return res.status(400).json({ success: false, error: 'Nome do tamanho é obrigatório' });
    }
    if (preco === undefined || isNaN(parseFloat(preco))) {
      return res.status(400).json({ success: false, error: 'Preço é obrigatório' });
    }

    const result = await db.run(
      'INSERT INTO acai_tamanhos (nome, preco, adicionais_gratis, ordem, ativo) VALUES (?, ?, ?, ?, 1)',
      [String(nome).trim(), parseFloat(preco), parseInt(adicionais_gratis) || 0, parseInt(ordem) || 0]
    );

    res.json({
      success: true,
      tamanho: {
        id: result.lastID,
        nome: String(nome).trim(),
        preco: parseFloat(preco),
        adicionais_gratis: parseInt(adicionais_gratis) || 0,
        ordem: parseInt(ordem) || 0,
        ativo: 1
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar tamanho de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar tamanho' });
  }
});

// Atualizar tamanho
app.put('/api/acai/tamanhos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, preco, adicionais_gratis, ordem, ativo } = req.body;

    const tamanho = await db.get('SELECT * FROM acai_tamanhos WHERE id = ?', [id]);
    if (!tamanho) {
      return res.status(404).json({ success: false, error: 'Tamanho não encontrado' });
    }

    const novoNome = nome !== undefined ? String(nome).trim() : tamanho.nome;
    const novoPreco = preco !== undefined ? parseFloat(preco) : tamanho.preco;
    const novosAdicionaisGratis = adicionais_gratis !== undefined ? parseInt(adicionais_gratis) : tamanho.adicionais_gratis;
    const novaOrdem = ordem !== undefined ? parseInt(ordem) : tamanho.ordem;
    const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : tamanho.ativo;

    await db.run(
      'UPDATE acai_tamanhos SET nome = ?, preco = ?, adicionais_gratis = ?, ordem = ?, ativo = ? WHERE id = ?',
      [novoNome, novoPreco, novosAdicionaisGratis, novaOrdem, novoAtivo, id]
    );

    res.json({
      success: true,
      tamanho: {
        id: parseInt(id),
        nome: novoNome,
        preco: novoPreco,
        adicionais_gratis: novosAdicionaisGratis,
        ordem: novaOrdem,
        ativo: novoAtivo
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar tamanho de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar tamanho' });
  }
});

// Toggle ativo/inativo do tamanho
app.patch('/api/acai/tamanhos/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const tamanho = await db.get('SELECT * FROM acai_tamanhos WHERE id = ?', [id]);
    if (!tamanho) {
      return res.status(404).json({ success: false, error: 'Tamanho não encontrado' });
    }

    const novoAtivo = tamanho.ativo ? 0 : 1;
    await db.run('UPDATE acai_tamanhos SET ativo = ? WHERE id = ?', [novoAtivo, id]);
    res.json({ success: true, tamanho: { ...tamanho, ativo: novoAtivo } });
  } catch (error) {
    console.error('Erro ao alternar status do tamanho:', error);
    res.status(500).json({ success: false, error: 'Erro ao alternar status' });
  }
});

// Remover tamanho
app.delete('/api/acai/tamanhos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tamanho = await db.get('SELECT * FROM acai_tamanhos WHERE id = ?', [id]);
    if (!tamanho) {
      return res.status(404).json({ success: false, error: 'Tamanho não encontrado' });
    }

    await db.run('DELETE FROM acai_tamanhos WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover tamanho de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover tamanho' });
  }
});

// --- ADICIONAIS DE AÇAÍ ---

// Listar adicionais ativos
app.get('/api/acai/adicionais', async (req, res) => {
  try {
    const adicionais = await db.all('SELECT * FROM acai_adicionais WHERE ativo = 1 ORDER BY categoria, ordem, nome');
    res.json({ success: true, adicionais });
  } catch (error) {
    console.error('Erro ao buscar adicionais de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar adicionais' });
  }
});

// Listar todos os adicionais (admin)
app.get('/api/acai/adicionais/todos', async (req, res) => {
  try {
    const adicionais = await db.all('SELECT * FROM acai_adicionais ORDER BY ativo DESC, categoria, ordem, nome');
    res.json({ success: true, adicionais });
  } catch (error) {
    console.error('Erro ao buscar todos os adicionais de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar adicionais' });
  }
});

// Adicionar adicional
app.post('/api/acai/adicionais', async (req, res) => {
  try {
    const { nome, preco, categoria, ordem } = req.body;
    if (!nome || String(nome).trim() === '') {
      return res.status(400).json({ success: false, error: 'Nome do adicional é obrigatório' });
    }

    const result = await db.run(
      'INSERT INTO acai_adicionais (nome, preco, categoria, ordem, ativo) VALUES (?, ?, ?, ?, 1)',
      [String(nome).trim(), parseFloat(preco) || 0, String(categoria || 'Geral').trim(), parseInt(ordem) || 0]
    );

    res.json({
      success: true,
      adicional: {
        id: result.lastID,
        nome: String(nome).trim(),
        preco: parseFloat(preco) || 0,
        categoria: String(categoria || 'Geral').trim(),
        ordem: parseInt(ordem) || 0,
        ativo: 1
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar adicional de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar adicional' });
  }
});

// Atualizar adicional
app.put('/api/acai/adicionais/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, preco, categoria, ordem, ativo } = req.body;

    const adicional = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
    if (!adicional) {
      return res.status(404).json({ success: false, error: 'Adicional não encontrado' });
    }

    const novoNome = nome !== undefined ? String(nome).trim() : adicional.nome;
    const novoPreco = preco !== undefined ? parseFloat(preco) : adicional.preco;
    const novaCategoria = categoria !== undefined ? String(categoria).trim() : adicional.categoria;
    const novaOrdem = ordem !== undefined ? parseInt(ordem) : adicional.ordem;
    const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : adicional.ativo;

    await db.run(
      'UPDATE acai_adicionais SET nome = ?, preco = ?, categoria = ?, ordem = ?, ativo = ? WHERE id = ?',
      [novoNome, novoPreco, novaCategoria, novaOrdem, novoAtivo, id]
    );

    res.json({
      success: true,
      adicional: {
        id: parseInt(id),
        nome: novoNome,
        preco: novoPreco,
        categoria: novaCategoria,
        ordem: novaOrdem,
        ativo: novoAtivo
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar adicional de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar adicional' });
  }
});

// Toggle ativo/inativo do adicional
app.patch('/api/acai/adicionais/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const adicional = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
    if (!adicional) {
      return res.status(404).json({ success: false, error: 'Adicional não encontrado' });
    }

    const novoAtivo = adicional.ativo ? 0 : 1;
    await db.run('UPDATE acai_adicionais SET ativo = ? WHERE id = ?', [novoAtivo, id]);
    res.json({ success: true, adicional: { ...adicional, ativo: novoAtivo } });
  } catch (error) {
    console.error('Erro ao alternar status do adicional:', error);
    res.status(500).json({ success: false, error: 'Erro ao alternar status' });
  }
});

// Remover adicional
app.delete('/api/acai/adicionais/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const adicional = await db.get('SELECT * FROM acai_adicionais WHERE id = ?', [id]);
    if (!adicional) {
      return res.status(404).json({ success: false, error: 'Adicional não encontrado' });
    }

    await db.run('DELETE FROM acai_adicionais WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover adicional de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover adicional' });
  }
});

// --- CONFIGURAÇÕES DO AÇAÍ ---

// Buscar configurações
app.get('/api/acai/config', async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM acai_config WHERE id = 1');
    res.json({ success: true, config: config || { habilitado: 1, categoria_nome: 'Açaí' } });
  } catch (error) {
    console.error('Erro ao buscar configurações de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar configurações' });
  }
});

// Atualizar configurações
app.put('/api/acai/config', async (req, res) => {
  try {
    const { habilitado, categoria_nome } = req.body;

    // Verificar se existe registro
    const existe = await db.get('SELECT * FROM acai_config WHERE id = 1');

    if (existe) {
      await db.run(
        'UPDATE acai_config SET habilitado = ?, categoria_nome = ? WHERE id = 1',
        [habilitado !== undefined ? (habilitado ? 1 : 0) : existe.habilitado, categoria_nome || existe.categoria_nome]
      );
    } else {
      await db.run(
        'INSERT INTO acai_config (id, habilitado, categoria_nome) VALUES (1, ?, ?)',
        [habilitado !== undefined ? (habilitado ? 1 : 0) : 1, categoria_nome || 'Açaí']
      );
    }

    const config = await db.get('SELECT * FROM acai_config WHERE id = 1');
    res.json({ success: true, config });
  } catch (error) {
    console.error('Erro ao atualizar configurações de açaí:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar configurações' });
  }
});

// --- CONFIGURAÇÃO DE ADICIONAIS GRÁTIS POR PRODUTO ---

// Buscar configuração de um produto específico
app.get('/api/acai/produto-config/:produtoId', async (req, res) => {
  try {
    const { produtoId } = req.params;
    const config = await db.get('SELECT * FROM acai_produto_config WHERE produto_id = ?', [produtoId]);
    res.json({ success: true, config: config || { produto_id: parseInt(produtoId), adicionais_gratis: 0 } });
  } catch (error) {
    console.error('Erro ao buscar configuração do produto:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar configuração' });
  }
});

// Listar todas as configurações de produtos (para admin)
app.get('/api/acai/produto-config', async (req, res) => {
  try {
    const configs = await db.all(`
      SELECT apc.*, p.nome as produto_nome, p.preco as produto_preco, p.categoria as produto_categoria
      FROM acai_produto_config apc
      JOIN produtos p ON p.id = apc.produto_id
      ORDER BY p.nome
    `);
    res.json({ success: true, configs });
  } catch (error) {
    console.error('Erro ao listar configurações de produtos:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar configurações' });
  }
});

// Criar ou atualizar configuração de produto
app.post('/api/acai/produto-config', async (req, res) => {
  try {
    const { produto_id, adicionais_gratis } = req.body;

    if (!produto_id) {
      return res.status(400).json({ success: false, error: 'ID do produto é obrigatório' });
    }

    // Verificar se produto existe
    const produto = await db.get('SELECT * FROM produtos WHERE id = ?', [produto_id]);
    if (!produto) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    }

    // Verificar se já existe configuração
    const existente = await db.get('SELECT * FROM acai_produto_config WHERE produto_id = ?', [produto_id]);

    if (existente) {
      await db.run(
        'UPDATE acai_produto_config SET adicionais_gratis = ? WHERE produto_id = ?',
        [parseInt(adicionais_gratis) || 0, produto_id]
      );
    } else {
      await db.run(
        'INSERT INTO acai_produto_config (produto_id, adicionais_gratis) VALUES (?, ?)',
        [produto_id, parseInt(adicionais_gratis) || 0]
      );
    }

    const config = await db.get('SELECT * FROM acai_produto_config WHERE produto_id = ?', [produto_id]);
    res.json({ success: true, config });
  } catch (error) {
    console.error('Erro ao salvar configuração do produto:', error);
    res.status(500).json({ success: false, error: 'Erro ao salvar configuração' });
  }
});

// Remover configuração de produto
app.delete('/api/acai/produto-config/:produtoId', async (req, res) => {
  try {
    const { produtoId } = req.params;
    await db.run('DELETE FROM acai_produto_config WHERE produto_id = ?', [produtoId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover configuração do produto:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover configuração' });
  }
});

// Endpoint para buscar informações do cliente pelo WhatsApp ID
app.get('/api/clientes/:whatsappId', async (req, res) => {
  try {
    const { whatsappId } = req.params;
    // Tentar formas variadas para corresponder ao whatsappId (com/s/sem sufixo @c.us)
    const digitOnly = String(whatsappId || '').replace(/\D/g, '');
    const trySuffix = String(whatsappId || '').includes('@') ? whatsappId : whatsappId + '@c.us';

    const cliente = await db.get(
      `SELECT * FROM clientes WHERE whatsapp_id = ? OR whatsapp_id = ? OR REPLACE(REPLACE(whatsapp_id, '@c.us', ''), '@g.us', '') = ?`,
      [whatsappId, trySuffix, digitOnly]
    );

    if (cliente) {
      res.json({ success: true, cliente });
    } else {
      res.json({ success: false, message: 'Cliente não encontrado' });
    }
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// Novo endpoint para obter o QR Code do WhatsApp
app.get('/api/whatsapp/qr-code', async (req, res) => {
  try {
    if (!whatsappService) {
      return res.status(500).json({
        success: false,
        error: 'Serviço do WhatsApp não inicializado',
        status: 'unavailable'
      });
    }

    // Obter status da conexão
    const status = whatsappService.getStatus();

    // Se já estiver conectado, retornar status de sucesso
    if (status.connected) {
      return res.json({
        success: true,
        status: 'connected',
        message: 'WhatsApp já está conectado'
      });
    }

    // Se não houver QR Code disponível, retornar status apropriado
    if (!status.qrCodeAvailable) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum QR Code disponível. O cliente do WhatsApp ainda não foi inicializado.',
        status: 'pending'
      });
    }

    // Gerar e retornar o QR Code
    const qrCodeDataURL = await whatsappService.getQRCodeDataURL();
    res.json({
      success: true,
      status: 'qr_available',
      qrCode: qrCodeDataURL
    });
  } catch (error) {
    console.error('Erro ao obter QR Code:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      status: 'error'
    });
  }
});

// Endpoint para listar grupos do WhatsApp
app.get('/api/whatsapp/groups', async (req, res) => {
  try {
    if (!whatsappService) {
      return res.status(500).json({
        success: false,
        error: 'Serviço do WhatsApp não inicializado'
      });
    }

    const groups = await whatsappService.listGroups();
    res.json({
      success: true,
      groups: groups,
      currentGroupId: process.env.WHATSAPP_GROUP_ID || null
    });
  } catch (error) {
    console.error('Erro ao listar grupos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para salvar/atualizar informações do cliente
app.post('/api/clientes', async (req, res) => {
  try {
    const { whatsappId, nome, telefone, endereco } = req.body;

    // Verificar se o cliente já existe
    const clienteExistente = await db.get(
      'SELECT * FROM clientes WHERE whatsapp_id = ?',
      [whatsappId]
    );

    if (clienteExistente) {
      // Atualizar informações do cliente existente
      await db.run(
        'UPDATE clientes SET nome = ?, telefone = ?, endereco = ?, data_atualizacao = datetime("now") WHERE whatsapp_id = ?',
        [nome, telefone, endereco, whatsappId]
      );
      res.json({ success: true, message: 'Informações do cliente atualizadas com sucesso!' });
    } else {
      // Criar novo cliente
      await db.run(
        'INSERT INTO clientes (whatsapp_id, nome, telefone, endereco) VALUES (?, ?, ?, ?)',
        [whatsappId, nome, telefone, endereco]
      );
      res.json({ success: true, message: 'Cliente cadastrado com sucesso!' });
    }
  } catch (error) {
    console.error('Erro ao salvar cliente:', error);
    res.status(500).json({ error: 'Erro ao salvar cliente' });
  }
});

// Endpoint para salvar configurações de personalização
app.post('/api/custom-settings', async (req, res) => {
  try {
    const settings = req.body;

    // Salvar configurações em um arquivo JSON
    const settingsPath = path.join(__dirname, 'custom-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    res.json({
      success: true,
      message: 'Configurações salvas com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// Endpoint para obter configurações de personalização
app.get('/api/custom-settings', (req, res) => {
  try {
    const settingsPath = path.join(__dirname, 'custom-settings.json');

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      // Override restaurantName with env var if provided
      settings.restaurantName = process.env.RESTAURANT_NAME || settings.restaurantName || 'Brutus Burger';
      // Include app domain if provided
      if (process.env.APP_DOMAIN && !settings.domain) settings.domain = process.env.APP_DOMAIN;
      // Garantir que pickupEnabled tenha um valor padrão
      if (settings.pickupEnabled === undefined) settings.pickupEnabled = true;
      res.json(settings);
    } else {
      // Retornar configurações padrão com possibilidade de override via .env
      res.json({
        restaurantName: process.env.RESTAURANT_NAME || 'Brutus Burger',
        contact: '(42) 9 99830-2047',
        primaryColor: '#27ae60',
        secondaryColor: '#f39c12',
        backgroundColor: '#121212',
        hours: '18:00 às 23:00',
        pixKey: '',
        pixName: '',
        logo: null,
        theme: 'dark',
        domain: process.env.APP_DOMAIN || undefined,
        pickupEnabled: true
      });
    }
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
});

// Endpoint para resetar configurações para o padrão
app.post('/api/custom-settings/reset', (req, res) => {
  try {
    const settingsPath = path.join(__dirname, 'custom-settings.json');

    // Configurações padrão
    const defaultSettings = {
      restaurantName: process.env.RESTAURANT_NAME || 'Brutus Burger',
      contact: '(42) 9 99830-2047',
      primaryColor: '#27ae60',
      hours: '18:00 às 23:00',
      secondaryColor: '#f39c12',
      backgroundColor: '#121212',
      pixKey: '',
      pixName: '',
      logo: null,
      theme: 'dark'
    };

    // Salvar configurações padrão
    // Ensure domain is present in default settings if provided
    if (process.env.APP_DOMAIN) defaultSettings.domain = process.env.APP_DOMAIN;
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));

    res.json({
      success: true,
      message: 'Configurações restauradas para o padrão!',
      settings: defaultSettings
    });
  } catch (error) {
    console.error('Erro ao resetar configurações:', error);
    res.status(500).json({ error: 'Erro ao resetar configurações' });
  }
});

// Endpoint para atualizar produto com imagem (URL)
app.post('/api/produtos/:id/imagem', async (req, res) => {
  try {
    const { id } = req.params;
    const { imagem } = req.body;

    // Atualizar produto com a URL da imagem
    await db.run(
      'UPDATE produtos SET imagem = ? WHERE id = ?',
      [imagem, id]
    );

    res.json({
      success: true,
      message: 'Imagem atualizada com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar imagem:', error);
    res.status(500).json({ error: 'Erro ao atualizar imagem' });
  }
});

// Endpoint para atualizar dados do produto (nome, descricao, preco, categoria)
app.put('/api/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, preco, categoria } = req.body;

    // Atualizar produto com os novos dados
    await db.run(
      'UPDATE produtos SET nome = ?, descricao = ?, preco = ?, categoria = ? WHERE id = ?',
      [nome, descricao, preco, categoria, id]
    );

    res.json({
      success: true,
      message: 'Produto atualizado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Endpoint para excluir produto
app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se o produto existe
    const produto = await db.get('SELECT * FROM produtos WHERE id = ?', [id]);

    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Excluir o produto
    await db.run('DELETE FROM produtos WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Produto excluído com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

// Endpoint para criar novo produto
app.post('/api/produtos', async (req, res) => {
  try {
    const { nome, descricao, preco, categoria, imagem } = req.body;

    // Validar campos obrigatórios
    if (!nome || !preco || !categoria) {
      return res.status(400).json({ error: 'Nome, preço e categoria são obrigatórios' });
    }

    // Inserir novo produto
    const result = await db.run(
      'INSERT INTO produtos (nome, descricao, preco, categoria, imagem) VALUES (?, ?, ?, ?, ?)',
      [nome, descricao || '', preco, categoria, imagem || null]
    );

    const novoProduto = {
      id: result.lastID,
      nome,
      descricao: descricao || '',
      preco,
      categoria,
      imagem: imagem || null
    };

    res.status(201).json({
      success: true,
      message: 'Produto criado com sucesso!',
      produto: novoProduto
    });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// Endpoint para upload de imagem
app.post('/api/produtos/:id/upload', upload.single('imagem'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
    }

    // Caminho relativo para servir a imagem
    const imagePath = `/uploads/${req.file.filename}`;

    // Atualizar produto com o caminho da imagem
    await db.run(
      'UPDATE produtos SET imagem = ? WHERE id = ?',
      [imagePath, id]
    );

    res.json({
      success: true,
      imagePath: imagePath,
      message: 'Imagem atualizada com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao fazer upload da imagem:', error);
    res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
  }
});

// Endpoint para atualizar status do pedido
app.put('/api/pedidos/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Verificar se o pedido existe
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Atualizar status do pedido
    await db.run('UPDATE pedidos SET status = ? WHERE id = ?', [status, id]);

    res.json({
      success: true,
      message: 'Status do pedido atualizado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    res.status(500).json({ error: 'Erro ao atualizar status do pedido' });
  }
});

// Helper: carregar pedido completo com itens
async function carregarPedidoCompleto(pedidoId) {
  const pedido = await db.get(
    `SELECT p.*, 
            c.nome as cliente_nome,
            c.telefone as cliente_telefone,
            c.endereco as cliente_endereco
       FROM pedidos p
  LEFT JOIN clientes c ON p.cliente_nome = c.nome
      WHERE p.id = ?`,
    [pedidoId]
  );
  if (!pedido) return null;
  const itens = await db.all(
    `SELECT pi.*, pr.nome as produto_nome, pr.preco as produto_preco
       FROM pedido_itens pi
  LEFT JOIN produtos pr ON pi.produto_id = pr.id
      WHERE pi.pedido_id = ?`,
    [pedidoId]
  );
  pedido.itens = itens;
  pedido.status = pedido.status || 'pending';
  return pedido;
}

// Endpoints para gerenciar itens do pedido
// Adicionar item ao pedido
app.post('/api/pedidos/:id/itens', async (req, res) => {
  try {
    const { id } = req.params;
    const { produto_id, quantidade, preco_unitario, adicionais, observacao } = req.body;

    // Validar entrada
    if (!produto_id || !quantidade || quantidade <= 0) {
      return res.status(400).json({ error: 'produto_id e quantidade são obrigatórios' });
    }

    // Verificar se o produto existe
    const produto = await db.get('SELECT * FROM produtos WHERE id = ?', [produto_id]);
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Inserir item
    await db.run(
      'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, adicionais, observacao) VALUES (?, ?, ?, ?, ?, ?)',
      [id, produto_id, quantidade, preco_unitario != null ? preco_unitario : produto.preco, adicionais ? JSON.stringify(adicionais) : null, observacao || null]
    );

    // Recalcular total
    await recalcularTotalPedido(id);

    const pedido = await carregarPedidoCompleto(id);
    res.json({ success: true, pedido });
  } catch (error) {
    console.error('Erro ao adicionar item ao pedido:', error);
    res.status(500).json({ error: 'Erro ao adicionar item ao pedido' });
  }
});

// Atualizar item do pedido (quantidade e/ou preço)
app.put('/api/pedidos/:id/itens/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { quantidade, preco_unitario, adicionais, observacao } = req.body;

    // Verificar se item existe
    const item = await db.get('SELECT * FROM pedido_itens WHERE id = ? AND pedido_id = ?', [itemId, id]);
    if (!item) {
      return res.status(404).json({ error: 'Item do pedido não encontrado' });
    }

    // Atualizar campos informados
    const q = quantidade != null ? quantidade : item.quantidade;
    const p = preco_unitario != null ? preco_unitario : item.preco_unitario;
    const ad = adicionais !== undefined ? (adicionais ? JSON.stringify(adicionais) : null) : item.adicionais;
    const obs = observacao !== undefined ? (observacao || null) : item.observacao;
    await db.run('UPDATE pedido_itens SET quantidade = ?, preco_unitario = ?, adicionais = ?, observacao = ? WHERE id = ?', [q, p, ad, obs, itemId]);

    // Recalcular total
    await recalcularTotalPedido(id);
    const pedido = await carregarPedidoCompleto(id);
    res.json({ success: true, pedido });
  } catch (error) {
    console.error('Erro ao atualizar item do pedido:', error);
    res.status(500).json({ error: 'Erro ao atualizar item do pedido' });
  }
});

// Remover item do pedido
app.delete('/api/pedidos/:id/itens/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;

    // Verificar se item existe
    const item = await db.get('SELECT * FROM pedido_itens WHERE id = ? AND pedido_id = ?', [itemId, id]);
    if (!item) {
      return res.status(404).json({ error: 'Item do pedido não encontrado' });
    }

    await db.run('DELETE FROM pedido_itens WHERE id = ?', [itemId]);

    // Recalcular total
    await recalcularTotalPedido(id);
    const pedido = await carregarPedidoCompleto(id);
    res.json({ success: true, pedido });
  } catch (error) {
    console.error('Erro ao remover item do pedido:', error);
    res.status(500).json({ error: 'Erro ao remover item do pedido' });
  }
});

// Endpoint para atualizar o endereço do pedido (recalcula taxa opcionalmente)
app.put('/api/pedidos/:id/endereco', async (req, res) => {
  try {
    const { id } = req.params;
    const { endereco, recalc } = req.body; // recalc: boolean - se deve recalcular taxa/coordenadas

    // Verificar se o pedido existe
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Atualizar endereço
    await db.run('UPDATE pedidos SET cliente_endereco = ? WHERE id = ?', [endereco, id]);

    // Opcional: recalcular taxa e coordenadas com base no novo endereço
    let entregaInfo = null;
    if (recalc) {
      try {
        const taxa = await deliveryService.calcularTaxaPorEndereco(endereco);
        if (taxa && taxa.success) {
          entregaInfo = {
            distance: taxa.distance || taxa.distance === 0 ? taxa.distance : null,
            price: taxa.price || null,
            coordinates: taxa.coordinates || null,
            // Indicar que a taxa/coordenaadas vieram de um endereço digitado
            enderecoDigitado: Boolean(taxa.enderecoDigitado)
          };

          await db.run('UPDATE pedidos SET distancia = ?, valor_entrega = ?, coordenadas_cliente = ? WHERE id = ?', [
            entregaInfo.distance,
            entregaInfo.price,
            entregaInfo.coordinates ? JSON.stringify(entregaInfo.coordinates) : null,
            id
          ]);
        }
      } catch (err) {
        console.warn('Falha ao recalcular taxa por endereço:', err && err.message);
      }
    }

    // Recarregar pedido e itens atualizados
    const updatedPedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);
    const itens = await db.all(`
      SELECT pi.*, pr.nome as produto_nome, pr.preco as produto_preco
      FROM pedido_itens pi
      LEFT JOIN produtos pr ON pi.produto_id = pr.id
      WHERE pi.pedido_id = ?
    `, [id]);
    // Parse adicionais JSON
    const itensComAdicionais = itens.map(i => ({
      ...i,
      adicionais: i.adicionais ? (typeof i.adicionais === 'string' ? JSON.parse(i.adicionais) : i.adicionais) : []
    }));

    // Construir payload para envio via WhatsApp
    const orderData = {
      pedidoId: updatedPedido.id,
      cliente: {
        nome: updatedPedido.cliente_nome,
        telefone: updatedPedido.cliente_telefone,
        endereco: updatedPedido.cliente_endereco,
        pagamento: updatedPedido.forma_pagamento,
        troco: null
      },
      itens: itensComAdicionais.map(i => ({ quantidade: i.quantidade, observacao: i.observacao, adicionais: i.adicionais, produto: { id: i.produto_id, nome: i.produto_nome, preco: i.produto_preco } })),
      total: updatedPedido.total,
      entrega: {
        distancia: updatedPedido.distancia,
        price: updatedPedido.valor_entrega,
        coordenadas: updatedPedido.coordenadas_cliente ? JSON.parse(updatedPedido.coordenadas_cliente) : null
      }
    };

    // Enviar atualização para o grupo de entregas (somente se robô estiver ligado)
    if (robotEnabled) {
      setImmediate(async () => {
        try {
          await whatsappService.sendOrderToDeliveryGroup(orderData);
        } catch (error) {
          console.error('Erro ao reenviar pedido atualizado para o grupo:', error && error.message);
        }
      });
    }

    // Tentar enviar resumo ao cliente se houver whatsapp_id cadastrado na tabela clientes (somente se robô estiver ligado)
    if (robotEnabled) {
      setImmediate(async () => {
        try {
          const cliente = await db.get('SELECT * FROM clientes WHERE telefone = ?', [updatedPedido.cliente_telefone]);
          if (cliente && cliente.whatsapp_id && whatsappService && whatsappService.client && whatsappService.isConnected) {
            try {
              await whatsappService.sendOrderSummaryToId(cliente.whatsapp_id || cliente.whatsappId || cliente.whatsapp, orderData);
            } catch (err) {
              console.warn('Não foi possível enviar resumo ao cliente via WhatsApp:', err && err.message);
            }
          }
        } catch (err) {
          console.warn('Erro ao buscar cliente para envio via WhatsApp:', err && err.message);
        }
      });
    }

    res.json({ success: true, message: 'Endereço do pedido atualizado com sucesso!', pedidoId: id });
  } catch (error) {
    console.error('Erro ao atualizar endereço do pedido:', error);
    res.status(500).json({ error: 'Erro ao atualizar endereço do pedido' });
  }
});

// Endpoint para excluir pedido
app.delete('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se o pedido existe
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Excluir itens do pedido
    await db.run('DELETE FROM pedido_itens WHERE pedido_id = ?', [id]);

    // Excluir o pedido
    await db.run('DELETE FROM pedidos WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Pedido excluído com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao excluir pedido:', error);
    res.status(500).json({ error: 'Erro ao excluir pedido' });
  }
});

// Endpoint para marcar pedido como blacklisted
app.put('/api/pedidos/:id/blacklist', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_blacklisted } = req.body;

    // Verificar se o pedido existe
    const pedido = await db.get('SELECT * FROM pedidos WHERE id = ?', [id]);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Atualizar flag de blacklist
    await db.run('UPDATE pedidos SET is_blacklisted = ? WHERE id = ?', [is_blacklisted ? 1 : 0, id]);

    res.json({
      success: true,
      message: 'Pedido atualizado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar blacklist do pedido:', error);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});

// ============================================================
// ENDPOINTS DE INSTALAÇÃO
// ============================================================

// Rota para página de instalação
app.get('/install', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/install.html'));
});

// Verificar status da instalação
app.get('/api/install/status', (req, res) => {
  try {
    const settingsPath = path.join(__dirname, 'custom-settings.json');
    const envPath = path.join(__dirname, '..', '.env');
    const deliveryConfigPath = path.join(__dirname, 'config', 'delivery.config.js');

    const installed = fs.existsSync(settingsPath) || fs.existsSync(envPath);

    let settings = null;
    let env = {};
    let deliveryConfig = null;

    // Carregar configurações existentes
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) { /* ignorar */ }
    }

    // Carregar variáveis de ambiente
    env = {
      PORT: process.env.PORT || '3005',
      ORS_API_KEY: process.env.ORS_API_KEY || '',
      RESTAURANT_LATITUDE: process.env.RESTAURANT_LATITUDE || '',
      RESTAURANT_LONGITUDE: process.env.RESTAURANT_LONGITUDE || '',
      WHATSAPP_GROUP_ID: process.env.WHATSAPP_GROUP_ID || '',
      APP_DOMAIN: process.env.APP_DOMAIN || '',
      RESTAURANT_NAME: process.env.RESTAURANT_NAME || ''
    };

    // Carregar config de entrega
    if (fs.existsSync(deliveryConfigPath)) {
      try {
        // Ler como texto e extrair dados (o arquivo é ES module)
        const content = fs.readFileSync(deliveryConfigPath, 'utf8');

        // Extrair coordenadas
        const latMatch = content.match(/lat:\s*([-\d.]+)/);
        const lngMatch = content.match(/lng:\s*([-\d.]+)/);

        // Extrair regras de preço
        const rulesMatch = content.match(/pricingRules:\s*\[([\s\S]*?)\]/);
        let pricingRules = [];
        if (rulesMatch) {
          const rulesStr = rulesMatch[1];
          const ruleMatches = rulesStr.matchAll(/\{\s*maxDistance:\s*([\d.]+),\s*price:\s*([\d.]+)\s*\}/g);
          for (const m of ruleMatches) {
            pricingRules.push({ maxDistance: parseFloat(m[1]), price: parseFloat(m[2]) });
          }
        }

        // Extrair distância máxima
        const maxDistMatch = content.match(/maxDeliveryDistance:\s*([\d.]+)/);

        deliveryConfig = {
          restaurantCoordinates: {
            lat: latMatch ? parseFloat(latMatch[1]) : null,
            lng: lngMatch ? parseFloat(lngMatch[1]) : null
          },
          pricingRules: pricingRules,
          maxDeliveryDistance: maxDistMatch ? parseFloat(maxDistMatch[1]) : 70
        };
      } catch (e) {
        console.warn('Erro ao ler config de entrega:', e.message);
      }
    }

    res.json({
      installed,
      settings,
      env,
      deliveryConfig
    });
  } catch (error) {
    console.error('Erro ao verificar instalação:', error);
    res.status(500).json({ error: 'Erro ao verificar instalação' });
  }
});

// Salvar configuração de entrega
app.post('/api/install/delivery-config', (req, res) => {
  try {
    const { latitude, longitude, maxDistance, pricingRules } = req.body;

    // Criar diretório se não existir
    const configDir = path.join(__dirname, 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Gerar arquivo de configuração
    const rulesStr = pricingRules.map(r =>
      `    { maxDistance: ${r.maxDistance}, price: ${r.price.toFixed(2)} }`
    ).join(',\n');

    const configContent = `// Configuração do sistema de entrega
// Gerado automaticamente pela página de instalação em ${new Date().toISOString()}
export const deliveryConfig = {
  // Coordenadas do restaurante
  restaurantCoordinates: {
    lat: ${latitude || -25.4284}, // Latitude do restaurante
    lng: ${longitude || -49.2733}  // Longitude do restaurante
  },
  
  // Regras de precificação por distância (em quilômetros)
  // O sistema seleciona a primeira regra que corresponde à distância máxima
  pricingRules: [
${rulesStr}
  ],
  
  // Área máxima de entrega em km
  maxDeliveryDistance: ${maxDistance || 70},
  
  // Mensagem quando fora da área de entrega
  outOfRangeMessage: "Desculpe, mas você está fora da nossa área de entrega (máximo de ${maxDistance || 70}km)."
};
`;

    const configPath = path.join(configDir, 'delivery.config.js');
    fs.writeFileSync(configPath, configContent);

    console.log('✅ Configuração de entrega salva com sucesso');

    res.json({
      success: true,
      message: 'Configuração de entrega salva com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao salvar configuração de entrega:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração de entrega' });
  }
});

// Salvar cardápio
app.post('/api/install/cardapio', async (req, res) => {
  try {
    const cardapio = req.body;

    // Salvar arquivo JSON
    const cardapioPath = path.join(__dirname, '..', 'cardapio.json');
    fs.writeFileSync(cardapioPath, JSON.stringify(cardapio, null, 2));

    // Se o banco de dados já existe e não tem produtos, popular
    if (db) {
      const produtosExistentes = await db.get('SELECT COUNT(*) as count FROM produtos');
      if (produtosExistentes.count === 0 && cardapio.categorias) {
        for (const categoria of cardapio.categorias) {
          // Inserir categoria
          try {
            await db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', [categoria.nome]);
          } catch (e) { /* ignorar */ }

          // Inserir produtos
          for (const item of categoria.itens) {
            await db.run(
              'INSERT INTO produtos (nome, descricao, preco, categoria) VALUES (?, ?, ?, ?)',
              [item.nome, item.descricao || '', item.preco, categoria.nome]
            );
          }
        }
        console.log('✅ Cardápio importado para o banco de dados');
      }
    }

    console.log('✅ Cardápio salvo com sucesso');

    res.json({
      success: true,
      message: 'Cardápio salvo com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao salvar cardápio:', error);
    res.status(500).json({ error: 'Erro ao salvar cardápio' });
  }
});

// Salvar variáveis de ambiente
app.post('/api/install/env-config', (req, res) => {
  try {
    const envVars = req.body;
    const envPath = path.join(__dirname, '..', '.env');

    // Ler arquivo existente ou criar novo
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Função para atualizar ou adicionar variável
    const updateEnvVar = (content, key, value) => {
      if (!value && value !== 0) return content; // Não salvar se vazio

      const regex = new RegExp(`^${key}=.*$`, 'm');
      const newLine = `${key}=${value}`;

      if (regex.test(content)) {
        return content.replace(regex, newLine);
      } else {
        return content + (content.endsWith('\n') ? '' : '\n') + newLine + '\n';
      }
    };

    // Atualizar cada variável
    Object.entries(envVars).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        envContent = updateEnvVar(envContent, key, value);
      }
    });

    // Garantir cabeçalho
    if (!envContent.includes('# Arquivo de configuração')) {
      envContent = `# Arquivo de configuração de variáveis de ambiente
# Gerado/atualizado pela página de instalação em ${new Date().toISOString()}

` + envContent;
    }

    fs.writeFileSync(envPath, envContent);

    // Recarregar variáveis de ambiente
    dotenv.config({ path: envPath, override: true });

    console.log('✅ Variáveis de ambiente salvas com sucesso');

    res.json({
      success: true,
      message: 'Variáveis de ambiente salvas com sucesso!',
      note: 'Algumas alterações podem requerer reinício do servidor.'
    });
  } catch (error) {
    console.error('Erro ao salvar variáveis de ambiente:', error);
    res.status(500).json({ error: 'Erro ao salvar variáveis de ambiente' });
  }
});

// ============================================================
// FIM DOS ENDPOINTS DE INSTALAÇÃO
// ============================================================

// Inicialização do banco e servidor
async function startServer() {
  try {
    db = await open({
      filename: path.join(__dirname, 'db.sqlite'),
      driver: sqlite3.Database
    });

    // Criar tabelas
    await db.run(`CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      descricao TEXT,
      preco REAL,
      imagem TEXT,
      categoria TEXT
    )`);

    await db.run(`CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      cliente_endereco TEXT,
      forma_pagamento TEXT,
      total REAL,
      distancia REAL,
      valor_entrega REAL,
      coordenadas_cliente TEXT,
      data DATETIME,
      status TEXT DEFAULT 'pending'
    )`);

    // Adicionar colunas para entrega se não existirem
    try {
      await db.run(`ALTER TABLE pedidos ADD COLUMN distancia REAL`);
    } catch (e) {
      // Coluna já existe, ignorar erro
    }

    try {
      await db.run(`ALTER TABLE pedidos ADD COLUMN valor_entrega REAL`);
    } catch (e) {
      // Coluna já existe, ignorar erro
    }

    try {
      await db.run(`ALTER TABLE pedidos ADD COLUMN coordenadas_cliente TEXT`);
    } catch (e) {
      // Coluna já existe, ignorar erro
    }
    try { await db.run(`ALTER TABLE pedidos ADD COLUMN observacao_entrega TEXT`); } catch (e) { /* já existe */ }
    try { await db.run(`ALTER TABLE pedidos ADD COLUMN is_pickup INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
    try { await db.run(`ALTER TABLE pedidos ADD COLUMN is_blacklisted INTEGER DEFAULT 0`); } catch (e) { /* já existe */ }
    try { await db.run(`ALTER TABLE pedidos ADD COLUMN whatsapp_id TEXT`); } catch (e) { /* já existe */ }

    await db.run(`CREATE TABLE IF NOT EXISTS pedido_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      produto_id INTEGER,
      quantidade INTEGER,
      preco_unitario REAL,
      adicionais TEXT,        -- JSON com lista de adicionais do item
      observacao TEXT         -- observação do item
    )`);

    // Adicionar colunas de adicionais/observacao se não existirem (migração suave)
    try { await db.run(`ALTER TABLE pedido_itens ADD COLUMN adicionais TEXT`); } catch (e) { /* já existe */ }
    try { await db.run(`ALTER TABLE pedido_itens ADD COLUMN observacao TEXT`); } catch (e) { /* já existe */ }

    // Criar tabela de clientes para armazenar informações persistentes
    await db.run(`CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whatsapp_id TEXT UNIQUE,
      nome TEXT,
      telefone TEXT,
      endereco TEXT,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Criar tabela de categorias
    await db.run(`CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE
    )`);

    // Criar tabela de buffet do dia
    await db.run(`CREATE TABLE IF NOT EXISTS buffet_dia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ============================================================
    // TABELAS DO SISTEMA DE AÇAÍ
    // ============================================================

    // Criar tabela de tamanhos de açaí
    await db.run(`CREATE TABLE IF NOT EXISTS acai_tamanhos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL NOT NULL DEFAULT 0,
      adicionais_gratis INTEGER DEFAULT 0,
      ordem INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Criar tabela de adicionais de açaí
    await db.run(`CREATE TABLE IF NOT EXISTS acai_adicionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL DEFAULT 0,
      categoria TEXT DEFAULT 'Geral',
      ordem INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Criar tabela de configurações de açaí
    await db.run(`CREATE TABLE IF NOT EXISTS acai_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      habilitado INTEGER DEFAULT 1,
      categoria_nome TEXT DEFAULT 'Açaí'
    )`);

    // Inserir configuração padrão se não existir
    try {
      await db.run(`INSERT OR IGNORE INTO acai_config (id, habilitado, categoria_nome) VALUES (1, 1, 'Açaí')`);
    } catch (e) { /* já existe */ }

    // Criar tabela de configuração de adicionais grátis por produto de açaí
    await db.run(`CREATE TABLE IF NOT EXISTS acai_produto_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER UNIQUE NOT NULL,
      adicionais_gratis INTEGER DEFAULT 0,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Criar tabela de blacklist para números suspeitos/golpistas
    await db.run(`CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefone TEXT UNIQUE NOT NULL,
      motivo TEXT,
      data_inclusao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Popular tabela de categorias com categorias existentes dos produtos
    try {
      const distinctCats = await db.all('SELECT DISTINCT categoria as nome FROM produtos WHERE categoria IS NOT NULL');
      for (const c of distinctCats) {
        if (c && c.nome) {
          try {
            await db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', [c.nome]);
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // ============================================================
    // ÍNDICES PARA OTIMIZAÇÃO DE PERFORMANCE
    // ============================================================
    try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(data)'); } catch (e) { /* já existe */ }
    try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)'); } catch (e) { /* já existe */ }
    try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_telefone)'); } catch (e) { /* já existe */ }
    try { await db.run('CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id)'); } catch (e) { /* já existe */ }
    console.log('📊 Índices de banco de dados verificados/criados');

    // Verificar se há produtos, se não houver, popular o banco
    const produtosExistentes = await db.get('SELECT COUNT(*) as count FROM produtos');
    if (produtosExistentes.count === 0) {
      await popularBancoDeDados();
    }

    // Inicializar serviços
    whatsappService = new WhatsAppService();

    // Configurar callback para verificar se o robô está ligado
    whatsappService.setRobotEnabledCallback(() => robotEnabled);

    whatsappService.initialize();

    deliveryService = new DeliveryService();

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar o servidor:', error);
  }
}

// Função para popular o banco de dados com o cardápio completo
async function popularBancoDeDados() {
  try {
    // Ler o arquivo cardapio.json
    const cardapioPath = path.join(__dirname, '../cardapio.json');
    const cardapioData = fs.readFileSync(cardapioPath, 'utf8');
    const cardapio = JSON.parse(cardapioData);

    // Inserir produtos por categoria
    for (const categoria of cardapio.categorias) {
      for (const item of categoria.itens) {
        await db.run(
          'INSERT INTO produtos (nome, descricao, preco, categoria) VALUES (?, ?, ?, ?)',
          [item.nome, item.descricao || '', item.preco, categoria.nome]
        );
      }
    }

    console.log('Banco de dados populado com sucesso!');
  } catch (error) {
    console.error('Erro ao popular o banco de dados:', error);
  }
}

startServer();