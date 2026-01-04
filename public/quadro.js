// ============================================================
// QUADRO.JS - Nova página de gestão do restaurante
// ============================================================

// Estado da aplicação
let pedidos = [];
let pedidoSelecionado = null;
let autoRefreshInterval = null;
let autoPrintEnabled = false;
let robotEnabled = false;
let customSettings = {};
let ultimosPedidosIds = new Set();
let primeiraCarregaCompleta = false; // Flag para evitar imprimir tudo na primeira carga

// ============================================================
// MODAL DE INPUT CUSTOMIZADO (substitui prompt)
// ============================================================

function showInputModal(options) {
    return new Promise((resolve) => {
        const {
            title = 'Input',
            message = '',
            placeholder = '',
            defaultValue = '',
            confirmText = 'OK',
            cancelText = 'Cancelar'
        } = options;

        // Remover modal existente se houver
        const existingModal = document.getElementById('custom-input-modal');
        if (existingModal) existingModal.remove();

        // Criar modal
        const modal = document.createElement('div');
        modal.id = 'custom-input-modal';
        modal.className = 'modal-overlay show';
        modal.style.zIndex = '99999';
        modal.innerHTML = `
            <div class="modal" style="max-width: 500px; animation: modalSlideIn 0.3s ease-out;">
                <div class="modal-header" style="background: linear-gradient(135deg, rgba(231, 76, 60, 0.2), rgba(192, 57, 43, 0.1)); border-bottom: 2px solid rgba(231, 76, 60, 0.3);">
                    <h2 style="font-size: 1.3rem; display: flex; align-items: center; gap: 10px;">${title}</h2>
                </div>
                <div class="modal-body" style="padding: 25px;">
                    ${message}
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text); font-size: 0.95rem;">Motivo do bloqueio:</label>
                        <input type="text" id="custom-input-field" 
                               placeholder="${placeholder}" 
                               value="${defaultValue}"
                               style="width: 100%; padding: 12px 16px; background: var(--dark); border: 2px solid var(--border); border-radius: 10px; color: var(--text); font-size: 1rem; transition: all 0.2s;"
                               onfocus="this.style.borderColor='#e74c3c'; this.style.boxShadow='0 0 0 3px rgba(231, 76, 60, 0.1)'"
                               onblur="this.style.borderColor='var(--border)'; this.style.boxShadow='none'">
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button id="custom-input-cancel" 
                                style="padding: 12px 24px; background: rgba(150, 150, 150, 0.2); border: 1px solid rgba(150, 150, 150, 0.3); border-radius: 8px; color: var(--text); font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 0.95rem;"
                                onmouseover="this.style.background='rgba(150, 150, 150, 0.3)'"
                                onmouseout="this.style.background='rgba(150, 150, 150, 0.2)'">
                            ${cancelText}
                        </button>
                        <button id="custom-input-confirm" 
                                style="padding: 12px 24px; background: linear-gradient(135deg, #e74c3c, #c0392b); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3); font-size: 0.95rem;"
                                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(231, 76, 60, 0.4)'"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(231, 76, 60, 0.3)'">
                            <i class="fas fa-ban"></i> ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Focar no input
        const inputField = document.getElementById('custom-input-field');
        setTimeout(() => {
            inputField.focus();
            inputField.select();
        }, 100);

        // Event listeners
        const confirmBtn = document.getElementById('custom-input-confirm');
        const cancelBtn = document.getElementById('custom-input-cancel');

        const handleConfirm = () => {
            const value = inputField.value.trim();
            modal.remove();
            resolve(value || null);
        };

        const handleCancel = () => {
            modal.remove();
            resolve(null);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);

        // Enter para confirmar, Esc para cancelar
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') handleCancel();
        });

        // Clicar fora fecha
        modal.addEventListener('click', (e) => {
            if (e.target === modal) handleCancel();
        });
    });
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await carregarConfiguracoes();
    await carregarBlacklist(); // Carregar blacklist antes dos pedidos
    await carregarPedidos();
    iniciarAtualizacaoAutomatica();
    iniciarSSE(); // Conexão tempo real
    setupEventListeners();
    carregarEstadoRobo();
    carregarEstadoAutoPrint();
});

// ============================================================
// SERVER-SENT EVENTS (TEMPO REAL)
// ============================================================

let sseConnection = null;
let sseReconnectTimeout = null;

function iniciarSSE() {
    // Evitar múltiplas conexões
    if (sseConnection) {
        sseConnection.close();
    }

    try {
        sseConnection = new EventSource('/api/events/stream');

        sseConnection.onopen = () => {
            console.log('[SSE] Conectado ao servidor');
            // Limpar timeout de reconexão
            if (sseReconnectTimeout) {
                clearTimeout(sseReconnectTimeout);
                sseReconnectTimeout = null;
            }
        };

        // Evento de novo pedido
        sseConnection.addEventListener('novo-pedido', (event) => {
            console.log('[SSE] Novo pedido recebido:', event.data);
            try {
                const data = JSON.parse(event.data);
                // Tocar som de notificação
                tocarSomNotificacao();
                // Atualizar lista de pedidos
                carregarPedidos();
                showToast(`Novo pedido #${data.pedidoId} recebido!`, 'success');
            } catch (e) {
                console.error('[SSE] Erro ao processar novo pedido:', e);
                carregarPedidos();
            }
        });

        // Heartbeat (manter conexão viva)
        sseConnection.addEventListener('heartbeat', (event) => {
            console.log('[SSE] Heartbeat recebido');
        });

        sseConnection.onerror = (error) => {
            console.error('[SSE] Erro na conexão:', error);
            sseConnection.close();

            // Reconectar após 5 segundos
            if (!sseReconnectTimeout) {
                sseReconnectTimeout = setTimeout(() => {
                    console.log('[SSE] Tentando reconectar...');
                    iniciarSSE();
                }, 5000);
            }
        };

    } catch (e) {
        console.error('[SSE] Falha ao iniciar:', e);
        // Fallback para polling tradicional
    }
}

// Som de notificação para novos pedidos
function tocarSomNotificacao() {
    try {
        // Criar contexto de áudio
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Criar oscilador para som de "ding"
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = 880; // Nota A5
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);

        // Segundo ding (mais agudo)
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.frequency.value = 1320; // Nota E6
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc2.start(audioCtx.currentTime);
            osc2.stop(audioCtx.currentTime + 0.5);
        }, 150);

    } catch (e) {
        console.warn('Não foi possível tocar som de notificação:', e);
    }
}

function setupEventListeners() {
    // Botões do header
    document.getElementById('refresh-btn').addEventListener('click', carregarPedidos);
    document.getElementById('settings-btn').addEventListener('click', () => openModal('settings-modal'));
    document.getElementById('toggle-robot-btn').addEventListener('click', toggleRobot);
    document.getElementById('auto-print-btn').addEventListener('click', toggleAutoPrint);

    // Fechar modais clicando fora (EXCETO login-modal)
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            // Nao fechar o modal de login clicando fora
            if (modal.id === 'login-modal') return;
            if (e.target === modal) closeModal(modal.id);
        });
    });
}

// ============================================================
// CARREGAR DADOS
// ============================================================

async function carregarConfiguracoes() {
    try {
        const response = await fetch('/api/custom-settings');
        customSettings = await response.json();

        // Atualizar nome do restaurante
        document.getElementById('restaurant-name').textContent = customSettings.restaurantName || 'Painel de Gestão';

        // Atualizar logo se existir
        if (customSettings.logo) {
            const logoImg = document.getElementById('logo-img');
            logoImg.src = customSettings.logo;
            logoImg.style.display = 'block';
        }

        // Atualizar campos do modal de configurações com dados corretos
        const settingName = document.getElementById('setting-name');
        const settingHours = document.getElementById('setting-hours');
        const settingPhone = document.getElementById('setting-phone');
        const settingPix = document.getElementById('setting-pix');
        const settingPixName = document.getElementById('setting-pix-name');
        const settingPickup = document.getElementById('setting-pickup');

        if (settingName) settingName.value = customSettings.restaurantName || '';
        if (settingHours) {
            // Formatar horário: "18:00 às 23:00"
            const openTime = customSettings.openTime || '18:00';
            const closeTime = customSettings.closeTime || '23:00';
            settingHours.value = `${openTime} às ${closeTime}`;
        }
        if (settingPhone) settingPhone.value = customSettings.contact || customSettings.phone || '';
        if (settingPix) settingPix.value = customSettings.pixKey || '';
        if (settingPixName) settingPixName.value = customSettings.pixName || '';
        if (settingPickup) settingPickup.checked = customSettings.pickupEnabled !== false;
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
}

// Função para salvar configurações do modal
async function saveSettings() {
    try {
        const hoursValue = document.getElementById('setting-hours')?.value || '';
        // Tentar parsear horário no formato "18:00 às 23:00"
        let openTime = '18:00';
        let closeTime = '23:00';
        const hoursMatch = hoursValue.match(/(\d{1,2}:\d{2})\s*[aà]s?\s*(\d{1,2}:\d{2})/i);
        if (hoursMatch) {
            openTime = hoursMatch[1];
            closeTime = hoursMatch[2];
        }

        const settings = {
            restaurantName: document.getElementById('setting-name')?.value || '',
            openTime: openTime,
            closeTime: closeTime,
            contact: document.getElementById('setting-phone')?.value || '',
            pixKey: document.getElementById('setting-pix')?.value || '',
            pixName: document.getElementById('setting-pix-name')?.value || '',
            pickupEnabled: document.getElementById('setting-pickup')?.checked !== false
        };

        const response = await fetch('/api/custom-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const data = await response.json();
        if (data.success) {
            showToast('Configurações salvas com sucesso!', 'success');
            closeModal('settings-modal');
            // Recarregar configurações para atualizar interface
            await carregarConfiguracoes();
        } else {
            showToast('Erro ao salvar configurações: ' + (data.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        showToast('Erro ao salvar configurações.', 'error');
    }
}

async function carregarPedidos() {
    try {
        const response = await fetch('/api/pedidos');
        const data = await response.json();

        // Mostrar todos os pedidos não arquivados
        pedidos = data.filter(p => p.status !== 'archived');

        // Detectar novos pedidos para auto-print
        const idsAtuais = new Set(pedidos.map(p => p.id));

        // Só imprimir automaticamente se:
        // 1. Auto-print estiver ativado
        // 2. Já passou da primeira carga (para não imprimir todos ao abrir)
        // 3. Houver pedidos novos pendentes
        if (primeiraCarregaCompleta && autoPrintEnabled) {
            const novosPedidos = pedidos.filter(p =>
                !ultimosPedidosIds.has(p.id) && p.status === 'pending'
            );

            if (novosPedidos.length > 0) {
                console.log(`[Auto-Print] Imprimindo ${novosPedidos.length} novo(s) pedido(s)`);
                novosPedidos.forEach(p => {
                    imprimirPedido(p);
                    console.log(`[Auto-Print] Pedido #${p.id} enviado para impressão`);
                });
            }
        }

        ultimosPedidosIds = idsAtuais;

        // Marcar que a primeira carga foi concluída
        if (!primeiraCarregaCompleta) {
            primeiraCarregaCompleta = true;
            console.log('[Quadro] Primeira carga concluída, auto-print ativado para próximos pedidos');
        }

        renderizarPedidos();
        atualizarEstatisticas();
    } catch (error) {
        console.error('Erro ao carregar pedidos:', error);
    }
}

function renderizarPedidos() {
    const containers = {
        pending: document.getElementById('orders-pending'),
        preparing: document.getElementById('orders-preparing'),
        ready: document.getElementById('orders-ready'),
        delivered: document.getElementById('orders-delivered')
    };

    const counts = { pending: 0, preparing: 0, ready: 0, delivered: 0 };

    // Limpar containers
    Object.values(containers).forEach(c => c.innerHTML = '');

    // Renderizar cada pedido
    pedidos.forEach(pedido => {
        const status = pedido.status || 'pending';
        if (!containers[status]) return;

        counts[status]++;
        const card = criarCardPedido(pedido);
        containers[status].appendChild(card);
    });

    // Atualizar contadores
    Object.keys(counts).forEach(status => {
        document.getElementById(`count-${status}`).textContent = counts[status];
    });

    // Mostrar empty states
    Object.entries(containers).forEach(([status, container]) => {
        if (container.children.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>Nenhum pedido</p>
        </div>
      `;
        }
    });
}

function criarCardPedido(pedido) {
    const card = document.createElement('div');

    // Verificar blacklist DINAMICAMENTE pelo telefone (não pelo campo do banco)
    const isBlacklisted = isNumeroBlacklist(pedido.cliente_telefone);

    card.className = isBlacklisted ? 'order-card blacklisted' : 'order-card';
    card.dataset.id = pedido.id;
    card.dataset.status = pedido.status;

    // Se for golpista, adicionar estilos inline para destacar em vermelho
    if (isBlacklisted) {
        card.style.border = '2px solid #e74c3c';
        card.style.boxShadow = '0 4px 12px rgba(231, 76, 60, 0.4), inset 0 0 20px rgba(231, 76, 60, 0.1)';
        card.style.background = 'linear-gradient(135deg, rgba(231, 76, 60, 0.15), rgba(192, 57, 43, 0.1))';
    }

    // Formatar hora
    const data = new Date(pedido.data);
    const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Calcular itens
    const itens = pedido.itens || [];
    const totalItens = itens.reduce((acc, item) => acc + (item.quantidade || 1), 0);

    // Total
    const total = parseFloat(pedido.total || 0);

    // Próximo status
    const nextStatus = getNextStatus(pedido.status);
    const nextLabel = getStatusLabel(nextStatus);

    // Info extra: pagamento, entrega/retirada, troco
    const pagamento = pedido.pagamento || pedido.forma_pagamento || '';
    const isPickup = pedido.is_pickup === 1 || pedido.is_pickup === true;
    const temTroco = pedido.troco && parseFloat(pedido.troco) > 0;

    // Ícones compactos para info extra
    const pagamentoIcon = pagamento.toLowerCase().includes('pix') ? 'fa-qrcode'
        : pagamento.toLowerCase().includes('cartao') || pagamento.toLowerCase().includes('cartão') ? 'fa-credit-card'
            : pagamento.toLowerCase().includes('dinheiro') ? 'fa-money-bill-wave'
                : 'fa-wallet';

    const entregaIcon = isPickup ? 'fa-store' : 'fa-motorcycle';
    const entregaTexto = isPickup ? 'Retirar' : 'Entrega';
    const entregaCor = isPickup ? '#9b59b6' : '#3498db';

    // Cores dos badges de pagamento
    const pagamentoCor = pagamento.toLowerCase().includes('pix') ? '#00b894'
        : pagamento.toLowerCase().includes('cartao') || pagamento.toLowerCase().includes('cartão') ? '#0984e3'
            : pagamento.toLowerCase().includes('dinheiro') ? '#fdcb6e'
                : '#636e72';

    card.innerHTML = `
    <div class="card-badges" style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
      ${isBlacklisted ? '<div class="blacklist-badge"><i class="fas fa-exclamation-triangle"></i> GOLPISTA</div>' : ''}
      <div class="payment-badge" style="background: ${pagamentoCor}; color: ${pagamento.toLowerCase().includes('dinheiro') ? '#2d3436' : 'white'}; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; gap: 4px;">
        <i class="fas ${pagamentoIcon}"></i> ${pagamento ? pagamento.toUpperCase().substring(0, 10) : 'PAGAMENTO'}
      </div>
      <div class="delivery-badge" style="background: ${entregaCor}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; gap: 4px;">
        <i class="fas ${entregaIcon}"></i> ${entregaTexto.toUpperCase()}
      </div>
      ${temTroco ? `<div class="troco-badge" style="background: #e67e22; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; gap: 4px;">
        <i class="fas fa-coins"></i> TROCO
      </div>` : ''}
    </div>
    <div class="order-card-header">
      <span class="order-number">#${pedido.id}</span>
      <span class="order-time">${hora}</span>
    </div>
    <div class="order-customer">${pedido.cliente_nome || 'Cliente'}</div>
    <div class="order-items-count">${totalItens} item(s)</div>
    <div class="order-total">R$ ${total.toFixed(2).replace('.', ',')}</div>
    <div class="order-actions">
      <button class="order-action-btn secondary" onclick="event.stopPropagation(); abrirDetalhes(${pedido.id})">
        <i class="fas fa-eye"></i> Ver
      </button>
      ${nextStatus ? `
        <button class="order-action-btn advance" onclick="event.stopPropagation(); avancarStatusRapido(${pedido.id})">
          <i class="fas fa-arrow-right"></i> ${nextLabel}
        </button>
      ` : ''}
    </div>
  `;

    card.addEventListener('click', () => abrirDetalhes(pedido.id));

    return card;
}

function atualizarEstatisticas() {
    const counts = { pending: 0, preparing: 0, ready: 0 };
    let totalValor = 0;

    pedidos.forEach(p => {
        if (counts.hasOwnProperty(p.status)) counts[p.status]++;
        totalValor += parseFloat(p.total || 0);
    });

    document.getElementById('stat-pending').textContent = counts.pending;
    document.getElementById('stat-preparing').textContent = counts.preparing;
    document.getElementById('stat-ready').textContent = counts.ready;
    document.getElementById('stat-total').textContent = `R$ ${totalValor.toFixed(0)}`;
}

// ============================================================
// DETALHES DO PEDIDO
// ============================================================

function abrirDetalhes(pedidoId) {
    pedidoSelecionado = pedidos.find(p => p.id === pedidoId);
    if (!pedidoSelecionado) return;

    const p = pedidoSelecionado;

    // Título
    document.getElementById('modal-order-title').textContent = `Pedido #${p.id}`;

    // Alerta de blacklist
    const alertEl = document.getElementById('blacklist-alert');
    alertEl.style.display = (p.is_blacklisted === 1 || p.is_blacklisted === true) ? 'flex' : 'none';

    // Detectar retirada - usar campo is_pickup da tabela pedidos
    const isPickup = p.is_pickup === 1 || p.is_pickup === true || p.retirada;

    // Atualizar badge de tipo de entrega
    const badgeDelivery = document.getElementById('badge-delivery');
    if (badgeDelivery) {
        if (isPickup) {
            badgeDelivery.innerHTML = '<i class="fas fa-store"></i> RETIRADA NO LOCAL';
            badgeDelivery.style.background = 'var(--purple)';
        } else {
            badgeDelivery.innerHTML = '<i class="fas fa-motorcycle"></i> ENTREGA';
            badgeDelivery.style.background = 'var(--info)';
        }
    }

    // Dados do cliente
    document.getElementById('modal-customer-name').textContent = p.cliente_nome || '-';

    // WhatsApp - Prioridade: whatsapp_id -> cliente_telefone -> whatsapp -> telefone
    // O whatsapp_id pode ter formato como 5541998765432@c.us
    let telefone = '';
    if (p.whatsapp_id) {
        // Extrair apenas números do whatsapp_id (ex: 5541998765432@c.us -> 5541998765432)
        telefone = String(p.whatsapp_id).replace(/\D/g, '');
    } else {
        telefone = p.cliente_telefone || p.whatsapp || p.telefone || p.phone || '';
    }

    // Limpar número para link do WhatsApp (remover caracteres não numéricos)
    const numeroLimpo = String(telefone).replace(/\D/g, '');
    const whatsappLink = document.getElementById('whatsapp-link');
    const whatsappNumber = document.getElementById('whatsapp-number');
    const whatsappActionBtn = document.getElementById('whatsapp-action-btn');

    if (numeroLimpo && numeroLimpo.length >= 10) {
        // Adicionar código do país se não tiver
        const numeroCompleto = numeroLimpo.startsWith('55') ? numeroLimpo : '55' + numeroLimpo;
        const linkWpp = `https://wa.me/${numeroCompleto}`;

        // Formatar número para exibição
        const numFormatado = formatarTelefone(numeroLimpo);

        whatsappNumber.textContent = numFormatado;
        whatsappLink.href = linkWpp;
        whatsappLink.style.display = 'flex';
        whatsappActionBtn.href = linkWpp;
        whatsappActionBtn.style.display = 'flex';
    } else {
        whatsappNumber.textContent = telefone || '-';
        whatsappLink.href = '#';
        whatsappLink.style.display = 'flex';
        whatsappActionBtn.style.display = 'none';
    }

    document.getElementById('modal-customer-address').textContent = p.cliente_endereco || '-';
    document.getElementById('modal-payment').textContent = p.forma_pagamento || '-';

    // Data/hora
    const data = new Date(p.data);
    document.getElementById('modal-datetime').textContent = data.toLocaleString('pt-BR');

    // Troco
    const trocoEl = document.getElementById('modal-troco');
    const trocoContainer = document.getElementById('troco-container');
    const troco = p.troco || p.change_for || p.valor_troco || '';
    if (troco && parseFloat(troco) > 0) {
        trocoEl.textContent = `R$ ${parseFloat(troco).toFixed(2).replace('.', ',')}`;
        trocoContainer.style.display = 'block';
    } else {
        trocoEl.textContent = '-';
        trocoContainer.style.display = p.forma_pagamento?.toLowerCase().includes('dinheiro') ? 'block' : 'none';
    }

    // Observação
    const obsEl = document.getElementById('modal-observacao');
    const obs = p.observacao || p.observacao_entrega || p.notes || '';
    obsEl.textContent = obs || '-';

    // Itens - incluindo adicionais e observações de cada item
    const itensContainer = document.getElementById('modal-items-list');
    const itens = p.itens || [];

    if (itens.length === 0) {
        itensContainer.innerHTML = '\u003cp style=\"color: var(--text-muted);\"\u003eNenhum item registrado\u003c/p\u003e';
    } else {
        itensContainer.innerHTML = itens.map(item => {
            // Extrair adicionais e buffet - pode estar em item.adicionais ou serializado em JSON
            let adicionais = [];
            let buffetList = [];
            try {
                if (item.adicionais) {
                    if (typeof item.adicionais === 'string') {
                        const parsed = JSON.parse(item.adicionais);
                        // Novo formato: objeto com adicionais e buffet
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            adicionais = parsed.adicionais || [];
                            buffetList = parsed.buffet || [];
                        } else {
                            adicionais = parsed || [];
                        }
                    } else if (Array.isArray(item.adicionais)) {
                        adicionais = item.adicionais;
                    } else if (typeof item.adicionais === 'object') {
                        adicionais = item.adicionais.adicionais || [];
                        buffetList = item.adicionais.buffet || [];
                    }
                }
            } catch (e) {
                console.warn('Erro ao parsear adicionais:', e);
            }

            // Calcular preço total dos adicionais
            const precoAdicionais = adicionais.reduce((acc, a) => {
                return acc + (parseFloat(a.preco || a.price || 0));
            }, 0);

            // Preço base do item + adicionais
            const precoBase = parseFloat(item.preco_unitario || item.preco || 0);
            const precoItemTotal = (precoBase + precoAdicionais) * (item.quantidade || 1);

            // Observação do item (montagem do lanche)
            const obsItem = item.observacao || item.obs || '';

            // Gerar HTML de adicionais com preços
            const adicionaisHtml = adicionais.length > 0
                ? `<div class="item-extras" style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; padding-left: 10px;">
                    <i class="fas fa-plus-circle" style="color: var(--success); margin-right: 5px;"></i>
                    ${adicionais.map(a => {
                    const nome = a.nome || a.name || a;
                    const preco = parseFloat(a.preco || a.price || 0);
                    return preco > 0 ? `${nome} (+R$${preco.toFixed(2).replace('.', ',')})` : nome;
                }).join(', ')}
                   </div>`
                : '';

            // Gerar HTML do buffet (para marmitas)
            const buffetHtml = buffetList.length > 0
                ? `<div class="item-buffet" style="font-size: 0.85rem; color: #3498db; margin-top: 4px; padding-left: 10px;">
                    <i class="fas fa-utensils" style="margin-right: 5px;"></i>
                    Buffet: ${buffetList.map(b => b.nome || b.name || b).join(', ')}
                   </div>`
                : '';

            // Gerar HTML de observação do item
            const obsHtml = obsItem
                ? `<div class="item-obs" style="font-size: 0.85rem; color: var(--warning); margin-top: 4px; padding-left: 10px; font-style: italic;">
                    <i class="fas fa-comment" style="margin-right: 5px;"></i>${obsItem}
                   </div>`
                : '';

            return `
            <div class="item-row" style="flex-direction: column; align-items: stretch; position: relative;" data-item-id="${item.id}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <span class="item-name">${item.produto_nome || item.nome || 'Produto'}</span>
                        <span class="item-qty"> x${item.quantidade || 1}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="item-price">R$ ${precoItemTotal.toFixed(2).replace('.', ',')}</span>
                        <div class="item-actions" style="display: flex; gap: 4px;">
                            <button onclick="event.stopPropagation(); editarQuantidadeItem(${item.id}, ${item.quantidade || 1})" 
                                    style="background: var(--info); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;" 
                                    title="Alterar quantidade">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="event.stopPropagation(); removerItem(${item.id})" 
                                    style="background: var(--danger); color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;" 
                                    title="Remover item">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                ${adicionaisHtml}
                ${buffetHtml}
                ${obsHtml}
            </div>
            `;
        }).join('');

        // Adicionar botão para adicionar novo item
        itensContainer.innerHTML += `
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border);">
                <button onclick="abrirModalAdicionarItem()" 
                        style="width: 100%; background: linear-gradient(135deg, var(--success), #27ae60); color: white; border: none; border-radius: 8px; padding: 12px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-plus"></i> Adicionar Item
                </button>
            </div>
        `;
    }

    // Calcular valores - incluindo preço dos adicionais
    const subtotal = itens.reduce((acc, item) => {
        // Extrair adicionais para calcular
        let adicionais = [];
        try {
            if (item.adicionais) {
                if (typeof item.adicionais === 'string') {
                    const parsed = JSON.parse(item.adicionais);
                    adicionais = parsed.adicionais || parsed || [];
                } else if (Array.isArray(item.adicionais)) {
                    adicionais = item.adicionais;
                } else if (typeof item.adicionais === 'object') {
                    adicionais = item.adicionais.adicionais || [];
                }
            }
        } catch (e) { }

        const precoAdicionais = adicionais.reduce((sum, a) => sum + parseFloat(a.preco || a.price || 0), 0);
        const precoBase = parseFloat(item.preco_unitario || item.preco || 0);
        return acc + ((precoBase + precoAdicionais) * (item.quantidade || 1));
    }, 0);

    const taxa = parseFloat(p.valor_entrega || p.taxa_entrega || p.delivery_fee || 0);
    const total = parseFloat(p.total || 0);

    // Subtotal
    document.getElementById('modal-subtotal').textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;

    // Taxa de entrega
    const taxaRow = document.getElementById('taxa-row');
    const taxaEl = document.getElementById('modal-taxa');
    if (taxa > 0) {
        taxaEl.textContent = `R$ ${taxa.toFixed(2).replace('.', ',')}`;
        taxaRow.style.display = 'flex';
    } else if (isPickup) {
        taxaRow.style.display = 'none';
    } else {
        taxaEl.textContent = 'Grátis';
        taxaRow.style.display = 'flex';
    }

    // Total
    document.getElementById('modal-total').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    // Botões de ação
    const nextStatus = getNextStatus(p.status);
    document.getElementById('btn-advance').style.display = nextStatus ? 'flex' : 'none';

    openModal('order-modal');
}

// ============================================================
// AÇÕES DE PEDIDO
// ============================================================

async function advanceStatus() {
    if (!pedidoSelecionado) return;
    const next = getNextStatus(pedidoSelecionado.status);
    if (next) await atualizarStatus(pedidoSelecionado.id, next);
    closeModal('order-modal');
}

async function backStatus() {
    if (!pedidoSelecionado) return;
    const prev = getPrevStatus(pedidoSelecionado.status);
    if (prev) await atualizarStatus(pedidoSelecionado.id, prev);
    closeModal('order-modal');
}

async function avancarStatusRapido(pedidoId) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const next = getNextStatus(pedido.status);
    if (next) await atualizarStatus(pedidoId, next);
}

async function atualizarStatus(pedidoId, novoStatus) {
    try {
        const response = await fetch(`/api/pedidos/${pedidoId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus })
        });

        if (response.ok) {
            await carregarPedidos();
        }
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}


async function markAsScammer() {
    console.log('🚫 markAsScammer() chamada');
    console.log('pedidoSelecionado:', window.pedidoSelecionado || pedidoSelecionado);

    // Tentar pegar de window se não estiver disponível
    const pedido = window.pedidoSelecionado || pedidoSelecionado;

    if (!pedido) {
        console.error('❌ pedidoSelecionado não definido');
        showToast('Erro: Pedido não selecionado.', 'error');
        return;
    }

    const telefone = pedido.cliente_telefone;
    const nome = pedido.cliente_nome;
    const temTelefone = telefone && telefone !== 'Não informado' && telefone.trim() !== '';

    console.log('📞 Telefone:', telefone, '| Tem telefone:', temTelefone);

    if (!temTelefone) {
        showToast('Pedido sem telefone não pode ser bloqueado.', 'error');
        return;
    }

    const identificador = nome || 'Cliente';

    // Usar modal customizado em vez de prompt nativo
    const motivo = await showInputModal({
        title: '🚫 Adicionar à Blacklist',
        message: `<div style="margin-bottom: 15px;">
            <div style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 8px;">Telefone:</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: #e74c3c; margin-bottom: 15px;">${telefone}</div>
            <div style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 8px;">Cliente:</div>
            <div style="font-size: 1rem; font-weight: 500; margin-bottom: 15px;">${identificador}</div>
        </div>`,
        placeholder: 'Digite o motivo (ex: Golpista, Trote, Calote...)',
        defaultValue: 'Golpista/Calote',
        confirmText: 'Bloquear',
        cancelText: 'Cancelar'
    });

    if (motivo === null) {
        console.log('⏸️ Usuário cancelou');
        return;
    }

    try {
        console.log('📡 Enviando para /api/blacklist...');

        // Adicionar telefone à blacklist
        const response = await fetch('/api/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, motivo: motivo || 'Golpista' })
        });

        const data = await response.json();
        console.log('📥 Resposta da API:', data);

        if (data.success) {
            showToast(`Número ${telefone} adicionado à blacklist!`, 'success');

            // Recarregar blacklist para atualizar verificações
            if (typeof carregarBlacklist === 'function') {
                await carregarBlacklist();
            }

            // Fechar modal
            closeModal('order-modal');

            // Recarregar pedidos para atualizar indicadores visuais
            if (typeof carregarPedidos === 'function') {
                await carregarPedidos();
            }
        } else {
            showToast(data.error || 'Erro ao adicionar à blacklist.', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao marcar golpista:', error);
        showToast('Erro ao adicionar à blacklist.', 'error');
    }
}

// Garantir que a função está disponível globalmente
window.markAsScammer = markAsScammer;


// ============================================================
// IMPRESSÃO
// ============================================================

function printOrder() {
    if (!pedidoSelecionado) return;
    imprimirPedido(pedidoSelecionado);
}

function imprimirPedido(pedido) {
    try {
        const conteudo = formatarPedidoParaImpressao(pedido);

        // Remover iframe anterior se existir
        const iframeAntigo = document.getElementById('print-iframe');
        if (iframeAntigo) iframeAntigo.remove();

        // Criar iframe oculto para impressão
        const iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.cssText = 'position: absolute; width: 0; height: 0; border: none; visibility: hidden;';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
      <html>
        <head>
          <title>Pedido #${pedido.id}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 20px; line-height: 1.6; margin: 0; padding: 10px; width: 80mm; }
            pre { margin: 0; white-space: pre-wrap; }
            @media print { body { width: 80mm; margin: 0; padding: 5px; } }
          </style>
        </head>
        <body><pre>${conteudo}</pre></body>
      </html>
    `);
        doc.close();

        // Aguardar o conteúdo carregar e imprimir
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            // Remover iframe após impressão
            setTimeout(() => iframe.remove(), 1000);
        }, 300);
    } catch (error) {
        console.error('Erro ao imprimir:', error);
        showToast('Erro ao imprimir pedido.', 'error');
    }
}

function formatarPedidoParaImpressao(pedido) {
    const largura = 48;
    const linha = '='.repeat(largura);
    const linhaPontilhada = '-'.repeat(largura);

    const centralizar = (texto) => {
        const espacos = Math.max(0, Math.floor((largura - texto.length) / 2));
        return ' '.repeat(espacos) + texto;
    };

    let texto = '';

    // Cabeçalho
    texto += centralizar('BRUTUS BURGER') + '\n';
    texto += centralizar('(42) 9 9983-0247') + '\n';
    texto += linha + '\n';
    texto += centralizar(`PEDIDO #${pedido.id}`) + '\n';
    texto += linha + '\n';

    const data = new Date(pedido.data);
    texto += `DATA: ${data.toLocaleDateString('pt-BR')}\n`;
    texto += `HORA: ${data.toLocaleTimeString('pt-BR')}\n`;
    texto += linhaPontilhada + '\n';

    texto += `CLIENTE: ${pedido.cliente_nome || 'N/A'}\n`;
    if (pedido.cliente_telefone) texto += `TEL: ${pedido.cliente_telefone}\n`;
    if (pedido.cliente_endereco) texto += `END: ${pedido.cliente_endereco}\n`;
    if (pedido.observacao_entrega) texto += `OBS: ${pedido.observacao_entrega}\n`;
    texto += `PAG: ${pedido.forma_pagamento || 'N/A'}\n`;
    texto += linhaPontilhada + '\n';

    texto += 'ITENS:\n';
    (pedido.itens || []).forEach(item => {
        const nome = item.produto_nome || item.nome || 'Produto';
        const qty = item.quantidade || 1;
        const preco = parseFloat(item.preco_unitario || item.preco || 0);

        texto += `  ${qty}x ${nome}\n`;
        texto += `     R$ ${preco.toFixed(2)} = R$ ${(preco * qty).toFixed(2)}\n`;

        // Extrair e imprimir adicionais
        let adicionais = [];
        let buffetList = [];
        try {
            if (item.adicionais) {
                if (typeof item.adicionais === 'string') {
                    const parsed = JSON.parse(item.adicionais);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        adicionais = parsed.adicionais || [];
                        buffetList = parsed.buffet || [];
                    } else {
                        adicionais = parsed || [];
                    }
                } else if (Array.isArray(item.adicionais)) {
                    adicionais = item.adicionais;
                } else if (typeof item.adicionais === 'object') {
                    adicionais = item.adicionais.adicionais || [];
                    buffetList = item.adicionais.buffet || [];
                }
            }
        } catch (e) { /* ignore */ }

        // Imprimir adicionais (multiplicados pela quantidade do item)
        if (adicionais.length > 0) {
            adicionais.forEach(adicional => {
                const nomeAd = adicional.nome || adicional.name || adicional;
                const precoAd = parseFloat(adicional.preco || adicional.price || 0);
                if (precoAd > 0) {
                    const precoAdTotal = precoAd * qty;
                    texto += `     + ${nomeAd} (+R$ ${precoAdTotal.toFixed(2)})\n`;
                } else {
                    texto += `     + ${nomeAd}\n`;
                }
            });
        }

        // Imprimir buffet
        if (buffetList.length > 0) {
            texto += `     BUFFET: ${buffetList.map(b => b.nome || b.name || b).join(', ')}\n`;
        }

        // Imprimir observações do item
        const obsItem = item.observacao || item.obs || '';
        if (obsItem && obsItem.trim()) {
            texto += `     OBS: ${obsItem.trim()}\n`;
        }
    });

    texto += linha + '\n';
    texto += centralizar(`TOTAL: R$ ${parseFloat(pedido.total || 0).toFixed(2)}`) + '\n';
    texto += linha + '\n';

    return texto;
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================

async function saveSettings() {
    try {
        const settings = {
            ...customSettings,
            restaurantName: document.getElementById('setting-name').value,
            hours: document.getElementById('setting-hours').value,
            contact: document.getElementById('setting-phone').value,
            pixKey: document.getElementById('setting-pix').value,
            pixName: document.getElementById('setting-pix-name').value,
            pickupEnabled: document.getElementById('setting-pickup').checked
        };

        const response = await fetch('/api/custom-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            customSettings = settings;
            document.getElementById('restaurant-name').textContent = settings.restaurantName || 'Painel de Gestão';
            closeModal('settings-modal');
            alert('Configurações salvas com sucesso!');
        }
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        alert('Erro ao salvar configurações.');
    }
}

// ============================================================
// ROBÔ E AUTO-PRINT
// ============================================================

async function carregarEstadoRobo() {
    try {
        const response = await fetch('/api/robot/status');
        const data = await response.json();
        robotEnabled = data.enabled;
        atualizarUIRobo();
    } catch (error) {
        console.error('Erro ao carregar estado do robô:', error);
    }
}

async function toggleRobot() {
    try {
        const novoEstado = !robotEnabled;
        const response = await fetch('/api/robot/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: novoEstado })
        });

        if (response.ok) {
            robotEnabled = novoEstado;
            atualizarUIRobo();
        }
    } catch (error) {
        console.error('Erro ao alternar robô:', error);
    }
}

function atualizarUIRobo() {
    const statusEl = document.getElementById('robot-status');
    const textEl = document.getElementById('robot-status-text');

    if (robotEnabled) {
        statusEl.className = 'status-indicator online';
        textEl.textContent = 'Robô Ligado';
    } else {
        statusEl.className = 'status-indicator offline';
        textEl.textContent = 'Robô Desligado';
    }
}

function carregarEstadoAutoPrint() {
    autoPrintEnabled = localStorage.getItem('autoPrintEnabled') === 'true';
    atualizarUIAutoPrint();
}

function toggleAutoPrint() {
    autoPrintEnabled = !autoPrintEnabled;
    localStorage.setItem('autoPrintEnabled', autoPrintEnabled);
    atualizarUIAutoPrint();
}

function atualizarUIAutoPrint() {
    const btn = document.getElementById('auto-print-btn');
    if (autoPrintEnabled) {
        btn.classList.add('primary');
        btn.innerHTML = '<i class="fas fa-print"></i> Auto-Print: ON';
    } else {
        btn.classList.remove('primary');
        btn.innerHTML = '<i class="fas fa-print"></i> Auto-Print: OFF';
    }

    // Também atualizar toggle nas configurações
    const toggle = document.getElementById('setting-autoprint');
    if (toggle) toggle.checked = autoPrintEnabled;
}

// ============================================================
// ATUALIZAÇÃO AUTOMÁTICA
// ============================================================

function iniciarAtualizacaoAutomatica() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(carregarPedidos, 15000); // 15 segundos
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function getNextStatus(status) {
    const ordem = ['pending', 'preparing', 'ready', 'delivered'];
    const idx = ordem.indexOf(status);
    return idx >= 0 && idx < ordem.length - 1 ? ordem[idx + 1] : null;
}

function getPrevStatus(status) {
    const ordem = ['pending', 'preparing', 'ready', 'delivered'];
    const idx = ordem.indexOf(status);
    return idx > 0 ? ordem[idx - 1] : null;
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Pendente',
        preparing: 'Preparar',
        ready: 'Pronto',
        delivered: 'Entregue'
    };
    return labels[status] || status;
}

// Formatar telefone para exibição
function formatarTelefone(numero) {
    // Remove tudo que não é dígito
    const digits = String(numero).replace(/\D/g, '');

    // Se começa com 55, remove para formatação
    const num = digits.startsWith('55') ? digits.substring(2) : digits;

    // Formatar como (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (num.length === 11) {
        return `(${num.substring(0, 2)}) ${num.substring(2, 7)}-${num.substring(7)}`;
    } else if (num.length === 10) {
        return `(${num.substring(0, 2)}) ${num.substring(2, 6)}-${num.substring(6)}`;
    }
    return numero;
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        // Se for o modal de estatísticas de entregas, calcular os valores
        if (id === 'delivery-stats-modal') {
            calcularEstatisticasEntregas();
        }
    }
}

// Função para calcular estatísticas de faturamento por período
function calcularEstatisticasEntregas() {
    const now = new Date();
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Início da semana (domingo)
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());

    // Início do mês
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalHoje = 0;
    let totalSemana = 0;
    let totalMes = 0;
    let totalGeral = 0;

    // Taxas de entrega para pagamento do motoboy
    let taxaHoje = 0;
    let taxaSemana = 0;
    let taxaMes = 0;

    // Calcular totais por período
    pedidos.forEach(p => {
        const dataPedido = new Date(p.data);
        const valor = parseFloat(p.total || 0);
        const taxa = parseFloat(p.valor_entrega || p.taxa_entrega || p.delivery_fee || 0);

        // Total geral (todos os pedidos)
        totalGeral += valor;

        // Total do mês
        if (dataPedido >= inicioMes) {
            totalMes += valor;
            taxaMes += taxa;
        }

        // Total da semana
        if (dataPedido >= inicioSemana) {
            totalSemana += valor;
            taxaSemana += taxa;
        }

        // Total de hoje
        if (dataPedido >= hoje) {
            totalHoje += valor;
            taxaHoje += taxa;
        }
    });

    // Atualizar os elementos do modal - Faturamento
    document.getElementById('delivery-stat-today').textContent = `R$ ${totalHoje.toFixed(2).replace('.', ',')}`;
    document.getElementById('delivery-stat-week').textContent = `R$ ${totalSemana.toFixed(2).replace('.', ',')}`;
    document.getElementById('delivery-stat-month').textContent = `R$ ${totalMes.toFixed(2).replace('.', ',')}`;
    document.getElementById('delivery-stat-total').textContent = `R$ ${totalGeral.toFixed(2).replace('.', ',')}`;

    // Atualizar os elementos do modal - Taxas de Entrega (Motoboy)
    document.getElementById('fee-stat-today').textContent = `R$ ${taxaHoje.toFixed(2).replace('.', ',')}`;
    document.getElementById('fee-stat-week').textContent = `R$ ${taxaSemana.toFixed(2).replace('.', ',')}`;
    document.getElementById('fee-stat-month').textContent = `R$ ${taxaMes.toFixed(2).replace('.', ',')}`;
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

// ============================================================
// GERENCIAMENTO DE ITENS DO PEDIDO
// ============================================================

// Variável para armazenar item sendo editado
let itemSendoEditado = null;

// Editar quantidade de um item - usa modal customizado
async function editarQuantidadeItem(itemId, quantidadeAtual) {
    if (!pedidoSelecionado) return;

    itemSendoEditado = { itemId, quantidadeAtual };

    // Configurar modal de edição de quantidade
    document.getElementById('edit-qty-atual').textContent = quantidadeAtual;
    document.getElementById('edit-qty-nova').value = quantidadeAtual;

    openModal('edit-quantity-modal');
}

// Confirmar alteração de quantidade
async function confirmarAlteracaoQuantidade() {
    if (!pedidoSelecionado || !itemSendoEditado) return;

    const qtd = parseInt(document.getElementById('edit-qty-nova').value);
    if (isNaN(qtd) || qtd < 1) {
        showToast('Quantidade inválida!', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/pedidos/${pedidoSelecionado.id}/itens/${itemSendoEditado.itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantidade: qtd })
        });

        const data = await response.json();
        if (data.success) {
            closeModal('edit-quantity-modal');
            const totalStr = data.novoTotal != null ? `R$ ${parseFloat(data.novoTotal).toFixed(2).replace('.', ',')}` : 'atualizado';
            showToast(`Quantidade alterada! Novo total: ${totalStr}`, 'success');
            await carregarPedidos();
            abrirDetalhes(pedidoSelecionado.id);
        } else {
            showToast('Erro: ' + (data.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao editar item:', error);
        showToast('Erro ao alterar quantidade.', 'error');
    }
}

// Remover item do pedido - usa modal de confirmação customizado
async function removerItem(itemId) {
    if (!pedidoSelecionado) return;

    itemSendoEditado = { itemId };
    openModal('confirm-remove-modal');
}

// Confirmar remoção de item
async function confirmarRemoverItem() {
    if (!pedidoSelecionado || !itemSendoEditado) return;

    try {
        const response = await fetch(`/api/pedidos/${pedidoSelecionado.id}/itens/${itemSendoEditado.itemId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            closeModal('confirm-remove-modal');
            const totalStr = data.novoTotal != null ? `R$ ${parseFloat(data.novoTotal).toFixed(2).replace('.', ',')}` : 'atualizado';
            showToast(`Item removido! Novo total: ${totalStr}`, 'success');
            await carregarPedidos();
            abrirDetalhes(pedidoSelecionado.id);
        } else {
            showToast('Erro: ' + (data.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao remover item:', error);
        showToast('Erro ao remover item.', 'error');
    }
}

// Toast notification elegante
function showToast(message, type = 'info') {
    // Remover toast existente
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';

    const colors = {
        success: 'linear-gradient(135deg, #2ecc71, #27ae60)',
        error: 'linear-gradient(135deg, #e74c3c, #c0392b)',
        info: 'linear-gradient(135deg, #3498db, #2980b9)'
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: ${colors[type]};
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 600;
        animation: slideUp 0.3s ease;
    `;

    toast.innerHTML = `<i class="fas ${icons[type]}"></i> ${message}`;
    document.body.appendChild(toast);

    // Adicionar animação CSS se não existir
    if (!document.getElementById('toast-animation-style')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-style';
        style.textContent = `
            @keyframes slideUp {
                from { transform: translateX(-50%) translateY(100px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(0); opacity: 1; }
                to { transform: translateX(-50%) translateY(100px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Remover após 3 segundos
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Variável para armazenar produtos do cardápio
let produtosCardapio = [];

// Abrir modal para adicionar novo item
async function abrirModalAdicionarItem() {
    if (!pedidoSelecionado) return;

    // Carregar produtos se ainda não carregados
    if (produtosCardapio.length === 0) {
        try {
            const response = await fetch('/api/produtos');
            produtosCardapio = await response.json();
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            showToast('Erro ao carregar cardápio.', 'error');
            return;
        }
    }

    openModal('add-item-modal');

    // Popular select de produtos
    const selectProduto = document.getElementById('add-item-produto');
    selectProduto.innerHTML = '<option value="">Selecione um produto...</option>';

    // Agrupar por categoria
    const categorias = {};
    produtosCardapio.forEach(p => {
        const cat = p.categoria || 'Outros';
        if (!categorias[cat]) categorias[cat] = [];
        categorias[cat].push(p);
    });

    Object.keys(categorias).sort().forEach(cat => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = cat;
        categorias[cat].forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.nome} - R$ ${parseFloat(p.preco).toFixed(2).replace('.', ',')}`;
            option.dataset.preco = p.preco;
            optgroup.appendChild(option);
        });
        selectProduto.appendChild(optgroup);
    });

    // Resetar quantidade
    document.getElementById('add-item-quantidade').value = 1;
}

// Confirmar adição de item
async function confirmarAdicionarItem() {
    if (!pedidoSelecionado) return;

    const selectProduto = document.getElementById('add-item-produto');
    const produtoId = selectProduto.value;
    const quantidade = parseInt(document.getElementById('add-item-quantidade').value || 1);
    const observacao = document.getElementById('add-item-observacao')?.value || '';

    if (!produtoId) {
        alert('Selecione um produto.');
        return;
    }

    const produtoSelecionado = produtosCardapio.find(p => p.id == produtoId);
    if (!produtoSelecionado) {
        alert('Produto não encontrado.');
        return;
    }

    try {
        const response = await fetch(`/api/pedidos/${pedidoSelecionado.id}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                produto_id: produtoId,
                quantidade: quantidade,
                preco_unitario: produtoSelecionado.preco,
                observacao: observacao
            })
        });

        const data = await response.json();
        if (data.success) {
            closeModal('add-item-modal');
            const totalStr = data.novoTotal != null ? `R$ ${parseFloat(data.novoTotal).toFixed(2).replace('.', ',')}` : 'atualizado';
            showToast(`Item adicionado! Novo total: ${totalStr}`, 'success');
            await carregarPedidos();
            abrirDetalhes(pedidoSelecionado.id);
        } else {
            showToast('Erro ao adicionar item: ' + (data.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar item:', error);
        showToast('Erro ao adicionar item.', 'error');
    }
}

// ============================================================
// PAINEL ADMINISTRATIVO
// ============================================================

let adminProdutos = [];
let adminPeriodo = 'day';
let adminDadosVendas = [];

// Abrir painel administrativo
function abrirPainelAdmin() {
    document.getElementById('admin-panel-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
    mudarSecaoAdmin('dashboard');
}

// Fechar painel administrativo
function fecharPainelAdmin() {
    document.getElementById('admin-panel-modal').classList.remove('show');
    document.body.style.overflow = 'auto';
}

// Mudar seção do painel admin
function mudarSecaoAdmin(secao) {
    // Atualizar botões da sidebar
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.section === secao) btn.classList.add('active');
    });

    // Mostrar seção correta
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(`admin-section-${secao}`).style.display = 'block';

    // Carregar dados da seção
    if (secao === 'dashboard') carregarDashboard();
    else if (secao === 'cardapio') carregarCardapioAdmin();
    else if (secao === 'buffet') carregarBuffetAdmin();
    else if (secao === 'configuracoes') carregarConfiguracoesAdmin();
    else if (secao === 'clientes') carregarClientesAdmin();
    else if (secao === 'whatsapp') verificarStatusWhatsApp();
}

// ============================================================
// BUFFET DO DIA
// ============================================================

let buffetItens = [];

// Abrir modal de buffet diretamente do header
function abrirBuffetModal() {
    openModal('buffet-modal');
    carregarBuffetAdmin();
}

async function carregarBuffetAdmin() {
    const container = document.getElementById('buffet-lista');
    const countBadge = document.getElementById('buffet-count');

    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size: 1.5rem;"></i><p>Carregando...</p></div>';

    try {
        const response = await fetch('/api/buffet/todos');
        const data = await response.json();

        // Verificar se a resposta tem sucesso e itens
        if (data.success && Array.isArray(data.itens)) {
            buffetItens = data.itens;
        } else if (Array.isArray(data)) {
            buffetItens = data;
        } else if (data.error) {
            container.innerHTML = `<p style="color: var(--danger);">Erro: ${data.error}</p>`;
            return;
        } else {
            buffetItens = [];
        }

        // Atualizar contador
        const ativos = buffetItens.filter(i => i.ativo === 1 || i.ativo === true).length;
        if (countBadge) countBadge.textContent = ativos;

        if (buffetItens.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-drumstick-bite" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 15px;"></i><p>Nenhum item no buffet. Adicione itens acima.</p></div>';
            return;
        }

        container.innerHTML = buffetItens.map(item => `
            <div class="buffet-item-row" style="display: flex; align-items: center; gap: 15px; padding: 12px 15px; background: ${item.ativo ? 'var(--card)' : 'rgba(45, 45, 45, 0.5)'}; border-radius: 8px; border: 1px solid var(--border); transition: all 0.3s;">
                <div style="width: 40px; height: 40px; background: ${item.ativo ? '#e67e22' : 'var(--text-muted)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-drumstick-bite" style="color: white;"></i>
                </div>
                <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 600; ${!item.ativo ? 'opacity: 0.5;' : ''}">${item.nome}</span>
                    <span style="padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; ${item.ativo ? 'background: rgba(39, 174, 96, 0.2); color: #27ae60;' : 'background: rgba(176, 176, 176, 0.2); color: #888;'}">
                        ${item.ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="toggleItemBuffet(${item.id})" 
                            style="width: 36px; height: 36px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; ${item.ativo ? 'background: rgba(241, 196, 15, 0.2); color: #f39c12;' : 'background: rgba(39, 174, 96, 0.2); color: #27ae60;'}"
                            title="${item.ativo ? 'Desativar' : 'Ativar'}">
                        <i class="fas ${item.ativo ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button onclick="removerItemBuffet(${item.id})" 
                            style="width: 36px; height: 36px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; background: rgba(231, 76, 60, 0.2); color: #e74c3c;"
                            title="Remover">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar buffet:', error);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao carregar itens do buffet.</p>';
    }
}

async function adicionarItemBuffet() {
    const input = document.getElementById('buffet-novo-item');
    const nome = input.value.trim();

    if (!nome) {
        showToast('Digite o nome do item.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/buffet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome })
        });

        const data = await response.json();
        if (data.id || data.success) {
            showToast('Item adicionado ao buffet!', 'success');
            input.value = '';
            carregarBuffetAdmin();
        } else {
            showToast(data.error || 'Erro ao adicionar item.', 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar item:', error);
        showToast('Erro ao adicionar item.', 'error');
    }
}

async function toggleItemBuffet(id) {
    try {
        const response = await fetch(`/api/buffet/${id}/toggle`, {
            method: 'PATCH'
        });

        const data = await response.json();
        if (data.success) {
            showToast(`Item ${data.item.ativo ? 'ativado' : 'desativado'}!`, 'success');
            carregarBuffetAdmin();
        } else {
            showToast('Erro ao atualizar item.', 'error');
        }
    } catch (error) {
        console.error('Erro ao toggle item:', error);
        showToast('Erro ao atualizar item.', 'error');
    }
}

async function removerItemBuffet(id) {
    if (!confirm('Tem certeza que deseja remover este item do buffet?')) return;

    try {
        const response = await fetch(`/api/buffet/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast('Item removido do buffet!', 'success');
            carregarBuffetAdmin();
        } else {
            showToast('Erro ao remover item.', 'error');
        }
    } catch (error) {
        console.error('Erro ao remover item:', error);
        showToast('Erro ao remover item.', 'error');
    }
}

// ============================================================
// ADICIONAIS DO AÇAÍ
// ============================================================

let acaiAdicionais = [];

// Abrir modal de adicionais de açaí
function abrirAcaiModal() {
    openModal('acai-modal');
    carregarAdicionaisAcai();
}

async function carregarAdicionaisAcai() {
    const container = document.getElementById('acai-lista');
    const countBadge = document.getElementById('acai-count');

    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size: 1.5rem;"></i><p>Carregando...</p></div>';

    try {
        const response = await fetch('/api/acai/adicionais');
        const data = await response.json();

        acaiAdicionais = Array.isArray(data) ? data : (data.adicionais || []);

        // Atualizar contador (apenas ativos)
        const ativos = acaiAdicionais.filter(i => i.ativo === 1 || i.ativo === true).length;
        if (countBadge) countBadge.textContent = ativos;

        if (acaiAdicionais.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-ice-cream" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 15px;"></i><p>Nenhum adicional cadastrado. Adicione itens acima.</p></div>';
            return;
        }

        // Renderizar lista simples sem agrupamento
        let html = '';
        acaiAdicionais.forEach(a => {
            const isGratis = !a.preco || parseFloat(a.preco) === 0;
            html += `
                <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: ${a.ativo ? 'var(--card)' : 'rgba(45, 45, 45, 0.5)'}; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px;">
                    <div style="width: 36px; height: 36px; background: ${a.ativo ? (isGratis ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : 'linear-gradient(135deg, #7b2cbf, #5a189a)') : 'var(--text-muted)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-${isGratis ? 'gift' : 'dollar-sign'}" style="color: white; font-size: 0.9rem;"></i>
                    </div>
                    <div style="flex: 1; ${!a.ativo ? 'opacity: 0.5;' : ''}">
                        <div style="font-weight: 600;">${a.nome}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px;">
                            <span><i class="fas fa-tag"></i> R$ ${parseFloat(a.preco || 0).toFixed(2)}</span>
                            <span><i class="fas fa-sort"></i> Ordem: ${a.ordem || 0}</span>
                        </div>
                    </div>
                    <span style="padding: 4px 10px; border-radius: 16px; font-size: 0.75rem; font-weight: 600; ${a.ativo ? 'background: rgba(39, 174, 96, 0.2); color: #27ae60;' : 'background: rgba(176, 176, 176, 0.2); color: #888;'}">
                        ${a.ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                    <div style="display: flex; gap: 6px;">
                        <button onclick="toggleAdicionalAcai(${a.id})" 
                                style="width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; ${a.ativo ? 'background: rgba(241, 196, 15, 0.2); color: #f39c12;' : 'background: rgba(39, 174, 96, 0.2); color: #27ae60;'}"
                                title="${a.ativo ? 'Desativar' : 'Ativar'}">
                            <i class="fas ${a.ativo ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button onclick="removerAdicionalAcai(${a.id})" 
                                style="width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(231, 76, 60, 0.2); color: #e74c3c;"
                                title="Remover">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Erro ao carregar adicionais:', error);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao carregar adicionais do açaí.</p>';
    }
}

async function adicionarAdicionalAcai() {
    const nome = document.getElementById('acai-novo-nome').value.trim();
    const preco = parseFloat(document.getElementById('acai-novo-preco').value) || 0;
    const ordem = parseInt(document.getElementById('acai-nova-ordem').value) || 0;

    if (!nome) {
        showToast('Digite o nome do adicional.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/acai/adicionais', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, preco, ordem })
        });

        const data = await response.json();
        if (data.success || data.id) {
            showToast('Adicional cadastrado!', 'success');
            document.getElementById('acai-novo-nome').value = '';
            document.getElementById('acai-novo-preco').value = '';
            document.getElementById('acai-nova-ordem').value = '';
            carregarAdicionaisAcai();
        } else {
            showToast(data.error || 'Erro ao adicionar.', 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar:', error);
        showToast('Erro ao adicionar adicional.', 'error');
    }
}

async function toggleAdicionalAcai(id) {
    try {
        const response = await fetch(`/api/acai/adicionais/${id}/toggle`, {
            method: 'PATCH'
        });

        const data = await response.json();
        if (data.success) {
            showToast(`Adicional ${data.adicional.ativo ? 'ativado' : 'desativado'}!`, 'success');
            carregarAdicionaisAcai();
        } else {
            showToast('Erro ao atualizar adicional.', 'error');
        }
    } catch (error) {
        console.error('Erro ao toggle adicional:', error);
        showToast('Erro ao atualizar adicional.', 'error');
    }
}

async function removerAdicionalAcai(id) {
    if (!confirm('Tem certeza que deseja remover este adicional?')) return;

    try {
        const response = await fetch(`/api/acai/adicionais/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast('Adicional removido!', 'success');
            carregarAdicionaisAcai();
        } else {
            showToast('Erro ao remover adicional.', 'error');
        }
    } catch (error) {
        console.error('Erro ao remover adicional:', error);
        showToast('Erro ao remover adicional.', 'error');
    }
}

// ============================================================
// BLACKLIST (NÚMEROS BLOQUEADOS)
// ============================================================

let blacklistNumeros = [];

// Carregar blacklist do servidor
async function carregarBlacklist() {
    try {
        const response = await fetch('/api/blacklist');
        const data = await response.json();
        blacklistNumeros = data.success ? data.lista : [];
        return blacklistNumeros;
    } catch (error) {
        console.error('Erro ao carregar blacklist:', error);
        return [];
    }
}

// Verificar se número está na blacklist
function isNumeroBlacklist(telefone) {
    if (!telefone) return false;

    // Limpar e normalizar número (remover tudo exceto dígitos)
    let telLimpo = telefone.replace(/\D/g, '');

    // Remover código do país 55 se houver
    if (telLimpo.startsWith('55') && telLimpo.length > 11) {
        telLimpo = telLimpo.substring(2);
    }

    return blacklistNumeros.some(b => {
        let blackTel = b.telefone.replace(/\D/g, '');

        // Remover código do país 55 se houver
        if (blackTel.startsWith('55') && blackTel.length > 11) {
            blackTel = blackTel.substring(2);
        }

        // Comparar números normalizados (sem 55)
        return telLimpo === blackTel ||
            telLimpo.includes(blackTel) ||
            blackTel.includes(telLimpo);
    });
}

// Abrir modal de gerenciamento de blacklist
async function abrirBlacklistModal() {
    await carregarBlacklist();

    const existingModal = document.getElementById('blacklist-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'blacklist-modal';
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal" style="max-width: 600px;">
            <div class="modal-header" style="background: linear-gradient(135deg, rgba(231, 76, 60, 0.3), rgba(192, 57, 43, 0.2));">
                <h2><i class="fas fa-ban" style="color: #e74c3c;"></i> Gerenciar Blacklist</h2>
                <button class="close-btn" onclick="fecharBlacklistModal()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div style="background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                    <p style="margin: 0; color: var(--text-muted); font-size: 0.9rem;">
                        <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
                        Números bloqueados serão automaticamente marcados como "GOLPISTA" em todos os pedidos.
                    </p>
                </div>
                
                <!-- Adicionar novo número -->
                <div style="background: var(--card); border-radius: 10px; padding: 15px; margin-bottom: 20px; border: 1px solid var(--border);">
                    <h3 style="font-size: 1rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-plus-circle" style="color: #e74c3c;"></i> Adicionar Número
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 2fr auto; gap: 10px; align-items: end;">
                        <div>
                            <label style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Telefone</label>
                            <input type="text" id="blacklist-novo-tel" placeholder="Ex: 11999999999" 
                                style="width: 100%; padding: 10px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 0.95rem;">
                        </div>
                        <div>
                            <label style="font-size: 0.85rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Motivo</label>
                            <input type="text" id="blacklist-novo-motivo" placeholder="Ex: Golpista, Trote..." 
                                style="width: 100%; padding: 10px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 0.95rem;">
                        </div>
                        <button onclick="adicionarNumeroBlacklist()" style="padding: 10px 16px; background: #e74c3c; border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                            <i class="fas fa-ban"></i> Bloquear
                        </button>
                    </div>
                </div>
                
                <!-- Lista de números bloqueados -->
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;">
                    <i class="fas fa-list"></i>
                    <span>Números Bloqueados</span>
                    <span id="blacklist-count" style="background: #e74c3c; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.85rem;">${blacklistNumeros.length}</span>
                </div>
                
                <div id="blacklist-lista" style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto;">
                    ${blacklistNumeros.length === 0 ?
            '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum número bloqueado.</p>' :
            blacklistNumeros.map(b => `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--card); border: 1px solid rgba(231, 76, 60, 0.3); border-left: 3px solid #e74c3c; border-radius: 8px;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; font-size: 1rem;">${b.telefone}</div>
                                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                                        <i class="fas fa-exclamation-circle"></i> ${b.motivo || 'Sem motivo'}
                                        <span style="margin-left: 12px; opacity: 0.7;">
                                            <i class="fas fa-calendar"></i> ${new Date(b.data_inclusao).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                </div>
                                <button onclick="removerNumeroBlacklist(${b.id})" 
                                        style="padding: 8px 14px; background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;"
                                        onmouseover="this.style.background='#e74c3c'; this.style.color='white';"
                                        onmouseout="this.style.background='rgba(231, 76, 60, 0.2)'; this.style.color='#e74c3c';">
                                    <i class="fas fa-trash"></i> Remover
                                </button>
                            </div>
                        `).join('')
        }
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharBlacklistModal() {
    const modal = document.getElementById('blacklist-modal');
    if (modal) modal.remove();
}

async function adicionarNumeroBlacklist() {
    const telefone = document.getElementById('blacklist-novo-tel').value.trim();
    const motivo = document.getElementById('blacklist-novo-motivo').value.trim();

    if (!telefone) {
        showToast('Digite o número de telefone.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, motivo: motivo || 'Golpista' })
        });

        const data = await response.json();
        if (data.success) {
            showToast('Número adicionado à blacklist!', 'success');
            await abrirBlacklistModal(); // Recarregar modal
            renderizarPedidos(); // Atualizar cards dos pedidos
        } else {
            showToast(data.error || 'Erro ao adicionar.', 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar:', error);
        showToast('Erro ao adicionar à blacklist.', 'error');
    }
}

async function removerNumeroBlacklist(id) {
    if (!confirm('Tem certeza que deseja remover este número da blacklist?')) return;

    try {
        const response = await fetch(`/api/blacklist/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast('Número removido da blacklist!', 'success');
            await abrirBlacklistModal(); // Recarregar modal
            renderizarPedidos(); // Atualizar cards dos pedidos
        } else {
            showToast('Erro ao remover.', 'error');
        }
    } catch (error) {
        console.error('Erro ao remover:', error);
        showToast('Erro ao remover da blacklist.', 'error');
    }
}

// ============================================================
// PAINEL ADMIN (Perfil da Loja)
// ============================================================

function abrirPainelAdmin() {
    const existingModal = document.getElementById('admin-panel-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'admin-panel-modal';
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
        <div class="modal" style="max-width: 900px; height: 80vh; display: flex; flex-direction: row; padding: 0; overflow: hidden;">
            <!-- Sidebar -->
            <div class="admin-sidebar" style="width: 200px; min-width: 200px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); padding: 20px 0; display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,0.1);">
                <div style="padding: 0 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 10px;">
                    <h3 style="font-size: 1rem; color: var(--primary); display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-store"></i> Perfil da Loja
                    </h3>
                </div>
                <div class="admin-menu" style="flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 0 10px;">
                    <button class="admin-menu-item active" data-section="dashboard" onclick="selecionarSecaoAdmin('dashboard', this)" style="width: 100%; padding: 12px 15px; background: rgba(155, 89, 182, 0.2); border: none; border-radius: 8px; color: white; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
                        <i class="fas fa-tachometer-alt"></i> Dashboard
                    </button>
                    <button class="admin-menu-item" data-section="cardapio" onclick="selecionarSecaoAdmin('cardapio', this)" style="width: 100%; padding: 12px 15px; background: transparent; border: none; border-radius: 8px; color: var(--text-muted); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
                        <i class="fas fa-utensils"></i> Cardapio
                    </button>
                    <button class="admin-menu-item" data-section="clientes" onclick="selecionarSecaoAdmin('clientes', this)" style="width: 100%; padding: 12px 15px; background: transparent; border: none; border-radius: 8px; color: var(--text-muted); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
                        <i class="fas fa-users"></i> Clientes
                    </button>
                    <button class="admin-menu-item" data-section="whatsapp" onclick="selecionarSecaoAdmin('whatsapp', this)" style="width: 100%; padding: 12px 15px; background: transparent; border: none; border-radius: 8px; color: var(--text-muted); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
                        <i class="fab fa-whatsapp"></i> WhatsApp
                    </button>
                    <button class="admin-menu-item" data-section="configuracoes" onclick="selecionarSecaoAdmin('configuracoes', this)" style="width: 100%; padding: 12px 15px; background: transparent; border: none; border-radius: 8px; color: var(--text-muted); text-align: left; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
                        <i class="fas fa-cog"></i> Configuracoes
                    </button>
                </div>
                <div style="padding: 15px 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button onclick="fecharPainelAdmin()" style="width: 100%; padding: 10px; background: rgba(231, 76, 60, 0.2); border: 1px solid rgba(231, 76, 60, 0.3); border-radius: 8px; color: #e74c3c; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            </div>
            
            <!-- Conteudo -->
            <div class="admin-content" id="admin-content" style="flex: 1; padding: 25px; overflow-y: auto; background: var(--bg);">
                <div id="admin-section-dashboard">
                    <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-tachometer-alt" style="color: var(--primary);"></i> Dashboard
                    </h2>
                    <p style="color: var(--text-muted);">Carregando estatisticas...</p>
                </div>
                <div id="admin-section-cardapio" style="display: none;">
                    <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-utensils" style="color: var(--primary);"></i> Gerenciar Cardapio
                    </h2>
                    <div id="admin-cardapio-content"></div>
                </div>
                <div id="admin-section-clientes" style="display: none;">
                    <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-users" style="color: var(--primary);"></i> Clientes
                    </h2>
                    <div id="admin-clientes-content"></div>
                </div>
                <div id="admin-section-whatsapp" style="display: none;">
                    <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fab fa-whatsapp" style="color: #25d366;"></i> WhatsApp
                    </h2>
                    <div style="background: var(--card); padding: 30px; border-radius: 12px; border: 1px solid var(--border); text-align: center;">
                        <div id="whatsapp-status-container">
                            <div id="whatsapp-qr-area" style="margin-bottom: 20px;">
                                <p style="color: var(--text-muted); margin-bottom: 15px;">Verificando status...</p>
                            </div>
                            <button onclick="verificarStatusWhatsApp()" style="padding: 12px 25px; background: #25d366; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                <i class="fab fa-whatsapp"></i> Verificar Conexao
                            </button>
                        </div>
                    </div>
                </div>
                <div id="admin-section-configuracoes" style="display: none;">
                    <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-cog" style="color: var(--primary);"></i> Configuracoes
                    </h2>
                    <p style="color: var(--text-muted);">Use o botao "Configuracoes" no header para acessar.</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Carregar dashboard por padrão
    carregarDashboard();
}

async function carregarDashboardAdmin() {
    const container = document.getElementById('admin-section-dashboard');
    if (!container) return;

    try {
        const response = await fetch('/api/pedidos');
        const pedidos = await response.json();
        const listaPedidos = Array.isArray(pedidos) ? pedidos : (pedidos.pedidos || []);

        const hoje = new Date();
        const pedidosHoje = listaPedidos.filter(p => new Date(p.data).toDateString() === hoje.toDateString());
        const totalHoje = pedidosHoje.reduce((acc, p) => acc + parseFloat(p.total || 0), 0);

        container.innerHTML = `
            <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-tachometer-alt" style="color: var(--primary);"></i> Dashboard
            </h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="background: linear-gradient(135deg, rgba(46, 204, 113, 0.2), rgba(39, 174, 96, 0.1)); border: 1px solid rgba(46, 204, 113, 0.3); border-radius: 12px; padding: 20px;">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Vendas Hoje</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: #2ecc71;">R$ ${totalHoje.toFixed(2).replace('.', ',')}</div>
                </div>
                <div style="background: linear-gradient(135deg, rgba(52, 152, 219, 0.2), rgba(41, 128, 185, 0.1)); border: 1px solid rgba(52, 152, 219, 0.3); border-radius: 12px; padding: 20px;">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Pedidos Hoje</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: #3498db;">${pedidosHoje.length}</div>
                </div>
                <div style="background: linear-gradient(135deg, rgba(155, 89, 182, 0.2), rgba(142, 68, 173, 0.1)); border: 1px solid rgba(155, 89, 182, 0.3); border-radius: 12px; padding: 20px;">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Total Pedidos</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: #9b59b6;">${listaPedidos.length}</div>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<p style="color: var(--text-muted);">Erro ao carregar dashboard.</p>';
    }
}

async function carregarClientesAdmin() {
    const container = document.getElementById('admin-clientes-content');
    if (!container) return;

    try {
        const response = await fetch('/api/pedidos');
        const pedidos = await response.json();
        const listaPedidos = Array.isArray(pedidos) ? pedidos : (pedidos.pedidos || []);

        // Agrupar por cliente
        const clientes = {};
        listaPedidos.forEach(p => {
            const nome = p.cliente_nome || 'Cliente Desconhecido';
            if (!clientes[nome]) {
                clientes[nome] = { nome, telefone: p.cliente_telefone, pedidos: 0, total: 0 };
            }
            clientes[nome].pedidos++;
            clientes[nome].total += parseFloat(p.total || 0);
        });

        const listaClientes = Object.values(clientes).sort((a, b) => b.total - a.total).slice(0, 20);

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${listaClientes.map(c => `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 15px; background: var(--card); border-radius: 8px; border: 1px solid var(--border);">
                        <div>
                            <div style="font-weight: 600;">${c.nome}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${c.telefone || 'Sem telefone'}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 600; color: #2ecc71;">R$ ${c.total.toFixed(2).replace('.', ',')}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${c.pedidos} pedido(s)</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<p style="color: var(--text-muted);">Erro ao carregar clientes.</p>';
    }
}

async function carregarCardapioAdmin() {
    const container = document.getElementById('admin-cardapio-content');
    if (!container) return;

    container.innerHTML = '<p style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando cardápio...</p>';

    try {
        const response = await fetch('/api/produtos');
        const produtos = await response.json();

        if (!produtos || produtos.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum produto cadastrado.</p>';
            return;
        }

        // Agrupar por categoria
        const categorias = {};
        produtos.forEach(p => {
            const cat = p.categoria || 'Sem categoria';
            if (!categorias[cat]) categorias[cat] = [];
            categorias[cat].push(p);
        });

        container.innerHTML = `
            <div style="margin-bottom: 20px; display: flex; gap: 10px;">
                <button onclick="abrirModalAdicionarProduto()" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-plus"></i> Novo Produto
                </button>
                <button onclick="abrirModalCategorias()" style="padding: 10px 20px; background: rgba(155, 89, 182, 0.2); color: var(--primary); border: 1px solid var(--primary); border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-tags"></i> Categorias
                </button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 20px;">
                ${Object.entries(categorias).map(([cat, prods]) => `
                    <div>
                        <h3 style="font-size: 1rem; color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-folder"></i> ${cat} (${prods.length})
                        </h3>
                        <div style="display: grid; gap: 10px;">
                            ${prods.map(p => `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 15px; background: var(--card); border-radius: 8px; border: 1px solid var(--border);">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600;">${p.nome}</div>
                                        <div style="font-size: 0.85rem; color: var(--text-muted);">${p.descricao || 'Sem descrição'}</div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span style="font-weight: 700; color: #2ecc71;">R$ ${parseFloat(p.preco || 0).toFixed(2).replace('.', ',')}</span>
                                        <button onclick="editarProdutoAdmin(${p.id})" style="padding: 8px 12px; background: rgba(52, 152, 219, 0.2); color: #3498db; border: none; border-radius: 6px; cursor: pointer;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button onclick="excluirProdutoAdmin(${p.id})" style="padding: 8px 12px; background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: none; border-radius: 6px; cursor: pointer;">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Erro ao carregar cardápio admin:', error);
        container.innerHTML = '<p style="color: var(--text-muted);">Erro ao carregar cardápio.</p>';
    }
}

// ============================================================
// DASHBOARD
// ============================================================

function filtrarPeriodoDash(periodo) {
    adminPeriodo = periodo;
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === periodo) btn.classList.add('active');
    });
    carregarDashboard();
}

async function carregarDashboard() {
    try {
        // Buscar todos os pedidos (incluindo histórico)
        const response = await fetch('/api/pedidos');
        const data = await response.json();
        // A API pode retornar array direto ou objeto com propriedade pedidos
        adminDadosVendas = Array.isArray(data) ? data : (data.pedidos || []);

        // Filtrar por período
        const agora = new Date();
        const pedidosFiltrados = adminDadosVendas.filter(p => {
            if (adminPeriodo === 'all') return true;
            const dataPedido = new Date(p.data);
            switch (adminPeriodo) {
                case 'day':
                    return dataPedido.toDateString() === agora.toDateString();
                case 'week':
                    const umaSemanaAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return dataPedido >= umaSemanaAtras;
                case 'month':
                    return dataPedido.getMonth() === agora.getMonth() && dataPedido.getFullYear() === agora.getFullYear();
                case 'year':
                    return dataPedido.getFullYear() === agora.getFullYear();
                default:
                    return true;
            }
        });

        // Calcular estatísticas
        const faturamento = pedidosFiltrados.reduce((acc, p) => acc + parseFloat(p.total || 0), 0);
        const numPedidos = pedidosFiltrados.length;
        const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
        const clientesUnicos = new Set(pedidosFiltrados.map(p => p.cliente_telefone || p.cliente_nome)).size;

        // Atualizar cards
        document.getElementById('dash-faturamento').textContent = `R$ ${faturamento.toFixed(2).replace('.', ',')}`;
        document.getElementById('dash-pedidos').textContent = numPedidos;
        document.getElementById('dash-ticket').textContent = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;
        document.getElementById('dash-clientes').textContent = clientesUnicos;

        // Ranking de produtos
        const vendasPorProduto = {};
        pedidosFiltrados.forEach(p => {
            (p.itens || []).forEach(item => {
                const nome = item.produto_nome || item.nome || 'Produto';
                const qty = item.quantidade || 1;
                if (!vendasPorProduto[nome]) vendasPorProduto[nome] = { nome, quantidade: 0, valor: 0 };
                vendasPorProduto[nome].quantidade += qty;
                vendasPorProduto[nome].valor += parseFloat(item.preco_unitario || 0) * qty;
            });
        });

        const ranking = Object.values(vendasPorProduto).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

        const rankingContainer = document.getElementById('produtos-ranking');
        if (ranking.length === 0) {
            rankingContainer.innerHTML = '<p style="color: var(--text-muted);">Nenhum produto vendido neste período</p>';
        } else {
            rankingContainer.innerHTML = ranking.map((prod, idx) => {
                const posClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'normal';
                return `
                    <div class="ranking-item">
                        <div class="ranking-position ${posClass}">${idx + 1}</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">${prod.nome}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">${prod.quantidade} vendido(s)</div>
                        </div>
                        <div style="color: var(--primary); font-weight: 700;">R$ ${prod.valor.toFixed(2).replace('.', ',')}</div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

// ============================================================
// CARDÁPIO - Funções auxiliares
// ============================================================

async function abrirModalAdicionarProduto() {
    // Buscar categorias existentes
    const categorias = await getCategorias();

    // Criar modal inline para adicionar produto
    const existingModal = document.getElementById('produto-edit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'produto-edit-modal';
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fas fa-plus"></i> Novo Produto</h2>
                <button class="close-btn" onclick="fecharModalProduto()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nome</label>
                    <input type="text" id="prod-nome" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Preco (R$)</label>
                    <input type="number" id="prod-preco" step="0.01" min="0" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Categoria</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="prod-categoria" style="flex: 1; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                            <option value="">Selecione ou crie nova...</option>
                            ${categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                            <option value="__NOVA__">+ Nova Categoria</option>
                        </select>
                    </div>
                    <input type="text" id="prod-categoria-nova" placeholder="Digite o nome da nova categoria..." style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white; margin-top: 8px; display: none;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Descricao</label>
                    <textarea id="prod-descricao" rows="3" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white; resize: vertical;"></textarea>
                </div>
                <button onclick="salvarNovoProduto()" style="width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-save"></i> Salvar Produto
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Adicionar listener para mostrar input de nova categoria
    document.getElementById('prod-categoria').addEventListener('change', function () {
        const inputNova = document.getElementById('prod-categoria-nova');
        if (this.value === '__NOVA__') {
            inputNova.style.display = 'block';
            inputNova.focus();
        } else {
            inputNova.style.display = 'none';
        }
    });
}

// Função auxiliar para obter categorias únicas
async function getCategorias() {
    try {
        const response = await fetch('/api/produtos');
        const produtos = await response.json();

        // Extrair categorias únicas
        const categoriasSet = new Set();
        produtos.forEach(p => {
            if (p.categoria && p.categoria.trim()) {
                categoriasSet.add(p.categoria.trim());
            }
        });

        // Converter para array e ordenar
        return Array.from(categoriasSet).sort();
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        return [];
    }
}

async function abrirModalCategorias() {
    const categorias = await getCategorias();

    const existingModal = document.getElementById('categorias-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'categorias-modal';
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fas fa-tags"></i> Gerenciar Categorias</h2>
                <button class="close-btn" onclick="fecharModalCategorias()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div style="background: rgba(52, 152, 219, 0.1); border: 1px solid rgba(52, 152, 219, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                    <p style="margin: 0; color: var(--text-muted); font-size: 0.9rem;">
                        <i class="fas fa-info-circle" style="color: #3498db;"></i>
                        Categorias são extraídas automaticamente dos produtos. Para adicionar nova categoria, basta criar um produto nela.
                    </p>
                </div>
                
                <h3 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--text-muted);">
                    <i class="fas fa-list"></i> Categorias Existentes (${categorias.length})
                </h3>
                
                <div id="lista-categorias" style="display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto;">
                    ${categorias.length === 0 ?
            '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Nenhuma categoria encontrada. Crie produtos para gerar categorias.</p>' :
            categorias.map(cat => `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 8px;">
                                <span style="font-weight: 500;">${cat}</span>
                                <span style="font-size: 0.85rem; color: var(--text-muted); padding: 3px 10px; background: rgba(155, 89, 182, 0.2); border-radius: 12px;">
                                    ${adminProdutos.filter(p => p.categoria === cat).length} produto(s)
                                </span>
                            </div>
                        `).join('')
        }
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharModalCategorias() {
    const modal = document.getElementById('categorias-modal');
    if (modal) modal.remove();
}

async function editarProdutoAdmin(id) {
    // Buscar dados do produto
    const prod = adminProdutos.find(p => p.id === id);
    if (!prod) return;

    // Buscar categorias existentes
    const categorias = await getCategorias();

    const existingModal = document.getElementById('produto-edit-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'produto-edit-modal';
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h2><i class="fas fa-edit"></i> Editar Produto</h2>
                <button class="close-btn" onclick="fecharModalProduto()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <input type="hidden" id="prod-id" value="${prod.id}">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nome</label>
                    <input type="text" id="prod-nome" value="${prod.nome || ''}" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Preco (R$)</label>
                    <input type="number" id="prod-preco" step="0.01" min="0" value="${prod.preco || 0}" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Categoria</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="prod-categoria" style="flex: 1; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                            <option value="">Selecione ou crie nova...</option>
                            ${categorias.map(cat => `<option value="${cat}" ${cat === prod.categoria ? 'selected' : ''}>${cat}</option>`).join('')}
                            ${!categorias.includes(prod.categoria) && prod.categoria ? `<option value="${prod.categoria}" selected>${prod.categoria}</option>` : ''}
                            <option value="__NOVA__">+ Nova Categoria</option>
                        </select>
                    </div>
                    <input type="text" id="prod-categoria-nova" placeholder="Digite o nome da nova categoria..." style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white; margin-top: 8px; display: none;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Descricao</label>
                    <textarea id="prod-descricao" rows="3" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white; resize: vertical;">${prod.descricao || ''}</textarea>
                </div>
                <button onclick="salvarEdicaoProduto()" style="width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-save"></i> Salvar Alteracoes
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Adicionar listener para mostrar input de nova categoria
    document.getElementById('prod-categoria').addEventListener('change', function () {
        const inputNova = document.getElementById('prod-categoria-nova');
        if (this.value === '__NOVA__') {
            inputNova.style.display = 'block';
            inputNova.focus();
        } else {
            inputNova.style.display = 'none';
        }
    });
}

function fecharModalProduto() {
    const modal = document.getElementById('produto-edit-modal');
    if (modal) modal.remove();
}

async function salvarNovoProduto() {
    const nome = document.getElementById('prod-nome').value;
    const preco = parseFloat(document.getElementById('prod-preco').value) || 0;
    let categoria = document.getElementById('prod-categoria').value;

    // Se selecionou nova categoria, pegar do input
    if (categoria === '__NOVA__') {
        categoria = document.getElementById('prod-categoria-nova').value.trim();
        if (!categoria) {
            showToast('Digite o nome da nova categoria.', 'error');
            return;
        }
    }

    const descricao = document.getElementById('prod-descricao').value;

    if (!nome) {
        showToast('Digite o nome do produto.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/produtos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, preco, categoria, descricao })
        });
        const data = await response.json();
        if (data.id || data.success) {
            showToast('Produto criado com sucesso!', 'success');
            fecharModalProduto();
            carregarCardapioAdmin();
        } else {
            showToast('Erro ao criar produto.', 'error');
        }
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        showToast('Erro ao criar produto.', 'error');
    }
}

async function salvarEdicaoProduto() {
    const id = document.getElementById('prod-id').value;
    const nome = document.getElementById('prod-nome').value;
    const preco = parseFloat(document.getElementById('prod-preco').value) || 0;
    let categoria = document.getElementById('prod-categoria').value;

    // Se selecionou nova categoria, pegar do input
    if (categoria === '__NOVA__') {
        categoria = document.getElementById('prod-categoria-nova').value.trim();
        if (!categoria) {
            showToast('Digite o nome da nova categoria.', 'error');
            return;
        }
    }

    const descricao = document.getElementById('prod-descricao').value;

    if (!nome) {
        showToast('Digite o nome do produto.', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/produtos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, preco, categoria, descricao })
        });
        const data = await response.json();
        if (data.success) {
            showToast('Produto atualizado com sucesso!', 'success');
            fecharModalProduto();
            carregarCardapioAdmin();
        } else {
            showToast('Erro ao atualizar produto.', 'error');
        }
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        showToast('Erro ao atualizar produto.', 'error');
    }
}

async function excluirProdutoAdmin(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
        const response = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showToast('Produto excluído com sucesso!', 'success');
            carregarCardapioAdmin();
        } else {
            showToast('Erro ao excluir produto.', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        showToast('Erro ao excluir produto.', 'error');
    }
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================

async function carregarConfiguracoesAdmin() {
    try {
        const response = await fetch('/api/custom-settings');
        const settings = await response.json();

        document.getElementById('config-nome-loja').value = settings.restaurantName || '';
        document.getElementById('config-hora-abre').value = settings.openTime || '18:00';
        document.getElementById('config-hora-fecha').value = settings.closeTime || '23:00';
        document.getElementById('config-pix-key').value = settings.pixKey || '';
        document.getElementById('config-pix-name').value = settings.pixName || '';
        document.getElementById('config-taxa-base').value = settings.baseFee || 5;
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
}

async function salvarConfiguracoesAdmin() {
    try {
        const settings = {
            restaurantName: document.getElementById('config-nome-loja').value,
            openTime: document.getElementById('config-hora-abre').value,
            closeTime: document.getElementById('config-hora-fecha').value,
            pixKey: document.getElementById('config-pix-key').value,
            pixName: document.getElementById('config-pix-name').value,
            baseFee: parseFloat(document.getElementById('config-taxa-base').value) || 5
        };

        const response = await fetch('/api/custom-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const data = await response.json();
        if (data.success) {
            showToast('Configurações salvas com sucesso!', 'success');
        } else {
            showToast('Erro ao salvar configurações.', 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        showToast('Erro ao salvar configurações.', 'error');
    }
}

// ============================================================
// CONFIGURAÇÕES DO ADMIN PANEL
// ============================================================

async function carregarConfiguracoesAdmin(container) {
    if (!container) {
        container = document.getElementById('admin-section-configuracoes');
    }

    container.innerHTML = `
        <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-cog" style="color: var(--primary);"></i> Configurações da Loja
        </h2>
        
        <div style="display: grid; gap: 20px; max-width: 600px;">
            <!-- Nome da Loja -->
            <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                    <i class="fas fa-store"></i> Nome da Loja
                </label>
                <input type="text" id="config-nome-loja" placeholder="Nome do restaurante"
                    style="width: 100%; padding: 12px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
            </div>
            
            <!-- Horário de Funcionamento -->
            <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                    <i class="fas fa-clock"></i> Horário de Funcionamento
                </label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="time" id="config-hora-abre"
                        style="padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                    <span>às</span>
                    <input type="time" id="config-hora-fecha"
                        style="padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
                </div>
            </div>
            
            <!-- Chave PIX -->
            <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                    <i class="fas fa-qrcode"></i> Chave PIX
                </label>
                <input type="text" id="config-pix-key" placeholder="CPF, CNPJ, E-mail ou Celular"
                    style="width: 100%; padding: 12px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white; margin-bottom: 10px;">
                <input type="text" id="config-pix-name" placeholder="Nome do Titular"
                    style="width: 100%; padding: 12px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
            </div>
            
            <!-- Taxa de Entrega Base -->
            <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                    <i class="fas fa-motorcycle"></i> Taxa de Entrega Base (R$)
                </label>
                <input type="number" id="config-taxa-base" step="0.50" min="0" placeholder="5.00"
                    style="width: 100%; padding: 12px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
            </div>
            
            <!-- Botão Salvar -->
            <button onclick="salvarConfiguracoesAdmin()"
                style="padding: 15px; background: var(--primary); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <i class="fas fa-save"></i> Salvar Configurações
            </button>
        </div>
    `;

    // Carregar dados existentes
    try {
        const response = await fetch('/api/custom-settings');
        const settings = await response.json();

        if (settings) {
            if (settings.restaurantName) document.getElementById('config-nome-loja').value = settings.restaurantName;
            if (settings.openTime) document.getElementById('config-hora-abre').value = settings.openTime;
            if (settings.closeTime) document.getElementById('config-hora-fecha').value = settings.closeTime;
            if (settings.pixKey) document.getElementById('config-pix-key').value = settings.pixKey;
            if (settings.pixName) document.getElementById('config-pix-name').value = settings.pixName;
            if (settings.baseFee !== undefined) document.getElementById('config-taxa-base').value = settings.baseFee;
        }
    } catch (error) {
        console.warn('Não foi possível carregar configurações existentes:', error);
    }
}

// ============================================================
// DASHBOARD DO PAINEL ADMIN
// ============================================================

async function verificarStatusWhatsApp() {
    const container = document.getElementById('whatsapp-qr-area');
    container.innerHTML = '<p style="color: var(--text-muted);">Verificando...</p>';

    try {
        const response = await fetch('/api/whatsapp/status');
        const data = await response.json();

        if (data.connected) {
            container.innerHTML = `
                <div style="color: #25d366; font-size: 3rem; margin-bottom: 15px;">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3 style="color: #25d366; margin-bottom: 10px;">WhatsApp Conectado!</h3>
                <p style="color: var(--text-muted);">O robô está pronto para enviar mensagens.</p>
            `;
        } else if (data.qrCodeAvailable) {
            const qrResponse = await fetch('/api/whatsapp/qrcode');
            const qrData = await qrResponse.json();

            container.innerHTML = `
                <p style="margin-bottom: 15px;">Escaneie o QR Code com o WhatsApp:</p>
                <img src="${qrData.dataUrl}" alt="QR Code" style="max-width: 250px; border-radius: 12px; background: white; padding: 15px;">
            `;
        } else {
            container.innerHTML = `
                <div style="color: var(--danger); font-size: 3rem; margin-bottom: 15px;">
                    <i class="fas fa-times-circle"></i>
                </div>
                <h3 style="color: var(--danger); margin-bottom: 10px;">WhatsApp Desconectado</h3>
                <p style="color: var(--text-muted);">Aguarde o QR Code aparecer ou reinicie o servidor.</p>
            `;
        }
    } catch (error) {
        console.error('Erro ao verificar WhatsApp:', error);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao verificar status do WhatsApp</p>';
    }
}

// ============================================================
// DASHBOARD DO PAINEL ADMIN
// ============================================================

async function carregarDashboard() {
    const container = document.getElementById('admin-section-dashboard');
    if (!container) return;

    container.innerHTML = `
        <h2 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-chart-line" style="color: var(--primary);"></i> Dashboard de Vendas
        </h2>
        
        <!-- Filtro de Período -->
        <div class="period-filter" style="display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap;">
            <button class="period-btn active" data-period="day" onclick="filtrarPeriodoDash('day')">Hoje</button>
            <button class="period-btn" data-period="week" onclick="filtrarPeriodoDash('week')">Semana</button>
            <button class="period-btn" data-period="month" onclick="filtrarPeriodoDash('month')">Mês</button>
            <button class="period-btn" data-period="year" onclick="filtrarPeriodoDash('year')">Ano</button>
            <button class="period-btn" data-period="all" onclick="filtrarPeriodoDash('all')">Total</button>
        </div>
        
        <!-- Cards de Estatísticas -->
        <div class="dash-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div class="dash-stat-card" style="background: linear-gradient(135deg, #27ae60, #2ecc71); padding: 20px; border-radius: 12px;">
                <div style="font-size: 0.85rem; opacity: 0.9;">Faturamento</div>
                <div id="dash-faturamento" style="font-size: 1.8rem; font-weight: 700;">R$ 0,00</div>
            </div>
            <div class="dash-stat-card" style="background: linear-gradient(135deg, #3498db, #2980b9); padding: 20px; border-radius: 12px;">
                <div style="font-size: 0.85rem; opacity: 0.9;">Pedidos</div>
                <div id="dash-pedidos" style="font-size: 1.8rem; font-weight: 700;">0</div>
            </div>
            <div class="dash-stat-card" style="background: linear-gradient(135deg, #9b59b6, #8e44ad); padding: 20px; border-radius: 12px;">
                <div style="font-size: 0.85rem; opacity: 0.9;">Ticket Médio</div>
                <div id="dash-ticket" style="font-size: 1.8rem; font-weight: 700;">R$ 0,00</div>
            </div>
            <div class="dash-stat-card" style="background: linear-gradient(135deg, #e67e22, #d35400); padding: 20px; border-radius: 12px;">
                <div style="font-size: 0.85rem; opacity: 0.9;">Clientes</div>
                <div id="dash-clientes" style="font-size: 1.8rem; font-weight: 700;">0</div>
            </div>
        </div>
        
        <!-- Ranking de Produtos -->
        <div class="ranking-section" style="background: var(--card); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-trophy" style="color: #f1c40f;"></i> Produtos Mais Vendidos
            </h3>
            <div id="produtos-ranking" style="display: flex; flex-direction: column; gap: 10px;">
                <p style="color: var(--text-muted);">Carregando...</p>
            </div>
        </div>
    `;

    // Carregar dados do período atual
    filtrarPeriodoDash('day');
}

async function filtrarPeriodoDash(periodo) {
    adminPeriodo = periodo;

    // Atualizar botões
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === periodo) btn.classList.add('active');
    });

    try {
        // Calcular estatísticas localmente dos pedidos
        const now = new Date();
        let filteredPedidos = pedidos;

        // Filtrar por período
        if (periodo === 'day') {
            const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            filteredPedidos = pedidos.filter(p => new Date(p.data) >= hoje);
        } else if (periodo === 'week') {
            const inicioSemana = new Date(now);
            inicioSemana.setDate(now.getDate() - now.getDay());
            inicioSemana.setHours(0, 0, 0, 0);
            filteredPedidos = pedidos.filter(p => new Date(p.data) >= inicioSemana);
        } else if (periodo === 'month') {
            const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
            filteredPedidos = pedidos.filter(p => new Date(p.data) >= inicioMes);
        } else if (periodo === 'year') {
            const inicioAno = new Date(now.getFullYear(), 0, 1);
            filteredPedidos = pedidos.filter(p => new Date(p.data) >= inicioAno);
        }
        // 'all' não filtra

        // Calcular estatísticas
        const faturamento = filteredPedidos.reduce((acc, p) => acc + parseFloat(p.total || 0), 0);
        const numPedidos = filteredPedidos.length;
        const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;

        // Contar clientes únicos
        const clientesUnicos = new Set();
        filteredPedidos.forEach(p => {
            if (p.cliente_telefone) clientesUnicos.add(p.cliente_telefone);
        });

        document.getElementById('dash-faturamento').textContent = `R$ ${faturamento.toFixed(2).replace('.', ',')}`;
        document.getElementById('dash-pedidos').textContent = numPedidos;
        document.getElementById('dash-ticket').textContent = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;
        document.getElementById('dash-clientes').textContent = clientesUnicos.size;

        // Carregar ranking de produtos
        carregarRankingProdutos(filteredPedidos);
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        showToast('Erro ao carregar estatísticas.', 'error');
    }
}

async function carregarRankingProdutos(filteredPedidos) {
    const container = document.getElementById('produtos-ranking');
    if (!container) return;

    try {
        // Contar vendas por produto
        const produtosVendas = {};

        filteredPedidos.forEach(pedido => {
            try {
                const itens = JSON.parse(pedido.itens || '[]');
                itens.forEach(item => {
                    const nome = item.produto_nome || item.nome || 'Produto';
                    const preco = parseFloat(item.preco_unitario || item.preco || 0);
                    const qtd = parseInt(item.quantidade || 1);
                    const total = preco * qtd;

                    if (!produtosVendas[nome]) {
                        produtosVendas[nome] = { nome, quantidade: 0, total: 0 };
                    }
                    produtosVendas[nome].quantidade += qtd;
                    produtosVendas[nome].total += total;
                });
            } catch (e) {
                console.warn('Erro ao processar itens do pedido:', e);
            }
        });

        // Converter para array e ordenar
        const ranking = Object.values(produtosVendas)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10); // Top 10

        if (ranking.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum produto vendido neste período.</p>';
            return;
        }

        container.innerHTML = ranking.map((item, index) => {
            const medalClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'normal';
            const medalStyle = index === 0
                ? 'background: linear-gradient(135deg, #f1c40f, #f39c12); color: #000;'
                : index === 1
                    ? 'background: linear-gradient(135deg, #bdc3c7, #95a5a6); color: #000;'
                    : index === 2
                        ? 'background: linear-gradient(135deg, #e67e22, #d35400); color: white;'
                        : 'background: var(--border); color: white;';

            return `
                <div class="ranking-item" style="display: flex; align-items: center; gap: 15px; padding: 12px; background: var(--dark); border-radius: 8px;">
                    <div class="ranking-position ${medalClass}" style="width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; ${medalStyle}">
                        ${index + 1}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${item.nome}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);">${item.quantidade} unidades</div>
                    </div>
                    <div style="font-weight: 700; color: var(--success);">R$ ${item.total.toFixed(2).replace('.', ',')}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Erro ao carregar ranking:', error);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao carregar ranking.</p>';
    }
}

// ============================================================
// CARDÁPIO DO PAINEL ADMIN
// ============================================================

async function carregarCardapioAdmin() {
    const container = document.getElementById('admin-cardapio-content');
    if (!container) return;

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <button onclick="abrirModalAdicionarProduto()" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-plus"></i> Novo Produto
            </button>
            <a href="admin.html" target="_blank" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
                <i class="fas fa-external-link-alt"></i> Painel Completo
            </a>
        </div>
        <p style="color: var(--text-muted); padding: 20px; background: rgba(52, 152, 219, 0.1); border: 1px solid rgba(52, 152, 219, 0.3); border-radius: 8px;">
            <i class="fas fa-info-circle"></i> Para gerenciar o cardápio completo com imagens, categorias e mais opções, acesse o <strong>Painel Completo</strong>.
        </p>
        <div id="admin-produtos-lista-rapida" style="margin-top: 20px; display: grid; gap: 10px;"></div>
    `;

    carregarProdutosListaRapida();
}

async function carregarProdutosListaRapida() {
    const container = document.getElementById('admin-produtos-lista-rapida');
    if (!container) return;

    try {
        const response = await fetch('/api/produtos');
        const produtos = await response.json();

        if (produtos.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum produto cadastrado.</p>';
            return;
        }

        // Agrupar por categoria
        const categorias = {};
        produtos.forEach(p => {
            const cat = p.categoria || 'Outros';
            if (!categorias[cat]) categorias[cat] = [];
            categorias[cat].push(p);
        });

        let html = '';
        Object.keys(categorias).sort().forEach(cat => {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="margin-bottom: 10px; color: var(--primary); display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-tag"></i> ${cat}
                    </h4>
                    <div style="display: grid; gap: 8px;">
                        ${categorias[cat].map(p => `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--card); border: 1px solid var(--border); border-radius: 8px;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600;">${p.nome}</div>
                                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                                        <span style="color: var(--success); font-weight: 600;">R$ ${parseFloat(p.preco).toFixed(2).replace('.', ',')}</span>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <button onclick="toggleProdutoDisponibilidade(${p.id}, ${p.disponivel ? 1 : 0})" 
                                            style="padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 6px; ${p.disponivel ? 'background: rgba(39, 174, 96, 0.2); color: #27ae60;' : 'background: rgba(231, 76, 60, 0.2); color: #e74c3c;'}"
                                            title="${p.disponivel ? 'Desativar' : 'Ativar'}">
                                        <i class="fas ${p.disponivel ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                        ${p.disponivel ? 'Disponível' : 'Indisponível'}
                                    </button>
                                    <button onclick="editarPrecoProduto(${p.id}, '${p.nome.replace(/'/g, "\\'")}', ${p.preco})" 
                                            style="width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer; background: rgba(52, 152, 219, 0.2); color: #3498db; display: flex; align-items: center; justify-content: center;"
                                            title="Editar Preço">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao carregar produtos.</p>';
    }
}

// Toggle disponibilidade do produto
async function toggleProdutoDisponibilidade(produtoId, disponivelAtual) {
    try {
        const novoStatus = disponivelAtual ? 0 : 1;

        const response = await fetch(`/api/produtos/${produtoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disponivel: novoStatus })
        });

        const data = await response.json();
        if (data.success || response.ok) {
            showToast(`Produto ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
            carregarProdutosListaRapida();
        } else {
            showToast('Erro ao atualizar produto.', 'error');
        }
    } catch (error) {
        console.error('Erro ao toggle produto:', error);
        showToast('Erro ao atualizar disponibilidade.', 'error');
    }
}

// Editar preço do produto
async function editarPrecoProduto(produtoId, produtoNome, precoAtual) {
    // Criar modal de edição de preço
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.style.zIndex = '10001';
    modal.innerHTML = `
        <div class="modal" style="max-width: 400px;">
            <div class="modal-header">
                <h2><i class="fas fa-dollar-sign"></i> Editar Preço</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p style="color: var(--text-muted); margin-bottom: 15px;">Produto: <strong>${produtoNome}</strong></p>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Preço Atual</label>
                    <input type="text" value="R$ ${parseFloat(precoAtual).toFixed(2).replace('.', ',')}" disabled
                           style="width: 100%; padding: 12px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: var(--text-muted);">
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--primary);">Novo Preço (R$)</label>
                    <input type="number" id="novo-preco-input" step="0.01" min="0" value="${parseFloat(precoAtual).toFixed(2)}"
                           style="width: 100%; padding: 12px; background: var(--bg); border: 2px solid var(--primary); border-radius: 8px; color: var(--text); font-size: 1.1rem; font-weight: 600;">
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-action-btn back" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
                <button class="modal-action-btn advance" onclick="confirmarEdicaoPreco(${produtoId})">
                    <i class="fas fa-check"></i> Salvar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('novo-preco-input').focus();
}

// Confirmar edição de preço
async function confirmarEdicaoPreco(produtoId) {
    const novoPreco = parseFloat(document.getElementById('novo-preco-input').value);

    if (isNaN(novoPreco) || novoPreco < 0) {
        showToast('Preço inválido!', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/produtos/${produtoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preco: novoPreco })
        });

        const data = await response.json();
        if (data.success || response.ok) {
            showToast(`Preço atualizado para R$ ${novoPreco.toFixed(2).replace('.', ',')}!`, 'success');
            document.querySelector('.modal-overlay').remove();
            carregarProdutosListaRapida();
        } else {
            showToast('Erro ao atualizar preço.', 'error');
        }
    } catch (error) {
        console.error('Erro ao editar preço:', error);
        showToast('Erro ao salvar novo preço.', 'error');
    }
}

function abrirModalAdicionarProduto() {
    showToast('Use o Painel Completo para adicionar produtos com imagens e mais opções.', 'info');
    // Pode abrir o admin.html em nova aba
    window.open('admin.html', '_blank');
}

// ============================================================
// CLIENTES DO PAINEL ADMIN
// ============================================================

async function carregarClientesAdmin() {
    const container = document.getElementById('admin-clientes-content');
    if (!container) return;

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 25px;">
            <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <div style="font-size: 0.85rem; color: var(--text-muted);">Total de Clientes</div>
                <div id="clientes-total" style="font-size: 2rem; font-weight: 700; color: var(--primary);">0</div>
            </div>
            <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
                <div style="font-size: 0.85rem; color: var(--text-muted);">Clientes Recorrentes</div>
                <div id="clientes-recorrentes" style="font-size: 2rem; font-weight: 700; color: #3498db;">0</div>
            </div>
        </div>
        
        <div style="background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-crown" style="color: #f1c40f;"></i> Melhores Clientes
            </h3>
            <div id="top-clientes-lista" style="display: flex; flex-direction: column; gap: 10px;">
                <p style="color: var(--text-muted);">Carregando...</p>
            </div>
        </div>
    `;

    try {
        // Analisar pedidos para obter estatísticas de clientes
        const clientesData = {};

        pedidos.forEach(pedido => {
            const tel = pedido.cliente_telefone;
            const nome = pedido.cliente_nome || 'Cliente';
            const total = parseFloat(pedido.total || 0);

            if (tel) {
                if (!clientesData[tel]) {
                    clientesData[tel] = {
                        nome,
                        telefone: tel,
                        pedidos: 0,
                        total: 0
                    };
                }
                clientesData[tel].pedidos++;
                clientesData[tel].total += total;
            }
        });

        const clientes = Object.values(clientesData);
        const totalClientes = clientes.length;
        const recorrentes = clientes.filter(c => c.pedidos > 1).length;

        document.getElementById('clientes-total').textContent = totalClientes;
        document.getElementById('clientes-recorrentes').textContent = recorrentes;

        // Carregar top clientes
        carregarTopClientes(clientes);
    } catch (error) {
        console.error('Erro ao carregar stats de clientes:', error);
        document.getElementById('clientes-total').textContent = '0';
        document.getElementById('clientes-recorrentes').textContent = '0';
    }
}

async function carregarTopClientes(clientes) {
    const container = document.getElementById('top-clientes-lista');
    if (!container) return;

    try {
        if (!clientes || clientes.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum cliente cadastrado ainda.</p>';
            return;
        }

        // Ordenar por valor total
        const topClientes = clientes
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        container.innerHTML = topClientes.map((cliente, index) => `
            <div class="cliente-item" style="display: flex; align-items: center; gap: 15px; padding: 12px; background: var(--dark); border-radius: 8px;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background: ${index < 3 ? 'linear-gradient(135deg, #f1c40f, #f39c12)' : 'var(--border)'}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; color: ${index < 3 ? '#000' : 'white'};">
                    ${index + 1}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${cliente.nome}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">${cliente.pedidos} pedidos</div>
                </div>
                <div style="font-weight: 700; color: var(--success);">R$ ${cliente.total.toFixed(2).replace('.', ',')}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar top clientes:', error);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao carregar clientes.</p>';
    }
}

// ============================================================
// NAVEGAÇÃO DO PAINEL ADMIN
// ============================================================

function selecionarSecaoAdmin(secao, botao) {
    // Atualizar botões
    document.querySelectorAll('.admin-menu-item').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
    });
    if (botao) {
        botao.style.background = 'rgba(155, 89, 182, 0.2)';
        botao.style.color = 'white';
    }

    // Esconder todas as seções
    const sections = ['dashboard', 'cardapio', 'configuracoes', 'clientes', 'whatsapp'];
    sections.forEach(s => {
        const el = document.getElementById(`admin-section-${s}`);
        if (el) el.style.display = 'none';
    });

    // Mostrar seção selecionada
    const sectionEl = document.getElementById(`admin-section-${secao}`);
    if (sectionEl) {
        sectionEl.style.display = 'block';

        // Carregar dados conforme a seção
        if (secao === 'dashboard') carregarDashboard();
        else if (secao === 'cardapio') carregarCardapioAdmin();
        else if (secao === 'clientes') carregarClientesAdmin();
        else if (secao === 'whatsapp') verificarStatusWhatsApp();
        else if (secao === 'configuracoes') {
            carregarConfiguracoesAdmin(sectionEl);
        }
    }
}

function fecharPainelAdmin() {
    const modal = document.getElementById('admin-panel-modal');
    if (modal) modal.remove();
}
