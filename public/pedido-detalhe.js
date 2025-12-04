// Elementos do DOM
const elements = {
  pedidoId: document.getElementById('pedido-id'),
  statusBadge: document.getElementById('status-badge'),
  statusText: document.getElementById('status-text'),
  clienteNome: document.getElementById('cliente-nome'),
  clienteTelefone: document.getElementById('cliente-telefone'),
  clienteEndereco: document.getElementById('cliente-endereco'),
  formaPagamento: document.getElementById('forma-pagamento'),
  itensList: document.getElementById('itens-list'),
  pedidoTotal: document.getElementById('pedido-total'),
  whatsappBtn: document.getElementById('whatsapp-btn'),
  loadingOverlay: document.getElementById('loading-overlay'),
  errorMessage: document.getElementById('error-message'),
  errorText: document.getElementById('error-text'),
  retryBtn: document.getElementById('retry-btn')
};

// Mapeamento de status para texto e ícone
const statusConfig = {
  pending: { text: 'Pendente', icon: 'fa-clock', color: '#f39c12' },
  preparing: { text: 'Em Preparação', icon: 'fa-utensils', color: '#3498db' },
  ready: { text: 'Pronto', icon: 'fa-check-circle', color: '#27ae60' },
  delivered: { text: 'Entregue', icon: 'fa-truck', color: '#9b59b6' },
  archived: { text: 'Arquivado', icon: 'fa-archive', color: '#95a5a6' }
};

// Obter ID do pedido da URL
const pathSegments = window.location.pathname.split('/');
let pedidoId = pathSegments[pathSegments.length - 1];

// Remover qualquer parâmetro da query string
if (pedidoId.includes('?')) {
  pedidoId = pedidoId.split('?')[0];
}

// Carregar detalhes do pedido
async function carregarDetalhesPedido() {
  try {
    // Mostrar loading
    elements.loadingOverlay.style.display = 'flex';
    elements.errorMessage.style.display = 'none';
    
    const response = await fetch(`/api/pedidos/${pedidoId}`);
    const pedido = await response.json();
    
    if (!response.ok || pedido.error) {
      throw new Error(pedido.error || 'Pedido não encontrado');
    }
    
    // Atualizar informações do pedido
    elements.pedidoId.textContent = pedido.id;
    
    // Atualizar status
    const statusInfo = statusConfig[pedido.status] || statusConfig.pending;
    elements.statusText.innerHTML = `<i class="fas ${statusInfo.icon}"></i> ${statusInfo.text}`;
    elements.statusBadge.style.backgroundColor = statusInfo.color;
    
    // Atualizar informações do cliente
    elements.clienteNome.textContent = pedido.cliente_nome || 'Não informado';
    elements.clienteTelefone.textContent = pedido.cliente_telefone || 'Não informado';
    
    // Verificar se é retirada no balcão
    const isPickup = pedido.is_pickup === 1 || pedido.cliente_endereco === 'Retirada no Balcão';
    if (isPickup) {
      elements.clienteEndereco.innerHTML = '<span style="color: #3498db; font-weight: bold;"><i class="fas fa-store"></i> RETIRADA NO BALCÃO</span>';
    } else {
      elements.clienteEndereco.textContent = pedido.cliente_endereco || 'Não informado';
    }
    elements.formaPagamento.textContent = pedido.forma_pagamento || 'Não informado';
    
    // Atualizar itens do pedido
    elements.itensList.innerHTML = '';
    let totalPedido = 0;
    
    pedido.itens.forEach(item => {
      const itemTotal = item.preco_unitario * item.quantidade;
      totalPedido += itemTotal;
      
      const itemElement = document.createElement('div');
      itemElement.className = 'item-row';
      itemElement.innerHTML = `
        <div class="item-details">
          <span class="item-name">${item.produto_nome || item.produto?.nome || 'Produto não identificado'}</span>
          <span class="item-quantity">x${item.quantidade}</span>
        </div>
        <div class="item-price">R$ ${itemTotal.toFixed(2).replace('.', ',')}</div>
      `;
      
      elements.itensList.appendChild(itemElement);
    });
    
    // Atualizar total do pedido
    elements.pedidoTotal.textContent = `R$ ${totalPedido.toFixed(2).replace('.', ',')}`;
    
    // Configurar botão do WhatsApp
    elements.whatsappBtn.addEventListener('click', () => {
      // Abrir WhatsApp do estabelecimento
      const phoneNumber = '55429998302047'; // Substituir pelo número real do estabelecimento
      const message = `Olá, gostaria de informações sobre o pedido #${pedido.id}`;
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    });
    
    // Esconder loading
    elements.loadingOverlay.style.display = 'none';
  } catch (error) {
    console.error('Erro ao carregar detalhes do pedido:', error);
    
    // Mostrar mensagem de erro
    elements.loadingOverlay.style.display = 'none';
    elements.errorText.textContent = error.message || 'Erro ao carregar detalhes do pedido';
    elements.errorMessage.style.display = 'block';
  }
}

// Event listener para o botão de tentar novamente
elements.retryBtn.addEventListener('click', carregarDetalhesPedido);

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  // Verificar se o ID do pedido está na URL
  if (!pedidoId || pedidoId === 'pedido' || pedidoId === '') {
    elements.loadingOverlay.style.display = 'none';
    elements.errorText.textContent = 'ID do pedido não encontrado na URL';
    elements.errorMessage.style.display = 'block';
    return;
  }
  
  carregarDetalhesPedido();
});