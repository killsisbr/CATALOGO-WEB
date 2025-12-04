// Estado da aplicação
let pedidos = [];
let pedidoSelecionado = null;
let autoRefreshInterval = null;
let autoPrintEnabled = false;
let robotEnabled = false;

// Elementos do DOM
const elements = {
  toggleRobotBtn: document.getElementById('toggle-robot-btn'),
  robotStatusText: document.getElementById('robot-status-text'),
  refreshBtn: document.getElementById('refresh-btn'),
  autoRefreshCheckbox: document.getElementById('auto-refresh-checkbox'),
  orderDetailsModal: document.getElementById('order-details-modal'),
  orderIdDisplay: document.getElementById('order-id-display'),
  orderStatusBadge: document.getElementById('order-status-badge'),
  customerName: document.getElementById('customer-name'),
  customerPhone: document.getElementById('customer-phone'),
  customerAddress: document.getElementById('customer-address'),
  paymentMethod: document.getElementById('payment-method'),
  customerAddressNote: document.getElementById('customer-address-note'),
  orderItemsList: document.getElementById('order-items-list'),
  orderTotalAmount: document.getElementById('order-total-amount'),
  archiveOrderBtn: document.getElementById('archive-order-btn'),
  deleteOrderBtn: document.getElementById('delete-order-btn'),
  prevStatusBtn: document.getElementById('prev-status-btn'),
  nextStatusBtn: document.getElementById('next-status-btn'),
  closeButtons: document.querySelectorAll('.pc-close-button'),
  filterButtons: document.querySelectorAll('.pc-filter-btn'),
  // Contadores de filtros
  allCount: document.getElementById('all-count'),
  pendingCount: document.getElementById('pending-count'),
  preparingCount: document.getElementById('preparing-count'),
  readyCount: document.getElementById('ready-count'),
  deliveredCount: document.getElementById('delivered-count'),
  archivedCount: document.getElementById('archived-count'),
  // Containers de pedidos
  pendingOrdersContainer: document.getElementById('pending-orders-container'),
  preparingOrdersContainer: document.getElementById('preparing-orders-container'),
  readyOrdersContainer: document.getElementById('ready-orders-container'),
  deliveredOrdersContainer: document.getElementById('delivered-orders-container'),
  archivedOrdersContainer: document.getElementById('archived-orders-container'),
  // Contadores de colunas
  pendingColumnCount: document.getElementById('pending-column-count'),
  preparingColumnCount: document.getElementById('preparing-column-count'),
  readyColumnCount: document.getElementById('ready-column-count'),
  deliveredColumnCount: document.getElementById('delivered-column-count'),
  archivedColumnCount: document.getElementById('archived-column-count'),
  // Elemento da coluna de preparação
  preparingColumn: document.getElementById('preparing-column'),
  // Resumo
  totalOrders: document.getElementById('total-orders'),
  totalValue: document.getElementById('total-value'),
  pendingOrdersSummary: document.getElementById('pending-orders'),
  preparingOrdersSummary: document.getElementById('preparing-orders'),
  // Botão de teste de impressão
  printTestBtn: document.getElementById('print-test-btn'),
  // Botão de impressão de pedido
  printOrderBtn: document.getElementById('print-order-btn'),
  // Controles de adicionar item
  addItemSelect: document.getElementById('add-item-select'),
  addItemQty: document.getElementById('add-item-qty'),
  addItemPrice: document.getElementById('add-item-price'),
  addItemBtn: document.getElementById('add-item-btn')
};

// Mapeamento de status para texto e cor
const statusConfig = {
  pending: { text: 'Pendente', color: '#f39c12', icon: 'fa-clock' },
  preparing: { text: 'Em Preparação', color: '#3498db', icon: 'fa-utensils' },
  ready: { text: 'Pronto', color: '#27ae60', icon: 'fa-check-circle' },
  delivered: { text: 'Entregue', color: '#9b59b6', icon: 'fa-truck' },
  archived: { text: 'Arquivado', color: '#95a5a6', icon: 'fa-archive' }
};

// Ordem dos status
const statusOrder = ['pending', 'preparing', 'ready', 'delivered', 'archived'];

// Helpers
function parsePedidoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // SQLite format: YYYY-MM-DD HH:MM:SS (no timezone) -> convert to ISO-like format
    const sqliteLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed);
    if (sqliteLike) return new Date(trimmed.replace(' ', 'T'));
    // Fallback to Date parsing (ISO or other) - many browsers support ISO
    return new Date(trimmed);
  }
  return null;
}

// Funções do Robô
async function toggleRobot() {
  try {
    const newStatus = !robotEnabled;
    const response = await fetch('/api/robot/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newStatus })
    });
    
    const data = await response.json();
    
    if (data.success) {
      robotEnabled = newStatus;
      atualizarUIRobo();
      mostrarNotificacao(
        robotEnabled ? 'Robô ativado com sucesso!' : 'Robô desativado com sucesso!',
        'success'
      );
    } else {
      mostrarNotificacao('Erro ao alterar status do robô: ' + (data.error || 'Erro desconhecido'), 'error');
    }
  } catch (error) {
    console.error('Erro ao alternar robô:', error);
    mostrarNotificacao('Erro ao conectar com o servidor', 'error');
  }
}

async function carregarEstadoRobo() {
  try {
    const response = await fetch('/api/robot/status');
    const data = await response.json();
    
    if (data.success) {
      robotEnabled = data.enabled;
      atualizarUIRobo();
    }
  } catch (error) {
    console.error('Erro ao carregar estado do robô:', error);
  }
}

function atualizarUIRobo() {
  if (elements.toggleRobotBtn && elements.robotStatusText) {
    elements.toggleRobotBtn.setAttribute('data-status', robotEnabled ? 'on' : 'off');
    elements.robotStatusText.textContent = robotEnabled ? 'Robô: Ligado' : 'Robô: Desligado';
  }
}

function mostrarNotificacao(mensagem, tipo = 'info') {
  // Criar elemento de notificação
  const notif = document.createElement('div');
  notif.className = `pc-notification pc-notification-${tipo}`;
  notif.innerHTML = `
    <i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${mensagem}</span>
  `;
  notif.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: ${tipo === 'success' ? '#27ae60' : tipo === 'error' ? '#e74c3c' : '#3498db'};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notif);
  
  // Remover após 3 segundos
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// Cache de produtos para adicionar itens
let catalogoProdutos = [];

async function carregarProdutos() {
  if (catalogoProdutos.length > 0) return catalogoProdutos;
  try {
    const r = await fetch('/api/produtos');
    catalogoProdutos = await r.json();
    // Preencher select se existir na página
    if (elements.addItemSelect) {
      elements.addItemSelect.innerHTML = '';
      const optPlaceholder = document.createElement('option');
      optPlaceholder.value = '';
      optPlaceholder.textContent = 'Selecione um produto…';
      elements.addItemSelect.appendChild(optPlaceholder);
      catalogoProdutos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nome} — R$ ${Number(p.preco).toFixed(2).replace('.', ',')}`;
        elements.addItemSelect.appendChild(opt);
      });
    }
    return catalogoProdutos;
  } catch (e) {
    console.error('Erro ao carregar produtos:', e);
    return [];
  }
}

// Aplicar um pedido atualizado ao estado e UI
function aplicarPedidoAtualizado(pedidoAtualizado) {
  pedidoSelecionado = pedidoAtualizado;
  // Atualizar na lista principal
  const idx = pedidos.findIndex(p => p.id === pedidoAtualizado.id);
  if (idx >= 0) {
    pedidos[idx] = pedidoAtualizado;
  } else {
    pedidos.unshift(pedidoAtualizado);
  }
  // Atualizar UI do modal (itens e total)
  renderizarItensEditor(pedidoSelecionado);
  elements.orderTotalAmount.textContent = `R$ ${Number(pedidoSelecionado.total).toFixed(2).replace('.', ',')}`;
  // Atualizar o quadro resumido
  renderizarQuadro();
  atualizarResumo();
}

// Renderizar itens do pedido em modo edição
function renderizarItensEditor(pedido) {
  elements.orderItemsList.innerHTML = '';
  if (!pedido || !Array.isArray(pedido.itens)) return;
  pedido.itens.forEach(item => {
    const row = document.createElement('div');
    row.className = 'pc-item-edit-row';
    const nome = item.produto_nome || item.produto?.nome || `Produto #${item.produto_id || ''}`;
    const q = Number(item.quantidade || 1);
    const p = Number(item.preco_unitario || item.produto?.preco || 0);

    row.innerHTML = `
      <div class="pc-item-name">${nome}</div>
      <input type="number" class="qty-input" min="1" value="${q}" />
      <input type="number" class="price-input" step="0.01" min="0" value="${p}" />
      <button class="remove-item-btn" title="Remover"><i class="fas fa-times"></i></button>
    `;

    const qtyInput = row.querySelector('.qty-input');
    const priceInput = row.querySelector('.price-input');
    const removeBtn = row.querySelector('.remove-item-btn');

    // Atualizar item ao mudar quantidade ou preço (on blur/change)
    const aplicarAlteracao = async () => {
      const novaQtd = Math.max(1, parseInt(qtyInput.value || '1', 10));
      const novoPreco = Math.max(0, parseFloat(priceInput.value || '0'));
      try {
        const resp = await fetch(`/api/pedidos/${pedido.id}/itens/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantidade: novaQtd, preco_unitario: novoPreco })
        });
        const data = await resp.json();
        if (data && data.success && data.pedido) {
          aplicarPedidoAtualizado(data.pedido);
        } else {
          alert('Não foi possível atualizar o item.');
        }
      } catch (e) {
        console.error('Falha ao atualizar item:', e);
        alert('Erro ao atualizar item.');
      }
    };
    qtyInput.addEventListener('change', aplicarAlteracao);
    qtyInput.addEventListener('blur', aplicarAlteracao);
    priceInput.addEventListener('change', aplicarAlteracao);
    priceInput.addEventListener('blur', aplicarAlteracao);

    // Remover item
    removeBtn.addEventListener('click', async () => {
      if (!confirm('Remover este item do pedido?')) return;
      try {
        const resp = await fetch(`/api/pedidos/${pedido.id}/itens/${item.id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data && data.success && data.pedido) {
          aplicarPedidoAtualizado(data.pedido);
        } else {
          alert('Não foi possível remover o item.');
        }
      } catch (e) {
        console.error('Falha ao remover item:', e);
        alert('Erro ao remover item.');
      }
    });

    elements.orderItemsList.appendChild(row);

    // Render extras area (adicionais, buffet e observação)
    const extras = document.createElement('div');
    extras.className = 'pc-item-extras';
    
    // Verificar se adicionais é o novo formato { adicionais: [], buffet: [] } ou array antigo
    let adicionaisList = [];
    let buffetList = [];
    
    if (item.adicionais) {
      if (Array.isArray(item.adicionais)) {
        // Formato antigo: array direto
        adicionaisList = item.adicionais;
      } else if (typeof item.adicionais === 'object') {
        // Novo formato: objeto com adicionais e buffet
        adicionaisList = Array.isArray(item.adicionais.adicionais) ? item.adicionais.adicionais : [];
        buffetList = Array.isArray(item.adicionais.buffet) ? item.adicionais.buffet : [];
      }
    }
    
    // Exibir buffet (para marmitas)
    if (buffetList.length > 0) {
      const buffetLine = document.createElement('div');
      const textoBuffet = buffetList.map(b => b.nome || 'Item').join(', ');
      buffetLine.className = 'extras-line';
      buffetLine.style.color = '#3498db';
      buffetLine.innerHTML = `<i class="fas fa-utensils"></i> Buffet: ${textoBuffet}`;
      extras.appendChild(buffetLine);
    }
    
    // Exibir adicionais
    if (adicionaisList.length > 0) {
      const extrasLine = document.createElement('div');
      const texto = adicionaisList
        .map(a => `${a.nome || a.produto_nome || 'Adicional'}${(a.preco||a.preco_unitario)?` (R$ ${Number(a.preco||a.preco_unitario).toFixed(2).replace('.', ',')})`:''}`)
        .join(', ');
      extrasLine.className = 'extras-line';
      extrasLine.textContent = `Adicionais: ${texto}`;
      extras.appendChild(extrasLine);
    }
    
    if (item.observacao && String(item.observacao).trim()) {
      const obsLine = document.createElement('div');
      obsLine.className = 'extras-line';
      obsLine.textContent = `Obs.: ${String(item.observacao).trim()}`;
      extras.appendChild(obsLine);
    }
    if (extras.childElementCount > 0) {
      elements.orderItemsList.appendChild(extras);
    }
  });
}

// Adicionar item ao pedido (via barra de adição)
async function adicionarItemAoPedido() {
  if (!pedidoSelecionado) return;
  const produtoId = parseInt(elements.addItemSelect.value || '0', 10);
  if (!produtoId) {
    alert('Selecione um produto.');
    return;
  }
  const qtd = Math.max(1, parseInt(elements.addItemQty.value || '1', 10));
  // Se preço não informado, usar do produto
  let preco = elements.addItemPrice.value ? parseFloat(elements.addItemPrice.value) : null;
  try {
    const resp = await fetch(`/api/pedidos/${pedidoSelecionado.id}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produto_id: produtoId, quantidade: qtd, preco_unitario: preco })
    });
    const data = await resp.json();
    if (data && data.success && data.pedido) {
      // Resetar campos de adição
      elements.addItemSelect.value = '';
      elements.addItemQty.value = '1';
      elements.addItemPrice.value = '';
      aplicarPedidoAtualizado(data.pedido);
    } else {
      alert('Não foi possível adicionar o item.');
    }
  } catch (e) {
    console.error('Falha ao adicionar item:', e);
    alert('Erro ao adicionar item.');
  }
}


// Função para carregar pedidos
async function carregarPedidos() {
  try {
    const res = await fetch('/api/pedidos');
    const novosPedidos = await res.json();
    if (!Array.isArray(novosPedidos)) {
      console.warn('/api/pedidos did not return an array:', novosPedidos);
      return;
    }
    // Remover duplicados por ID no resultado recebido do servidor
    const uniqueMap = new Map();
    if (Array.isArray(novosPedidos)) {
      novosPedidos.forEach(p => {
        // se existir múltiplos com o mesmo id, manter o que tem data mais recente
        if (!p || !p.id) return;
        const existing = uniqueMap.get(p.id);
        if (!existing) {
          uniqueMap.set(p.id, p);
        } else {
          const existingTime = new Date(existing.data || existing.created_at || existing.createdAt || 0).getTime() || 0;
          const newTime = new Date(p.data || p.created_at || p.createdAt || 0).getTime() || 0;
          if (newTime >= existingTime) uniqueMap.set(p.id, p);
        }
      });
    }
    const sanitizedPedidos = Array.from(uniqueMap.values());
    // Ordenar por data decrescente (mais recente primeiro) para exibir os pedidos recentes no topo
    sanitizedPedidos.sort((a, b) => {
      const ta = parsePedidoDate(a.data) || new Date(0);
      const tb = parsePedidoDate(b.data) || new Date(0);
      return tb.getTime() - ta.getTime();
    });
    // Se o servidor retornou mais registros que os únicos, avisar para debugging
    if (Array.isArray(novosPedidos) && sanitizedPedidos.length !== novosPedidos.length) {
      console.warn('Servidor retornou pedidos duplicados. Removendo itens duplicados localmente. Originais:', novosPedidos.length, 'Sanitizados:', sanitizedPedidos.length);
    }
    // Detectar novos pedidos
    const pedidosAtuais = new Set(pedidos.map(p => p.id));
    const novosPedidosIds = sanitizedPedidos.filter(p => !pedidosAtuais.has(p.id)).map(p => p.id);
    
    pedidos = sanitizedPedidos;
    renderizarQuadro();
    atualizarResumo();
    
    // Imprimir novos pedidos se a opção estiver habilitada
    if (novosPedidosIds.length > 0) {
      const autoPrint = localStorage.getItem('autoPrintEnabled') === 'true';
      if (autoPrint) {
        // Encontrar os pedidos novos
        const pedidosNovos = pedidos.filter(p => novosPedidosIds.includes(p.id));
        pedidosNovos.forEach(pedido => {
          // Apenas imprimir pedidos pendentes (novos)
          if (pedido.status === 'pending') {
            setTimeout(() => {
              imprimirPedido(pedido);
            }, 1000); // Pequeno atraso para garantir que o pedido foi salvo
          }
        });
      }
    }
  } catch (error) {
    console.error('Erro ao carregar pedidos:', error);
  }
}

// Renderizar quadro de pedidos
function renderizarQuadro() {
  // Salvar IDs dos pedidos atuais para detectar novos pedidos
  const pedidosAtuais = new Set(pedidos.map(p => p.id));
  
  // Limpar containers
  elements.pendingOrdersContainer.innerHTML = '';
  elements.preparingOrdersContainer.innerHTML = '';
  elements.readyOrdersContainer.innerHTML = '';
  elements.deliveredOrdersContainer.innerHTML = '';
  elements.archivedOrdersContainer.innerHTML = '';
  
  // Contadores
  const counts = {
    pending: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    archived: 0
  };
  
  // Remover pedidos duplicados por id antes de renderizar
  const seen = new Set();
  const uniquePedidos = [];
  pedidos.forEach(p => {
    if (!p || !p.id) return;
    if (!seen.has(p.id)) { seen.add(p.id); uniquePedidos.push(p); }
    else console.warn('Duplicated pedido detected in memory, ignoring duplicate id:', p.id);
  });

  // Agrupar pedidos por status
  uniquePedidos.forEach(pedido => {
    counts[pedido.status]++;
    
    const orderCard = criarCardPedido(pedido);
    
    switch (pedido.status) {
      case 'pending':
        elements.pendingOrdersContainer.appendChild(orderCard);
        break;
      case 'preparing':
        elements.preparingOrdersContainer.appendChild(orderCard);
        break;
      case 'ready':
        elements.readyOrdersContainer.appendChild(orderCard);
        break;
      case 'delivered':
        elements.deliveredOrdersContainer.appendChild(orderCard);
        break;
      case 'archived':
        elements.archivedOrdersContainer.appendChild(orderCard);
        break;
    }
  });
  
  // Mostrar ou esconder a coluna de "em preparo" conforme necessário
  if (counts.preparing > 0) {
    elements.preparingColumn.style.display = 'flex';
  } else {
    elements.preparingColumn.style.display = 'none';
  }
  
  // Atualizar contadores de colunas
  elements.pendingColumnCount.textContent = counts.pending;
  elements.preparingColumnCount.textContent = counts.preparing;
  elements.readyColumnCount.textContent = counts.ready;
  elements.deliveredColumnCount.textContent = counts.delivered;
  elements.archivedColumnCount.textContent = counts.archived;
  
  // Atualizar contadores de filtros
  if (elements.allCount) {
    elements.allCount.textContent = pedidos.length;
    elements.pendingCount.textContent = counts.pending;
    elements.preparingCount.textContent = counts.preparing;
    elements.readyCount.textContent = counts.ready;
    elements.deliveredCount.textContent = counts.delivered;
    elements.archivedCount.textContent = counts.archived;
  }
}

// Criar card de pedido
function criarCardPedido(pedido) {
  try {
    const card = document.createElement('div');
    card.className = 'pc-order-card';
    card.dataset.id = pedido.id;
    
    // Verificar se o pedido tem os dados necessários
    if (!pedido) {
      console.error('Pedido inválido para criação de card:', pedido);
      return card;
    }
    
    // Formatar data
    let dataFormatada = 'Data não disponível';
    let horaFormatada = 'Hora não disponível';
    
    try {
      const data = parsePedidoDate(pedido.data);
      if (data && !isNaN(data.getTime())) {
        dataFormatada = data.toLocaleDateString('pt-BR');
        horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    } catch (dateError) {
      console.error('Erro ao formatar data do pedido:', dateError, pedido.data);
    }
    
    // Calcular total de itens
    let totalItens = 0;
    try {
      if (pedido.itens && Array.isArray(pedido.itens)) {
        totalItens = pedido.itens.reduce((total, item) => total + (item.quantidade || 0), 0);
      }
    } catch (itemsError) {
      console.error('Erro ao calcular total de itens:', itemsError, pedido.itens);
    }
    
    // Obter valor total do pedido
    const totalPedido = pedido.total || 0;
    
    // Verificar se o status existe no mapeamento
    const statusInfo = statusConfig[pedido.status] || { 
      text: pedido.status || 'Desconhecido', 
      color: '#95a5a6', 
      icon: 'fa-question-circle' 
    };
    
    card.innerHTML = `
      <div class="pc-order-header">
        <div class="pc-order-id">Pedido #${pedido.id || 'N/A'}</div>
        <div class="pc-order-time">${horaFormatada}</div>
      </div>
      <div class="pc-order-details">
        <div class="pc-customer-name">${pedido.cliente_nome || 'Cliente não informado'}</div>
        <div class="pc-order-items">${totalItens} item(s)</div>
        <div class="pc-order-total">R$ ${totalPedido.toFixed(2).replace('.', ',')}</div>
      </div>
      ${pedido.observacao_entrega && String(pedido.observacao_entrega).trim() ? `<div class="pc-order-observation">📝 ${String(pedido.observacao_entrega).trim().substring(0,80)}${String(pedido.observacao_entrega).trim().length>80?'...':''}</div>` : ''}
      <div class="pc-order-footer">
        <span class="pc-order-status" style="background-color: ${statusInfo.color}">
          <i class="fas ${statusInfo.icon}"></i>
          ${statusInfo.text}
        </span>
      </div>
    `;
    
    // Adicionar evento de clique
    card.addEventListener('click', () => mostrarDetalhesPedido(pedido));
    
    return card;
  } catch (error) {
    console.error('Erro ao criar card de pedido:', error, pedido);
    // Criar um card de erro
    const errorCard = document.createElement('div');
    errorCard.className = 'pc-order-card';
    errorCard.innerHTML = `
      <div class="pc-order-header">
        <div class="pc-order-id">Erro no Pedido</div>
      </div>
      <div class="pc-order-details">
        <div class="pc-customer-name">Erro ao carregar pedido</div>
        <div class="pc-order-items">ID: ${pedido ? pedido.id : 'Desconhecido'}</div>
      </div>
    `;
    return errorCard;
  }
}

// Mostrar detalhes do pedido
function mostrarDetalhesPedido(pedido) {
  try {
    pedidoSelecionado = pedido;
    
    // Verificar se o pedido tem todos os dados necessários
    if (!pedido) {
      console.error('Pedido inválido:', pedido);
      alert('Erro: Pedido inválido. Por favor, atualize a página e tente novamente.');
      return;
    }
    
    // Atualizar informações do pedido
    elements.orderIdDisplay.textContent = `Pedido #${pedido.id}`;
    
    // Verificar se o status existe no mapeamento
    const statusInfo = statusConfig[pedido.status] || { 
      text: pedido.status || 'Desconhecido', 
      color: '#95a5a6', 
      icon: 'fa-question-circle' 
    };
    
    elements.orderStatusBadge.innerHTML = `
      <i class="fas ${statusInfo.icon}"></i>
      ${statusInfo.text}
    `;
    elements.orderStatusBadge.style.backgroundColor = statusInfo.color;
    
    // Atualizar informações do cliente
    elements.customerName.textContent = pedido.cliente_nome || 'Não informado';
    elements.customerPhone.textContent = pedido.cliente_telefone || 'Não informado';
    
    // Verificar se é retirada no balcão
    const isPickup = pedido.is_pickup === 1 || pedido.cliente_endereco === 'Retirada no Balcão';
    if (isPickup) {
      elements.customerAddress.innerHTML = '<span style="color: #3498db; font-weight: bold;"><i class="fas fa-store"></i> RETIRADA NO BALCÃO</span>';
    } else {
      elements.customerAddress.textContent = pedido.cliente_endereco || 'Não informado';
    }
    // Exibir observação do local (campo do banco: observacao_entrega)
    elements.customerAddressNote.textContent = pedido.observacao_entrega || 'N/A';
    elements.paymentMethod.textContent = pedido.forma_pagamento || 'Não informado';
    
    // Renderizar editor de itens
    renderizarItensEditor(pedido);
    
    // Atualizar total
    const total = pedido.total || 0;
    elements.orderTotalAmount.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    
    // Atualizar botões de status
    atualizarBotoesStatus(pedido.status);
    
    // Mostrar modal
    mostrarModal(elements.orderDetailsModal);
    // Preparar barra de adição de item
    carregarProdutos();
  } catch (error) {
    console.error('Erro ao mostrar detalhes do pedido:', error, pedido);
    alert('Erro ao carregar detalhes do pedido. Por favor, atualize a página e tente novamente.');
  }
}

// Atualizar botões de status
function atualizarBotoesStatus(status) {
  const currentIndex = statusOrder.indexOf(status);
  
  // Desabilitar botão de voltar se for o primeiro status
  elements.prevStatusBtn.disabled = currentIndex === 0;
  
  // Desabilitar botão de avançar se for o último status
  elements.nextStatusBtn.disabled = currentIndex === statusOrder.length - 1;
  
  // Esconder botão de arquivar se já estiver arquivado
  elements.archiveOrderBtn.style.display = status === 'archived' ? 'none' : 'flex';
}

// Avançar status do pedido
async function avancarStatus() {
  if (!pedidoSelecionado) return;
  
  const currentIndex = statusOrder.indexOf(pedidoSelecionado.status);
  if (currentIndex < statusOrder.length - 1) {
    const novoStatus = statusOrder[currentIndex + 1];
    await atualizarStatusPedido(pedidoSelecionado.id, novoStatus);
  }
}

// Voltar status do pedido
async function voltarStatus() {
  if (!pedidoSelecionado) return;
  
  const currentIndex = statusOrder.indexOf(pedidoSelecionado.status);
  if (currentIndex > 0) {
    const novoStatus = statusOrder[currentIndex - 1];
    await atualizarStatusPedido(pedidoSelecionado.id, novoStatus);
  }
}

// Arquivar pedido
async function arquivarPedido() {
  if (!pedidoSelecionado) return;
  
  await atualizarStatusPedido(pedidoSelecionado.id, 'archived');
}

// Remover pedido
async function removerPedido() {
  if (!pedidoSelecionado) return;
  
  if (confirm(`Tem certeza que deseja remover o pedido #${pedidoSelecionado.id}? Esta ação não pode ser desfeita.`)) {
    try {
      const response = await fetch(`/api/pedidos/${pedidoSelecionado.id}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Fechar modal
        fecharModal(elements.orderDetailsModal);
        
        // Recarregar pedidos
        carregarPedidos();
        
        alert('Pedido removido com sucesso!');
      } else {
        alert('Erro ao remover pedido: ' + result.error);
      }
    } catch (error) {
      console.error('Erro ao remover pedido:', error);
      alert('Erro ao remover pedido. Por favor, tente novamente.');
    }
  }
}

// Atualizar status do pedido
async function atualizarStatusPedido(pedidoId, novoStatus) {
  try {
    const response = await fetch(`/api/pedidos/${pedidoId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: novoStatus })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Fechar modal
      fecharModal(elements.orderDetailsModal);
      
      // Recarregar pedidos
      carregarPedidos();
      
      // Se estiver arquivando, mostrar mensagem
      if (novoStatus === 'archived') {
        alert('Pedido arquivado com sucesso!');
      }
    } else {
      alert('Erro ao atualizar status do pedido: ' + result.error);
    }
  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    alert('Erro ao atualizar status do pedido. Por favor, tente novamente.');
  }
}

// Atualizar resumo
function atualizarResumo() {
  // Total de pedidos
  elements.totalOrders.textContent = pedidos.length;
  
  // Valor total
  const valorTotal = pedidos.reduce((total, pedido) => total + pedido.total, 0);
  elements.totalValue.textContent = `R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
  
  // Contagem por status
  const statusCounts = {
    pending: 0,
    preparing: 0
  };
  
  pedidos.forEach(pedido => {
    if (pedido.status === 'pending') statusCounts.pending++;
    if (pedido.status === 'preparing') statusCounts.preparing++;
  });
  
  elements.pendingOrdersSummary.textContent = statusCounts.pending;
  elements.preparingOrdersSummary.textContent = statusCounts.preparing;
}

// Função para imprimir pedido - versão atualizada para impressoras térmicas
function imprimirPedido(pedido) {
  try {
    // Criar conteúdo da impressão otimizado para impressora térmica 80mm
    let conteudoImpressao = formatarPedidoParaImpressoraTermica(pedido);
    // Log de debug para confirmar que observação do local foi incluída
    const obsLog = (pedido.observacao_entrega || (pedido.entrega && (pedido.entrega.addressNote || pedido.entrega.observacao)) || pedido.addressNote || pedido.observacao || '').toString().trim();
    console.log(`Imprimir pedido #${pedido.id}. Observação do local:`, obsLog);
    
    // Mostrar preview da impressão em um modal otimizado para térmica
    mostrarPreviewImpressaoTermica(conteudoImpressao, pedido.id);
    
    console.log(`Preview de impressão do pedido #${pedido.id} exibido`);
  } catch (error) {
    console.error('Erro ao preparar impressão do pedido:', error);
  }
}

// Função para formatar o pedido especificamente para impressoras térmicas 80mm
function formatarPedidoParaImpressoraTermica(pedido) {
  // Definir largura máxima para impressora térmica (80mm = ~48 caracteres)
  const larguraLinha = 48;
  
  // Função auxiliar para centralizar texto
  function centralizarTexto(texto, largura) {
    if (texto.length >= largura) return texto.substring(0, largura);
    const espacos = Math.floor((largura - texto.length) / 2);
    return ' '.repeat(espacos) + texto;
  }
  
  // Função auxiliar para criar linha divisória
  function linhaDivisoria(caractere = '-') {
    return caractere.repeat(larguraLinha);
  }
  
  // Função auxiliar para formatar valores monetários
  function formatarMoeda(valor) {
    return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  }
  
  // Função auxiliar para truncar texto
  function truncarTexto(texto, comprimento) {
    return texto.length > comprimento ? texto.substring(0, comprimento - 3) + '...' : texto;
  }
  
  // Construir conteúdo da impressão
  let linhas = [];
  
  // Cabeçalho com nome do estabelecimento (usar nome da página se disponível)
  let headerName = 'BRUTUS BURGER';
  try {
    const headerEl = document.querySelector('.app-header h1') || document.querySelector('h1');
    if (headerEl && headerEl.textContent && headerEl.textContent.trim().length > 0) {
      headerName = headerEl.textContent.trim();
    }
  } catch (e) {
    // ignore
  }
  linhas.push(centralizarTexto(headerName.toUpperCase(), larguraLinha));
  linhas.push(centralizarTexto('(42) 9 9983-0247', larguraLinha));
  linhas.push(linhaDivisoria('='));
  linhas.push(centralizarTexto('PEDIDO #' + pedido.id, larguraLinha));
  linhas.push(linhaDivisoria('='));
  
  // Data e hora
  const data = parsePedidoDate(pedido.data) || new Date();
  linhas.push(`DATA: ${data.toLocaleDateString('pt-BR')}`);
  linhas.push(`HORA: ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
  linhas.push('');
  
  // Informações do cliente
  linhas.push('CLIENTE:');
  const nomeCliente = pedido.cliente_nome || 'NÃO INFORMADO';
  // Quebrar nome em múltiplas linhas se necessário
  if (nomeCliente.length > larguraLinha) {
    const palavras = nomeCliente.split(' ');
    let linhaAtual = '';
    palavras.forEach(palavra => {
      if ((linhaAtual + palavra).length > larguraLinha) {
        linhas.push(linhaAtual.trim());
        linhaAtual = palavra + ' ';
      } else {
        linhaAtual += palavra + ' ';
      }
    });
    if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
  } else {
    linhas.push(nomeCliente);
  }
  
  if (pedido.cliente_telefone) {
    linhas.push(`TEL: ${pedido.cliente_telefone}`);
  }
  
    // Pre-compute observation note (independent of address presence)
    const obsLocal = (pedido.observacao_entrega || (pedido.entrega && (pedido.entrega.addressNote || pedido.entrega.observacao)) || pedido.addressNote || pedido.observacao || '').toString().trim();
    if (pedido.cliente_endereco) {
    linhas.push('ENDERECO:');
    // Quebrar endereço em múltiplas linhas
    const endereco = pedido.cliente_endereco;
    if (endereco.length > larguraLinha) {
      const palavras = endereco.split(' ');
      let linhaAtual = '';
      palavras.forEach(palavra => {
        if ((linhaAtual + palavra).length > larguraLinha) {
          linhas.push(linhaAtual.trim());
          linhaAtual = palavra + ' ';
        } else {
          linhaAtual += palavra + ' ';
        }
      });
      if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
    } else {
      linhas.push(endereco);
    }
    }
    // If there is an observation note, print it (even if address is missing)
    if (obsLocal) {
      linhas.push('OBSERVAÇÕES DO LOCAL:');
      // Quebrar observação em linhas longas
      if (obsLocal.length > larguraLinha) {
        const obsWords = obsLocal.split(' ');
        let curr = '';
        obsWords.forEach(w => {
          if ((curr + ' ' + w).trim().length > larguraLinha) { linhas.push(curr.trim()); curr = w + ' '; }
          else curr += w + ' ';
        });
        if (curr.trim()) linhas.push(curr.trim());
      } else {
        linhas.push(obsLocal);
      }
    }
  
  linhas.push(`PAGAMENTO: ${pedido.forma_pagamento || 'NÃO INFORMADO'}`);
  linhas.push('');
  
  // Itens do pedido
  linhas.push('ITENS:');
  linhas.push(linhaDivisoria());
  
  pedido.itens.forEach((item, index) => {
    const nomeProduto = item.produto_nome || item.produto?.nome || 'PRODUTO SEM NOME';
    const quantidade = item.quantidade || 0;
    const precoUnitario = item.preco_unitario || item.produto?.preco || 0;
    const precoTotal = precoUnitario * quantidade;
    
    // Linha do item com número
    linhas.push(`${index + 1}. ${quantidade}x ${nomeProduto}`);
    linhas.push(`   ${formatarMoeda(precoUnitario)} x ${quantidade} = ${formatarMoeda(precoTotal)}`);
    
    // Verificar formato dos adicionais (novo ou antigo)
    let adicionaisList = [];
    let buffetList = [];
    
    if (item.adicionais) {
      if (Array.isArray(item.adicionais)) {
        adicionaisList = item.adicionais;
      } else if (typeof item.adicionais === 'object') {
        adicionaisList = Array.isArray(item.adicionais.adicionais) ? item.adicionais.adicionais : [];
        buffetList = Array.isArray(item.adicionais.buffet) ? item.adicionais.buffet : [];
      }
    }
    
    // Buffet (para marmitas)
    if (buffetList.length > 0) {
      linhas.push('   BUFFET DO DIA:');
      buffetList.forEach(buffetItem => {
        const nomeBuffet = buffetItem.nome || 'Item';
        linhas.push(`   > ${nomeBuffet}`);
      });
    }
    
    // Adicionais (se houver)
    if (adicionaisList.length > 0) {
      linhas.push('   ADICIONAIS:');
      adicionaisList.forEach(adicional => {
        const nomeAdicional = adicional.produto_nome || adicional.nome || 'Adicional';
        const precoAdicional = adicional.preco_unitario || adicional.preco || 0;
        linhas.push(`   + ${nomeAdicional} ${formatarMoeda(precoAdicional)}`);
      });
    }
    
    // Observação (se houver)
    if (item.observacao && item.observacao.trim()) {
      linhas.push(`   OBS: ${item.observacao}`);
    }
    
    linhas.push('');
  });
  
  // Subtotal e entrega
  linhas.push(linhaDivisoria('-'));
  
  // Calcular subtotal dos itens
  let subtotal = 0;
  pedido.itens.forEach(item => {
    const precoItem = (item.preco_unitario || item.produto?.preco || 0) * (item.quantidade || 0);
    subtotal += precoItem;
    
    // Adicionar preço dos adicionais
    if (item.adicionais && item.adicionais.length > 0) {
      item.adicionais.forEach(adicional => {
        subtotal += (adicional.preco_unitario || adicional.preco || 0) * (item.quantidade || 0);
      });
    }
  });
  
  linhas.push(`SUBTOTAL:            ${formatarMoeda(subtotal)}`);
  
  // Taxa de entrega (se houver diferença entre total e subtotal)
  const taxaEntrega = pedido.total - subtotal;
  if (taxaEntrega > 0) {
    linhas.push(`TAXA ENTREGA:        ${formatarMoeda(taxaEntrega)}`);
  }
  
  // Total
  linhas.push(linhaDivisoria('='));
  linhas.push(`TOTAL:               ${formatarMoeda(pedido.total)}`);
  linhas.push(linhaDivisoria('='));
  linhas.push('');
  
  // Rodapé
  const agora = new Date();
  linhas.push(centralizarTexto('OBRIGADO PELA PREFERÊNCIA!', larguraLinha));
  linhas.push(centralizarTexto(`${agora.getFullYear()}`, larguraLinha));
  linhas.push('');
  linhas.push(linhaDivisoria('*'));
  
  return linhas.join('\n');
}

// Função para mostrar preview da impressão otimizado para impressoras térmicas
function mostrarPreviewImpressaoTermica(conteudo, pedidoId) {
  // Criar elementos do modal de preview
  const modal = document.createElement('div');
  modal.className = 'pc-modal show';
  modal.id = 'print-preview-modal';
  modal.style.display = 'block';
  
  modal.innerHTML = `
    <div class="pc-modal-content" style="max-width: 700px; width: 90%;">
      <div class="pc-modal-header">
        <h2><i class="fas fa-print"></i> Preview Impressão Térmica - Pedido #${pedidoId}</h2>
        <button class="pc-close-button" id="close-print-preview">&times;</button>
      </div>
      <div class="pc-modal-body" style="padding: 0; overflow: hidden;">
        <div class="thermal-print-preview">
          <div class="thermal-print-header">
            <h3>Simulação de Cupom Térmico 80mm</h3>
            <p>Esta é uma prévia de como o pedido será impresso em uma impressora térmica de 80mm</p>
          </div>
          <div class="thermal-print-content">
            <div class="thermal-receipt-paper">
              <pre class="thermal-receipt-text">${conteudo}</pre>
            </div>
          </div>
          <div class="thermal-print-footer">
            <div class="thermal-print-instructions">
              <p><i class="fas fa-info-circle"></i> O cupom será impresso em papel térmico de 80mm com largura de impressão útil de 72mm</p>
            </div>
            <div class="thermal-print-actions">
              <button class="pc-action-btn pc-delete-btn" id="cancel-print">
                <i class="fas fa-times"></i> Cancelar
              </button>
              <button class="pc-action-btn pc-print-btn" id="confirm-print">
                <i class="fas fa-print"></i> Imprimir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Adicionar estilos específicos para o preview térmico
  const style = document.createElement('style');
  style.textContent = `
    .thermal-print-preview {
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .thermal-print-header {
      background: #f8f9fa;
      padding: 15px 20px;
      border-bottom: 1px solid #ddd;
    }
    
    .thermal-print-header h3 {
      margin: 0 0 10px 0;
      color: #333;
      font-size: 18px;
    }
    
    .thermal-print-header p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }
    
    .thermal-print-content {
      display: flex;
      justify-content: center;
      background: #e0e0e0;
      padding: 20px;
      max-height: 600px;
      overflow-y: auto;
    }
    
    .thermal-print-content::-webkit-scrollbar {
      width: 8px;
    }
    
    .thermal-print-content::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .thermal-print-content::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    
    .thermal-print-content::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .thermal-receipt-paper {
      background: white;
      width: 400px;
      padding: 25px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      border-radius: 6px;
    }
    
    .thermal-receipt-text {
      color: black;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
      overflow-x: hidden;
    }
    
    .thermal-print-footer {
      background: #f8f9fa;
      padding: 15px 20px;
      border-top: 1px solid #ddd;
    }
    
    .thermal-print-instructions {
      margin-bottom: 15px;
      padding: 10px;
      background: #e9f7fe;
      border-radius: 4px;
      font-size: 13px;
    }
    
    .thermal-print-instructions i {
      color: #007bff;
    }
    
    .thermal-print-actions {
      display: flex;
      justify-content: space-between;
    }
    
    @media print {
      .thermal-print-content pre {
        font-size: 16px;
        line-height: 1.3;
      }
    }
  `;
  document.head.appendChild(style);
  
  // Adicionar modal ao body
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  
  // Adicionar eventos aos botões
  document.getElementById('close-print-preview').addEventListener('click', () => {
    document.body.removeChild(modal);
    document.body.style.overflow = 'auto';
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  });
  
  document.getElementById('cancel-print').addEventListener('click', () => {
    document.body.removeChild(modal);
    document.body.style.overflow = 'auto';
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  });
  
  document.getElementById('confirm-print').addEventListener('click', () => {
    // Remover modal
    document.body.removeChild(modal);
    document.body.style.overflow = 'auto';
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
    
    // Imprimir o conteúdo
    imprimirConteudoTermico(conteudo);
  });
}

// Função para imprimir o conteúdo otimizado para impressoras térmicas
function imprimirConteudoTermico(conteudo) {
  try {
    // Criar uma janela de impressão otimizada para térmica
    const janelaImpressao = window.open('', '_blank');
    janelaImpressao.document.write(`
      <html>
        <head>
          <title>Impressão Térmica - Pedido</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              font-size: 16px;
              line-height: 1.4;
              margin: 0;
              padding: 0;
              width: 80mm; /* Largura padrão para impressora térmica 80mm */
            }
            pre {
              margin: 0;
              padding: 10px;
              white-space: pre;
              word-wrap: break-word;
            }
            @media print {
              body {
                width: 80mm;
                margin: 0;
                padding: 0;
                font-size: 16px;
                line-height: 1.3;
              }
            }
          </style>
        </head>
        <body>
          <pre>${conteudo}</pre>
        </body>
      </html>
    `);
    janelaImpressao.document.close();
    janelaImpressao.focus();
    
    // Aguardar um momento e imprimir
    setTimeout(() => {
      janelaImpressao.print();
      // Não fechamos automaticamente para permitir ao usuário verificar a impressão
      // janelaImpressao.close();
    }, 500);
  } catch (error) {
    console.error('Erro ao imprimir conteúdo térmico:', error);
    alert('Erro ao imprimir. Verifique se a impressora está configurada corretamente.');
  }
}

// Função para teste de impressão
function testarImpressao() {
  // Criar um pedido de teste
  const pedidoTeste = {
    id: 999,
    data: new Date().toISOString(),
    cliente_nome: 'Cliente de Teste',
    cliente_telefone: '(00) 00000-0000',
    cliente_endereco: 'Rua de Teste, 123',
    forma_pagamento: 'Dinheiro',
    total: 45.50,
    itens: [
      {
        produto_nome: 'Hambúrguer Especial',
        preco_unitario: 25.00,
        quantidade: 1
      },
      {
        produto_nome: 'Batata Frita',
        preco_unitario: 12.00,
        quantidade: 2
      },
      {
        produto_nome: 'Refrigerante',
        preco_unitario: 8.50,
        quantidade: 1
      }
    ]
  };
  
  imprimirPedido(pedidoTeste);
}

// Função para imprimir o pedido selecionado
function imprimirPedidoSelecionado() {
  if (pedidoSelecionado) {
    imprimirPedido(pedidoSelecionado);
  }
}

// Mostrar modal
function mostrarModal(modal) {
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

// Fechar modal
function fecharModal(modal) {
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
}

// Função para iniciar a atualização automática
function iniciarAtualizacaoAutomatica() {
  // Verificar se o checkbox está marcado
  const autoRefreshEnabled = elements.autoRefreshCheckbox.checked;
  
  // Limpar intervalo existente
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  
  // Iniciar novo intervalo se a opção estiver habilitada
  if (autoRefreshEnabled) {
    autoRefreshInterval = setInterval(carregarPedidos, 5000); // Atualizar a cada 5 segundos
  }
}

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  // Carregar pedidos iniciais
  carregarPedidos();
  
  // Adicionar evento de clique ao botão do robô
  if (elements.toggleRobotBtn) {
    elements.toggleRobotBtn.addEventListener('click', toggleRobot);
    // Carregar estado inicial do robô
    carregarEstadoRobo();
  }
  
  // Adicionar evento de clique ao botão de refresh
  elements.refreshBtn.addEventListener('click', carregarPedidos);
  
  // Adicionar evento de clique ao botão de teste de impressão
  elements.printTestBtn.addEventListener('click', testarImpressao);
  
  // Adicionar evento de clique ao botão de impressão de pedido
  elements.printOrderBtn.addEventListener('click', imprimirPedidoSelecionado);
  
  // Adicionar evento de clique aos botões de fechar modal
  elements.closeButtons.forEach(button => {
    button.addEventListener('click', () => fecharModal(elements.orderDetailsModal));
  });
  
  // Adicionar evento de clique ao botão de arquivar pedido
  elements.archiveOrderBtn.addEventListener('click', arquivarPedido);
  
  // Adicionar evento de clique ao botão de remover pedido
  elements.deleteOrderBtn.addEventListener('click', removerPedido);
  
  // Adicionar evento de clique ao botão de avançar status
  elements.nextStatusBtn.addEventListener('click', avancarStatus);
  
  // Adicionar evento de clique ao botão de voltar status
  elements.prevStatusBtn.addEventListener('click', voltarStatus);
  
  // Adicionar evento de mudança ao checkbox de atualização automática
  elements.autoRefreshCheckbox.addEventListener('change', iniciarAtualizacaoAutomatica);
  
  // Iniciar atualização automática se estiver habilitada
  iniciarAtualizacaoAutomatica();

  // Eventos para adicionar item
  if (elements.addItemBtn) {
    elements.addItemBtn.addEventListener('click', adicionarItemAoPedido);
  }
  if (elements.addItemSelect) {
    // Preenche o campo preço ao escolher produto
    elements.addItemSelect.addEventListener('change', () => {
      const id = parseInt(elements.addItemSelect.value || '0', 10);
      const p = catalogoProdutos.find(x => x.id === id);
      if (p && elements.addItemPrice && !elements.addItemPrice.value) {
        elements.addItemPrice.value = Number(p.preco).toFixed(2);
      }
    });
  }
});
