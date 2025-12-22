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

async function carregarBuffetAdmin() {
    const container = document.getElementById('buffet-lista');
    container.innerHTML = '<p style="color: var(--text-muted);">Carregando...</p>';

    try {
        const response = await fetch('/api/buffet');
        const data = await response.json();

        // Verificar se a resposta é um array
        if (Array.isArray(data)) {
            buffetItens = data;
        } else if (data.error) {
            container.innerHTML = `<p style="color: var(--danger);">Erro: ${data.error}</p>`;
            return;
        } else {
            buffetItens = [];
        }

        if (buffetItens.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum item no buffet. Adicione itens acima.</p>';
            return;
        }

        container.innerHTML = buffetItens.map(item => `
            <div class="buffet-item-row" style="display: flex; align-items: center; gap: 15px; padding: 12px 15px; background: var(--dark); border-radius: 8px;">
                <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 600;">${item.nome}</span>
                    <span style="padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; ${item.ativo ? 'background: rgba(39, 174, 96, 0.2); color: #27ae60;' : 'background: rgba(176, 176, 176, 0.2); color: #888;'}">
                        ${item.ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="toggleItemBuffet(${item.id})" 
                            style="width: 36px; height: 36px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; ${item.ativo ? 'background: rgba(241, 196, 15, 0.2); color: #f39c12;' : 'background: rgba(39, 174, 96, 0.2); color: #27ae60;'}"
                            title="${item.ativo ? 'Desativar' : 'Ativar'}">
                        <i class="fas ${item.ativo ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                    </button>
                    <button onclick="removerItemBuffet(${item.id})" 
                            style="width: 36px; height: 36px; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(231, 76, 60, 0.2); color: #e74c3c;"
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
    const item = buffetItens.find(i => i.id === id);
    if (!item) return;

    try {
        const response = await fetch(`/api/buffet/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: !item.ativo })
        });

        const data = await response.json();
        if (data.success) {
            showToast(`Item ${!item.ativo ? 'ativado' : 'desativado'}!`, 'success');
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
// CARDÁPIO
// ============================================================

async function carregarCardapioAdmin() {
    try {
        const response = await fetch('/api/produtos');
        adminProdutos = await response.json();

        const container = document.getElementById('admin-produtos-lista');
        if (adminProdutos.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum produto cadastrado</p>';
            return;
        }

        container.innerHTML = adminProdutos.map(prod => `
            <div class="produto-card-admin">
                <img src="${prod.imagem || '/placeholder.png'}" alt="${prod.nome}" onerror="this.src='/placeholder.png'">
                <h4>${prod.nome}</h4>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="price">R$ ${parseFloat(prod.preco || 0).toFixed(2).replace('.', ',')}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${prod.categoria || 'Sem categoria'}</span>
                </div>
                <div class="actions">
                    <button onclick="editarProdutoAdmin(${prod.id})" style="background: var(--info); color: white;">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button onclick="excluirProdutoAdmin(${prod.id})" style="background: var(--danger); color: white;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar cardápio:', error);
    }
}

function abrirModalAdicionarProduto() {
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
                    <input type="text" id="prod-categoria" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
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
}

function abrirModalCategorias() {
    showToast('Gerencie categorias pela lista de produtos - cada produto tem sua categoria.', 'info');
}

async function editarProdutoAdmin(id) {
    // Buscar dados do produto
    const prod = adminProdutos.find(p => p.id === id);
    if (!prod) return;

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
                    <input type="text" id="prod-categoria" value="${prod.categoria || ''}" style="width: 100%; padding: 10px; background: var(--dark); border: 1px solid var(--border); border-radius: 8px; color: white;">
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
}

function fecharModalProduto() {
    const modal = document.getElementById('produto-edit-modal');
    if (modal) modal.remove();
}

async function salvarNovoProduto() {
    const nome = document.getElementById('prod-nome').value;
    const preco = parseFloat(document.getElementById('prod-preco').value) || 0;
    const categoria = document.getElementById('prod-categoria').value;
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
    const categoria = document.getElementById('prod-categoria').value;
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

function editarProdutoAdmin(id) {
    if (confirm('Deseja abrir a página de edição em nova aba?')) {
        window.open(`/admin.html?edit=${id}`, '_blank');
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
// CLIENTES
// ============================================================

async function carregarClientesAdmin() {
    try {
        const response = await fetch('/api/pedidos');
        const data = await response.json();
        // A API pode retornar array direto ou objeto com propriedade pedidos
        const todosPedidos = Array.isArray(data) ? data : (data.pedidos || []);

        // Agrupar por cliente
        const clientesMap = {};
        todosPedidos.forEach(p => {
            const key = p.cliente_telefone || p.cliente_nome || 'Desconhecido';
            if (!clientesMap[key]) {
                clientesMap[key] = {
                    nome: p.cliente_nome || 'Cliente',
                    telefone: p.cliente_telefone || '',
                    pedidos: 0,
                    valor: 0
                };
            }
            clientesMap[key].pedidos++;
            clientesMap[key].valor += parseFloat(p.total || 0);
        });

        const clientes = Object.values(clientesMap);
        const clientesRecorrentes = clientes.filter(c => c.pedidos > 1).length;

        document.getElementById('clientes-total').textContent = clientes.length;
        document.getElementById('clientes-recorrentes').textContent = clientesRecorrentes;

        // Top clientes por valor
        const topClientes = clientes.sort((a, b) => b.valor - a.valor).slice(0, 10);

        const container = document.getElementById('top-clientes-lista');
        if (topClientes.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Nenhum cliente encontrado</p>';
        } else {
            container.innerHTML = topClientes.map((cliente, idx) => `
                <div class="cliente-item">
                    <div class="ranking-position ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'normal'}">${idx + 1}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${cliente.nome}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${cliente.pedidos} pedido(s)</div>
                    </div>
                    <div style="color: var(--primary); font-weight: 700;">R$ ${cliente.valor.toFixed(2).replace('.', ',')}</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

// ============================================================
// WHATSAPP
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
