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

// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await carregarConfiguracoes();
    await carregarPedidos();
    iniciarAtualizacaoAutomatica();
    setupEventListeners();
    carregarEstadoRobo();
    carregarEstadoAutoPrint();
});

function setupEventListeners() {
    // Botões do header
    document.getElementById('refresh-btn').addEventListener('click', carregarPedidos);
    document.getElementById('settings-btn').addEventListener('click', () => openModal('settings-modal'));
    document.getElementById('toggle-robot-btn').addEventListener('click', toggleRobot);
    document.getElementById('auto-print-btn').addEventListener('click', toggleAutoPrint);

    // Fechar modais clicando fora
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
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

        // Atualizar campos do modal de configurações
        document.getElementById('setting-name').value = customSettings.restaurantName || '';
        document.getElementById('setting-hours').value = customSettings.hours || '';
        document.getElementById('setting-phone').value = customSettings.contact || '';
        document.getElementById('setting-pix').value = customSettings.pixKey || '';
        document.getElementById('setting-pix-name').value = customSettings.pixName || '';
        document.getElementById('setting-pickup').checked = customSettings.pickupEnabled !== false;
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
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
        const novosPedidos = pedidos.filter(p => !ultimosPedidosIds.has(p.id) && p.status === 'pending');

        if (autoPrintEnabled && novosPedidos.length > 0 && ultimosPedidosIds.size > 0) {
            novosPedidos.forEach(p => imprimirPedido(p));
        }

        ultimosPedidosIds = idsAtuais;

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
    card.className = 'order-card';

    // Verificar blacklist
    const isBlacklisted = pedido.is_blacklisted === 1 || pedido.is_blacklisted === true;
    if (isBlacklisted) {
        card.classList.add('blacklisted');
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

    card.innerHTML = `
    ${isBlacklisted ? '<div class="blacklist-badge"><i class="fas fa-exclamation-triangle"></i> GOLPISTA</div>' : ''}
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
        itensContainer.innerHTML = '<p style="color: var(--text-muted);">Nenhum item registrado</p>';
    } else {
        itensContainer.innerHTML = itens.map(item => {
            // Extrair adicionais - pode estar em item.adicionais ou serializado em JSON
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
    if (!pedidoSelecionado) return;

    const telefone = pedidoSelecionado.cliente_telefone;
    const nome = pedidoSelecionado.cliente_nome;
    const temTelefone = telefone && telefone !== 'Não informado' && telefone.trim() !== '';

    const identificador = temTelefone ? telefone : (nome || 'Cliente');
    const motivo = prompt(`Marcar como GOLPISTA: ${identificador}\n\nDigite o motivo:`, 'Golpe/Calote');

    if (motivo === null) return;

    try {
        // Adicionar à blacklist se tiver telefone
        if (temTelefone) {
            await fetch('/api/blacklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefone, motivo: motivo || 'Golpe' })
            });
        }

        // Marcar pedido como blacklisted
        await fetch(`/api/pedidos/${pedidoSelecionado.id}/blacklist`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_blacklisted: 1 })
        });

        alert(`Pedido #${pedidoSelecionado.id} marcado como GOLPE!`);
        closeModal('order-modal');
        await carregarPedidos();
    } catch (error) {
        console.error('Erro ao marcar golpista:', error);
        alert('Erro ao marcar como golpista.');
    }
}

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

        const janelaImpressao = window.open('', '_blank');
        janelaImpressao.document.write(`
      <html>
        <head>
          <title>Pedido #${pedido.id}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.4; margin: 0; padding: 10px; width: 80mm; }
            pre { margin: 0; white-space: pre-wrap; }
            @media print { body { width: 80mm; margin: 0; padding: 5px; } }
          </style>
        </head>
        <body><pre>${conteudo}</pre></body>
      </html>
    `);
        janelaImpressao.document.close();
        janelaImpressao.focus();

        setTimeout(() => {
            janelaImpressao.print();
        }, 300);
    } catch (error) {
        console.error('Erro ao imprimir:', error);
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
    texto += centralizar(customSettings.restaurantName || 'RESTAURANTE') + '\n';
    texto += centralizar(customSettings.contact || '') + '\n';
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
    texto += `PAG: ${pedido.forma_pagamento || 'N/A'}\n`;
    texto += linhaPontilhada + '\n';

    texto += 'ITENS:\n';
    (pedido.itens || []).forEach(item => {
        const nome = item.produto_nome || item.nome || 'Produto';
        const qty = item.quantidade || 1;
        const preco = parseFloat(item.preco_unitario || item.preco || 0);
        texto += `  ${qty}x ${nome}\n`;
        texto += `     R$ ${preco.toFixed(2)} = R$ ${(preco * qty).toFixed(2)}\n`;
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
