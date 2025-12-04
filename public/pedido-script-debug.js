// Estado da aplicação
let produtos = [];
let carrinho = [];
let produtosPorCategoria = {
  lanches: [],
  bebidas: [],
  porcoes: [],
  adicionais: []
};
let categoriaAtual = 'lanches';
let indiceProdutoAtual = 0;
let produtoSelecionado = null;
let quantidadeSelecionada = 1;
let observacaoAtual = '';
let adicionaisSelecionados = [];
let adicionaisParaItensCarrinho = {};
let whatsappId = null;
let clienteInfo = null;
let entregaInfo = null; // Informações de entrega
let sessionInfoSaved = null; // dados carregados do JWT/session (aguarda uso explicito)
let isPickupMode = false; // Modo de retirada no balcão
let pickupEnabled = false; // Configuração de retirada habilitada
let buffetSelecionados = []; // Itens do buffet selecionados para marmita

// Captura global de erros para facilitar depuração
window.addEventListener('error', function(ev) {
  try {
    console.error('📛 Global JS Error:', ev && ev.message, ev && ev.error);
  } catch (e) { /* ignore */ }
});
window.addEventListener('unhandledrejection', function(ev) {
  try {
    console.error('📛 Unhandled Promise Rejection:', ev && ev.reason);
  } catch (e) { /* ignore */ }
});

// Optional in-page log overlay (enable with ?debug=1 in the URL)
try {
  const urlParamsDbg = new URLSearchParams(window.location.search);
  if (urlParamsDbg.get('debug') === '1') {
    const dbg = document.createElement('div');
    dbg.id = 'debug-overlay';
    dbg.style.cssText = 'position:fixed; right:8px; bottom:8px; width:420px; max-height:40vh; overflow:auto; background:rgba(0,0,0,0.7); color:#fff; font-size:12px; padding:8px; border-radius:8px; z-index:9999;';
    document.body.appendChild(dbg);

    function appendDbg(m) {
      const p = document.createElement('div'); p.textContent = `${new Date().toLocaleTimeString()} - ${m}`; dbg.appendChild(p); dbg.scrollTop = dbg.scrollHeight; if (dbg.children.length > 80) dbg.removeChild(dbg.firstChild);
    }

    const originalLog = console.log;
    const originalErr = console.error;
    console.log = function() { originalLog.apply(console, arguments); try { appendDbg(Array.from(arguments).join(' ')); } catch (e) {} };
    console.error = function() { originalErr.apply(console, arguments); try { appendDbg('ERROR: ' + Array.from(arguments).join(' ')); } catch (e) {} };
  }
} catch (e) { /* ignore overlay creation */ }

// Categorias dinâmicas
let categorias = [];
let adicionaisCategoriaName = null;
let bebidasCategoriaName = null;

// 🔥 CAPTURAR WHATSAPPID IMEDIATAMENTE (antes do DOMContentLoaded)
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const whatsappFromUrl = urlParams.get('whatsapp');
  const whatsappFromServer = window.WHATSAPP_ID_FROM_SERVER || null;
  const whatsappFromStorage = sessionStorage.getItem('whatsappId');
  
  console.log('🔥 CAPTURA INICIAL DO WHATSAPPID:');
  console.log('  📍 URL completa:', window.location.href);
  console.log('  📍 Parâmetro whatsapp da URL:', whatsappFromUrl);
  console.log('  📍 WhatsappId injetado pelo servidor:', whatsappFromServer);
  console.log('  📍 WhatsappId do sessionStorage:', whatsappFromStorage);
  
  // Priorizar: servidor > URL > sessionStorage
  if (whatsappFromServer) {
    whatsappId = whatsappFromServer;
    sessionStorage.setItem('whatsappId', whatsappId);
    console.log('  ✅ WhatsappId definido pelo SERVIDOR:', whatsappId);
  } else if (whatsappFromUrl) {
    whatsappId = whatsappFromUrl;
    sessionStorage.setItem('whatsappId', whatsappId);
    console.log('  ✅ WhatsappId definido da URL:', whatsappId);
  } else if (whatsappFromStorage) {
    whatsappId = whatsappFromStorage;
    console.log('  ✅ WhatsappId recuperado do sessionStorage:', whatsappId);
  } else {
    console.warn('  ⚠️ NENHUM whatsappId encontrado!');
  }
})();

// Elementos do DOM
const elements = {
  currentProduct: document.getElementById('current-product'),
  prevProductBtn: document.getElementById('prev-product'),
  nextProductBtn: document.getElementById('next-product'),
  carouselDots: document.getElementById('carousel-dots'),
  cartIcon: document.getElementById('cart-icon'),
  cartCount: document.getElementById('cart-count'),
  cartCountModal: document.getElementById('cart-count-modal'),
  cartModal: document.getElementById('cart-modal'),
  cartItems: document.getElementById('cart-items'),
  cartTotal: document.getElementById('cart-total'),
  checkoutBtn: document.getElementById('checkout-btn'),
  checkoutModal: document.getElementById('checkout-modal'),
  orderItemsSummary: document.getElementById('order-items-summary'),
  orderTotal: document.getElementById('order-total'),
  confirmationModal: document.getElementById('confirmation-modal'),
  confirmOrderBtn: document.getElementById('confirm-order'),
  newOrderBtn: document.getElementById('new-order-btn'),
  closeButtons: document.querySelectorAll('.close-button'),
  // Elementos do modal de quantidade
  quantityModal: document.getElementById('quantity-modal'),
  quantityProductImage: document.getElementById('quantity-product-image'),
  quantityProductName: document.getElementById('quantity-product-name'),
  quantityProductPrice: document.getElementById('quantity-product-price'),
  selectedQuantity: document.getElementById('selected-quantity'),
  decreaseQuantityBtn: document.getElementById('decrease-quantity'),
  increaseQuantityBtn: document.getElementById('increase-quantity'),
  addToCartConfirmBtn: document.getElementById('add-to-cart-confirm'),
  observationInput: document.getElementById('observation-input'),
  additionalsSection: document.getElementById('additionals-section'),
  additionalsList: document.getElementById('additionals-list'),
  // Elementos do seletor de categorias
  categoryButtonsContainer: document.getElementById('category-buttons-container'),
  // Elementos do formulário do cliente
  clientName: document.getElementById('client-name'),
  clientAddress: document.getElementById('client-address'),
  paymentMethod: document.getElementById('payment-method'),
  valorPago: document.getElementById('valor-pago'), // Novo elemento para valor pago
  dinheiroSection: document.getElementById('dinheiro-section'), // Seção para dinheiro
  calcularTaxaBtn: document.getElementById('calcular-taxa-btn'), // Botão para calcular taxa de entrega
  // previous-address UI removed per user request
  // Elementos de entrega
  useLocationBtn: document.getElementById('use-location-btn'),
  deliveryInfo: document.getElementById('delivery-info'),
  deliveryDistance: document.getElementById('delivery-distance'),
  deliveryPrice: document.getElementById('delivery-price'),
  deliveryError: document.getElementById('delivery-error'),
  clientCoordinates: document.getElementById('client-coordinates'),
  // Elementos de Retirada no Balcão
  pickupSection: document.getElementById('pickup-section'),
  pickupCheckbox: document.getElementById('pickup-checkbox'),
  pickupInfoText: document.getElementById('pickup-info-text'),
  // Elementos da barra de pesquisa
  searchInput: document.getElementById('search-input'),
  searchButton: document.getElementById('search-button'),
  searchResults: document.getElementById('search-results')
};

// Verificar se todos os elementos foram encontrados
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔍 Verificando elementos do DOM:');
  Object.keys(elements).forEach(key => {
    if (elements[key]) {
      console.log(`✅ ${key}: encontrado`);
    } else {
      console.error(`❌ ${key}: NÃO ENCONTRADO`);
    }
  });
  
  // Verificação específica para elementos de adicionais
  console.log('🧪 Verificação específica de adicionais:');
  console.log('  - additionalsSection:', elements.additionalsSection);
  console.log('  - additionalsList:', elements.additionalsList);
  
  // Inicializar barra de pesquisa
  inicializarBarraPesquisa();
  
  // WhatsappId já foi capturado no início do script
  console.log('🔍 DOMContentLoaded - whatsappId:', whatsappId);
  
  if (whatsappId) {
    // Carregar informações do cliente do WhatsApp (função atual: carregarClienteInfo)
    carregarClienteInfo();
    console.log('✅ Cliente WhatsApp carregado com ID:', whatsappId);
  } else {
    console.warn('⚠️ Nenhum whatsappId encontrado - cliente sem WhatsApp');
  }
  
  // ============================================================
  // CARREGAR DADOS DO CACHE LOCAL (independente do whatsappId)
  // ============================================================
  carregarDadosDoCache();
  
  // Carregar produtos
  // carregar categorias do servidor (gera os botões dinamicamente) — carregar antes dos produtos
  carregarCategoriasUI().catch(err => console.error('Erro ao carregar categorias:', err));
  carregarProdutos();
  
  // Adicionar evento para o botão de calcular taxa
  if (elements.calcularTaxaBtn) {
    elements.calcularTaxaBtn.addEventListener('click', function() {
      converterEnderecoECalcularEntrega();
    });
  }
  // Mostrar botão de calcular taxa quando o usuário digita algo no campo de endereço
  if (elements.clientAddress && elements.calcularTaxaBtn) {
    elements.clientAddress.addEventListener('input', function() {
      try {
        const val = String(this.value || '').trim();
        if (val.length > 0) {
          elements.calcularTaxaBtn.style.display = 'block';
          if (elements.deliveryError) elements.deliveryError.style.display = 'none';
        } else {
          elements.calcularTaxaBtn.style.display = 'none';
        }
      } catch (e) { /* ignore errors */ }
    });
    // initialize
    try {
      elements.calcularTaxaBtn.style.display = (elements.clientAddress.value || '').trim().length > 0 ? 'block' : 'none';
    } catch (e) { /* ignore */ }
  }
  
  // Inicializar Retirada no Balcão
  inicializarRetiradaBalcao();
});

// ============================================================
// FUNÇÃO PARA GERENCIAR RETIRADA NO BALCÃO
// ============================================================
function inicializarRetiradaBalcao() {
  const pickupCheckbox = document.getElementById('pickup-checkbox');
  const pickupInfoText = document.getElementById('pickup-info-text');
  const deliveryInfo = document.getElementById('delivery-info');
  const useLocationBtn = document.getElementById('use-location-btn');
  const clientAddressPreview = document.getElementById('client-address-preview');
  const pickupSection = document.getElementById('pickup-section');
  
  console.log('🏪 inicializarRetiradaBalcao() chamada');
  console.log('🏪 window.pickupEnabled:', window.pickupEnabled);
  console.log('🏪 pickupSection encontrado:', !!pickupSection);
  
  // Função para aplicar visibilidade da seção de pickup
  const aplicarVisibilidadePickup = () => {
    if (pickupSection) {
      // pickupEnabled true por padrão se não estiver definido
      const shouldShow = window.pickupEnabled === true || window.pickupEnabled === undefined;
      pickupSection.style.display = shouldShow ? 'block' : 'none';
      console.log('🏪 Seção de retirada no balcão:', shouldShow ? 'VISÍVEL' : 'OCULTA', '(pickupEnabled=' + window.pickupEnabled + ')');
    }
  };
  
  // Aplicar imediatamente
  aplicarVisibilidadePickup();
  
  // Também escutar evento caso as configurações sejam carregadas depois
  window.addEventListener('customSettingsLoaded', (e) => {
    console.log('🔔 Evento customSettingsLoaded recebido, pickupEnabled:', e.detail.pickupEnabled);
    aplicarVisibilidadePickup();
  });
  
  if (!pickupCheckbox) {
    console.log('⚠️ Elemento pickup-checkbox não encontrado');
    return;
  }
  
  pickupCheckbox.addEventListener('change', function() {
    isPickupMode = this.checked;
    console.log('🏪 Modo retirada no balcão:', isPickupMode);
    
    if (isPickupMode) {
      // Ativar modo retirada
      if (pickupInfoText) pickupInfoText.style.display = 'flex';
      if (deliveryInfo) deliveryInfo.style.display = 'none';
      if (useLocationBtn) useLocationBtn.style.display = 'none';
      if (clientAddressPreview) {
        clientAddressPreview.textContent = 'Retirada no Balcão';
        clientAddressPreview.style.color = 'var(--primary-color)';
      }
      
      // Zerar taxa de entrega
      entregaInfo = {
        distancia: 0,
        price: 0,
        taxa: 0,
        isPickup: true
      };
      
      // Atualizar totais
      atualizarCarrinho();
    } else {
      // Desativar modo retirada
      if (pickupInfoText) pickupInfoText.style.display = 'none';
      if (useLocationBtn) useLocationBtn.style.display = 'block';
      if (clientAddressPreview) {
        clientAddressPreview.textContent = 'Nenhum endereço selecionado';
        clientAddressPreview.style.color = '';
      }
      
      // Limpar info de entrega
      entregaInfo = null;
      
      // Atualizar totais
      atualizarCarrinho();
    }
  });
  
  console.log('✅ Retirada no balcão inicializada');
}

// ============================================================
// FUNÇÃO PARA CARREGAR DADOS DO CACHE LOCAL
// ============================================================
function carregarDadosDoCache() {
  // Verificar se a função de cache está disponível
  if (typeof window.ClienteCache === 'undefined' || !window.ClienteCache.carregar) {
    console.log('⚠️ Sistema de cache ainda não carregado, tentando novamente em 100ms...');
    setTimeout(carregarDadosDoCache, 100);
    return;
  }
  
  const cacheData = window.ClienteCache.carregar();
  
  if (!cacheData) {
    console.log('ℹ️ Nenhum dado de cliente no cache local');
    return;
  }
  
  console.log('📦 Dados encontrados no cache:', cacheData);
  
  // Preencher nome se disponível
  if (cacheData.nome && elements.clientName) {
    elements.clientName.value = cacheData.nome;
    console.log('✅ Nome preenchido do cache:', cacheData.nome);
  }
  
  // Se há endereço salvo, mostrar como endereço anterior
  if (cacheData.endereco && cacheData.coordinates) {
    mostrarEnderecoAnterior(cacheData);
  }
}

// ============================================================
// FUNÇÃO PARA MOSTRAR ENDEREÇO ANTERIOR COM OPÇÃO DE USAR
// ============================================================
function mostrarEnderecoAnterior(cacheData) {
  // Criar/atualizar seção de endereço anterior
  let previousAddressSection = document.getElementById('previous-address-section');
  
  if (!previousAddressSection) {
    // Criar seção de endereço anterior
    previousAddressSection = document.createElement('div');
    previousAddressSection.id = 'previous-address-section';
    previousAddressSection.className = 'previous-address-section';
    previousAddressSection.style.cssText = `
      background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);
      border: 2px solid #4CAF50;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 15px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    
    // Inserir antes da seção de entrega
    const deliverySection = document.getElementById('delivery-section');
    if (deliverySection && deliverySection.parentNode) {
      deliverySection.parentNode.insertBefore(previousAddressSection, deliverySection);
    }
  }
  
  // Esconder seção de entrega original quando há endereço anterior
  const deliverySection = document.getElementById('delivery-section');
  if (deliverySection) {
    deliverySection.style.display = 'none';
  }
  
  // Formatar valor
  const precoFormatado = cacheData.price ? cacheData.price.toFixed(2).replace('.', ',') : '0,00';
  const distanciaFormatada = cacheData.distance ? cacheData.distance.toFixed(2) : '0';
  const observacao = cacheData.addressNote ? `<p style="font-size: 12px; color: #aaa; margin-top: 5px;"><strong>Obs:</strong> ${cacheData.addressNote}</p>` : '';
  
  previousAddressSection.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 10px;">
      <i class="fas fa-history" style="color: #4CAF50; margin-right: 10px; font-size: 18px;"></i>
      <strong style="color: #4CAF50; font-size: 14px;">Seu último endereço</strong>
    </div>
    <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 10px;">
      <p style="color: #fff; margin: 0 0 5px 0; font-size: 13px;">${cacheData.endereco}</p>
      <p style="color: #4CAF50; margin: 0; font-size: 12px;">
        <i class="fas fa-map-marker-alt"></i> ${distanciaFormatada} km • 
        <i class="fas fa-truck"></i> R$ ${precoFormatado}
      </p>
      ${observacao}
    </div>
    <div style="display: flex; gap: 10px;">
      <button type="button" id="use-previous-address-btn" class="use-location-btn" style="flex: 1; background: #4CAF50;">
        <i class="fas fa-check"></i> Usar este endereço
      </button>
      <button type="button" id="new-address-btn" class="use-location-btn" style="flex: 1; background: #666;">
        <i class="fas fa-map-marker-alt"></i> Novo endereço
      </button>
    </div>
  `;
  
  // Adicionar eventos aos botões
  const usePreviousBtn = document.getElementById('use-previous-address-btn');
  const newAddressBtn = document.getElementById('new-address-btn');
  
  if (usePreviousBtn) {
    usePreviousBtn.addEventListener('click', () => {
      usarEnderecoAnterior(cacheData);
    });
  }
  
  if (newAddressBtn) {
    newAddressBtn.addEventListener('click', () => {
      // Esconder seção de endereço anterior
      previousAddressSection.style.display = 'none';
      // Mostrar seção de entrega original
      const deliverySection = document.getElementById('delivery-section');
      if (deliverySection) {
        deliverySection.style.display = 'block';
      }
      // Chamar função de calcular frete (geolocalização)
      if (window.Mapa && window.Mapa.showMapWithUserLocation) {
        window.Mapa.showMapWithUserLocation();
      }
    });
  }
}

// ============================================================
// FUNÇÃO PARA USAR ENDEREÇO ANTERIOR DO CACHE
// ============================================================
function usarEnderecoAnterior(cacheData) {
  console.log('🔄 Usando endereço anterior do cache:', cacheData);
  
  // Preencher campo de endereço
  if (elements.clientAddress) {
    elements.clientAddress.value = cacheData.endereco;
  }
  
  // Atualizar preview do endereço
  const clientAddressPreview = document.getElementById('client-address-preview');
  if (clientAddressPreview) {
    clientAddressPreview.textContent = cacheData.endereco;
    clientAddressPreview.classList.add('filled');
  }
  
  // Salvar coordenadas
  const coordsInput = document.getElementById('client-coordinates');
  if (coordsInput && cacheData.coordinates) {
    coordsInput.value = JSON.stringify(cacheData.coordinates);
  }
  
  // Atualizar objeto global de entrega (ambas as variáveis)
  const entregaData = {
    distance: cacheData.distance,
    price: cacheData.price,
    coordinates: cacheData.coordinates,
    addressNote: cacheData.addressNote || ''
  };
  window.entregaInfo = entregaData;
  entregaInfo = entregaData; // Atualizar variável local também
  
  // Mostrar informações de entrega
  const deliveryInfo = document.getElementById('delivery-info');
  const deliveryDistance = document.getElementById('delivery-distance');
  const deliveryPrice = document.getElementById('delivery-price');
  const deliveryError = document.getElementById('delivery-error');
  
  if (deliveryInfo && deliveryDistance && deliveryPrice) {
    deliveryDistance.textContent = cacheData.distance.toFixed(2);
    deliveryPrice.textContent = cacheData.price.toFixed(2).replace('.', ',');
    deliveryInfo.style.display = 'block';
    if (deliveryError) {
      deliveryError.style.display = 'none';
    }
  }
  
  // Mostrar observações se houver
  const deliveryNoteMain = document.getElementById('delivery-note-main');
  const deliveryNoteContainer = document.getElementById('delivery-note');
  if (deliveryNoteMain && deliveryNoteContainer && cacheData.addressNote) {
    deliveryNoteMain.textContent = cacheData.addressNote;
    deliveryNoteContainer.style.display = 'block';
  }
  
  // Esconder seção de endereço anterior após usar
  const previousAddressSection = document.getElementById('previous-address-section');
  if (previousAddressSection) {
    previousAddressSection.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <i class="fas fa-check-circle" style="color: #4CAF50; margin-right: 8px;"></i>
          <span style="color: #4CAF50;">Endereço selecionado</span>
        </div>
        <button type="button" id="change-address-btn" style="background: transparent; border: 1px solid #666; color: #aaa; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">
          <i class="fas fa-edit"></i> Alterar
        </button>
      </div>
      <p style="color: #fff; margin: 8px 0 0 0; font-size: 12px;">${cacheData.endereco}</p>
    `;
    
    // Adicionar evento para alterar endereço
    const changeBtn = document.getElementById('change-address-btn');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        // Recarregar dados do cache e mostrar opções novamente
        const freshCache = window.ClienteCache.carregar();
        if (freshCache) {
          mostrarEnderecoAnterior(freshCache);
        }
      });
    }
  }
  
  // Atualizar total do pedido
  atualizarResumoPedido();
  
  console.log('✅ Endereço anterior aplicado com sucesso!');
}

// Atualizar estado dos botões do carrossel
function atualizarEstadoBotoes() {
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  
  if (produtosDaCategoria.length <= 1) {
    // Se houver 0 ou 1 produto, desativar ambos os botões
    if (elements.prevProductBtn) elements.prevProductBtn.disabled = true;
    if (elements.nextProductBtn) elements.nextProductBtn.disabled = true;
  } else {
    // Ativar ambos os botões
    if (elements.prevProductBtn) elements.prevProductBtn.disabled = false;
    if (elements.nextProductBtn) elements.nextProductBtn.disabled = false;
  }
  
  console.log('Estado dos botões atualizado');
}

// Carregar categorias do servidor e criar botões dinamicamente
async function carregarCategoriasUI() {
  try {
    const res = await fetch('/api/categorias');
    if (!res.ok) {
      console.warn('Falha ao buscar categorias, status:', res.status);
      return;
    }
    const payload = await res.json();
    categorias = (payload && payload.categorias) ? payload.categorias : [];

    const container = elements.categoryButtonsContainer;
    if (!container) return;
    container.innerHTML = '';

    if (!categorias || categorias.length === 0) {
      // fallback - criar categorias padrão
      const defaults = ['Lanches', 'Bebidas', 'Porções'];
      categorias = defaults.map(n => ({ nome: n }));
    }

    // Detectar categoria de adicionais e bebidas para comportamento especial
    const catAd = categorias.find(c => /adicional/i.test(c.nome || ''));
    adicionaisCategoriaName = catAd ? catAd.nome : null;
    const catBeb = categorias.find(c => /bebid/i.test(c.nome || ''));
    bebidasCategoriaName = catBeb ? catBeb.nome : null;

    // Encontrar primeiro índice visível (ignorando a categoria de adicionais)
    const firstVisibleIndex = categorias.findIndex(c => !(adicionaisCategoriaName && c.nome === adicionaisCategoriaName));
    
    console.log('🔍 Criando botões de categoria...');
    console.log('📝 adicionaisCategoriaName:', adicionaisCategoriaName);
    console.log('📋 Todas as categorias:', categorias);
    
    categorias.forEach((c, idx) => {
      console.log(`🔍 Processando categoria: "${c.nome}"`);
      
      // Não desenhar botão para categoria de adicionais (apenas escondê-la)
      // Verificar por nome exato ou por regex - múltiplas verificações
      const nomeCategoria = (c.nome || '').toString().toLowerCase().trim();
      const isAdicionaisCategory = 
        nomeCategoria === 'adicionais' ||
        nomeCategoria === 'adicional' ||
        nomeCategoria.includes('adicional') ||
        (adicionaisCategoriaName && c.nome === adicionaisCategoriaName) ||
        /adicional/i.test(c.nome || '');
      
      if (isAdicionaisCategory) {
        console.log(`⏭️ ❌ IGNORANDO categoria "${c.nome}" (categoria de adicionais)`);
        return;
      }
      
      console.log(`✅ Criando botão para categoria "${c.nome}"`);
      const btn = document.createElement('button');
      btn.className = 'category-btn' + (idx === firstVisibleIndex ? ' active' : '');
      btn.dataset.category = c.nome;
      btn.textContent = c.nome;
      btn.addEventListener('click', () => {
        mudarCategoria(c.nome);
      });
      container.appendChild(btn);
    });

    // Atualizar organização de produtos e carrossel
    organizarProdutosPorCategoria();
    // definir a categoria atual como a primeira visível (ignorando adicionais) — se ainda for inválida, usar fallback
    const defaultCategory = (firstVisibleIndex >= 0 && categorias[firstVisibleIndex]) ? categorias[firstVisibleIndex].nome : (categorias[0] ? categorias[0].nome : Object.keys(produtosPorCategoria)[0]);
    if (!categoriaAtual || !produtosPorCategoria[categoriaAtual]) {
      categoriaAtual = defaultCategory;
    }
    atualizarCarrossel();
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
  }
}

// Função para carregar produtos
async function carregarProdutos() {
  try {
    console.log('Iniciando carregamento de produtos...');
    const res = await fetch('/api/produtos');
    console.log('Response status:', res.status);
    console.log('Response headers:', [...res.headers.entries()]);
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const rawData = await res.text();
    console.log('Raw data received:', rawData);
    
    // Tentar parsear como JSON
    try {
      produtos = JSON.parse(rawData);
      console.log('Produtos carregados com sucesso:', produtos);
    } catch (parseError) {
      console.error('Erro ao parsear JSON:', parseError);
      console.error('Dados recebidos:', rawData);
      return;
    }
    
    // Verificar se produtos foram carregados corretamente
    if (!produtos || produtos.length === 0) {
      console.error('Nenhum produto encontrado ou erro no carregamento');
      return;
    }
    
    console.log('Total de produtos carregados:', produtos.length);
    
    // Verificar as imagens e categorias dos produtos
    console.log('📦 Verificando detalhes de todos os produtos:');
    produtos.forEach((produto, index) => {
      console.log(`Produto ${index + 1}:`, {
        id: produto.id,
        nome: produto.nome,
        categoria: produto.categoria,
        preco: produto.preco,
        imagem: produto.imagem,
        hasImagem: !!produto.imagem
      });
    });
    
    // Verificar produtos que têm "Adicionais" na categoria
    const produtosAdicionais = produtos.filter(p => p.categoria && /adicional/i.test(p.categoria));
    console.log('🔍 Produtos com categoria "Adicionais":', produtosAdicionais);
    
    // Organizar produtos por categoria
    organizarProdutosPorCategoria();
    
    // Inicializar carrossel
    atualizarCarrossel();
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Organizar produtos por categoria
function organizarProdutosPorCategoria() {
  console.log('Organizando produtos por categorias dinâmicas...');
  if (!produtos || produtos.length === 0) return;

  // Se não houver categorias carregadas do servidor, manter fallback para heurísticas antigas
  if (!categorias || categorias.length === 0) {
    console.log('Nenhuma categoria dinâmica encontrada — aplicando heurística padrão');
    // manter o comportamento antigo
    produtosPorCategoria = {
      lanches: [],
      bebidas: [],
      porcoes: [],
      adicionais: []
    };

    produtos.forEach((produto) => {
      const cat = produto.categoria || '';
      if (/lanche|hambúrguer|burger|especiais|tradicionais/i.test(cat)) produtosPorCategoria.lanches.push(produto);
      else if (/bebida|refrigerante|suco|coca|guaraná/i.test(cat)) produtosPorCategoria.bebidas.push(produto);
      else if (/porção|porcoes|porcao|batata|onion|calabresa/i.test(cat)) produtosPorCategoria.porcoes.push(produto);
      else if (/adicional|extra|queijo|bacon|catupiry|molho/i.test(cat)) produtosPorCategoria.adicionais.push(produto);
      else produtosPorCategoria.lanches.push(produto);
    });
  } else {
    // Montar objeto com chaves por nome de categoria
    produtosPorCategoria = {};
    categorias.forEach(c => {
      produtosPorCategoria[c.nome] = [];
    });
    // categoria para itens sem categoria
    produtosPorCategoria['Sem Categoria'] = [];

    // Distribuir produtos para a categoria correspondente (match por igualdade ou inclusão, case-insensitive)
    produtos.forEach(produto => {
      const prodCat = (produto.categoria || '').toString().trim();
      if (!prodCat) {
        produtosPorCategoria['Sem Categoria'].push(produto);
        return;
      }

      // tentar igualdade exata (case-insensitive)
      const matchEqual = categorias.find(c => c.nome && c.nome.toLowerCase().trim() === prodCat.toLowerCase());
      if (matchEqual) {
        produtosPorCategoria[matchEqual.nome].push(produto);
        return;
      }

      // tentar contains
      const matchContains = categorias.find(c => prodCat.toLowerCase().includes((c.nome || '').toLowerCase()));
      if (matchContains) {
        produtosPorCategoria[matchContains.nome].push(produto);
        return;
      }

      // fallback: primeiro category
      produtosPorCategoria['Sem Categoria'].push(produto);
    });

    // detectar categorias especiais
    const catAd = categorias.find(c => /adicional/i.test(c.nome || ''));
    adicionaisCategoriaName = catAd ? catAd.nome : null;
    console.log('🔍 Categoria de adicionais detectada:', adicionaisCategoriaName);
    const catBeb = categorias.find(c => /bebid/i.test(c.nome || ''));
    bebidasCategoriaName = catBeb ? catBeb.nome : null;
    console.log('🔍 Categoria de bebidas detectada:', bebidasCategoriaName);
  }

  console.log('Produtos organizados:', produtosPorCategoria);
  console.log('📊 Resumo por categoria:');
  Object.keys(produtosPorCategoria).forEach(cat => {
    console.log(`  - ${cat}: ${produtosPorCategoria[cat].length} produtos`);
  });
}

// Atualizar carrossel com base na categoria selecionada
function atualizarCarrossel() {
  console.log('Iniciando atualização do carrossel...');
  console.log('Categoria atual:', categoriaAtual);
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  console.log('Produtos da categoria atual:', categoriaAtual, produtosDaCategoria);
  
  // Verificar se há produtos na categoria
  if (!produtosDaCategoria || produtosDaCategoria.length === 0) {
    console.log('Nenhum produto disponível nesta categoria');
    if (elements.currentProduct) {
      elements.currentProduct.innerHTML = `
        <div class="no-products">
          <p>Nenhum produto disponível nesta categoria</p>
        </div>
      `;
    }
    if (elements.carouselDots) {
      elements.carouselDots.innerHTML = '';
    }
    
    // Desativar botões quando não há produtos
    if (elements.prevProductBtn) elements.prevProductBtn.disabled = true;
    if (elements.nextProductBtn) elements.nextProductBtn.disabled = true;
    return;
  }
  
  console.log('Produtos encontrados na categoria, total:', produtosDaCategoria.length);
  
  // Garantir que o índice esteja dentro dos limites
  if (indiceProdutoAtual >= produtosDaCategoria.length) {
    indiceProdutoAtual = 0;
  }
  
  console.log('Índice do produto atual:', indiceProdutoAtual);
  renderizarProdutoAtual();
  renderizarIndicadoresCarrossel();
  
  // Atualizar estado dos botões
  atualizarEstadoBotoes();
}

// Renderizar produto atual no carrossel
function renderizarProdutoAtual() {
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  
  if (!produtosDaCategoria || produtosDaCategoria.length === 0) {
    console.log('Nenhum produto na categoria atual para renderizar');
    return;
  }
  
  const produto = produtosDaCategoria[indiceProdutoAtual];
  
  if (!elements.currentProduct) {
    console.error('Elemento currentProduct não encontrado');
    return;
  }
  
  // Log para debug
  console.log('Renderizando produto:', produto);
  console.log('Imagem do produto:', produto.imagem);
  
  // Verificar se a imagem é válida
  if (produto.imagem) {
    console.log('URL da imagem parece válida:', produto.imagem);
  } else {
    console.log('Produto sem imagem definida, usando placeholder');
  }
  
  // Verificar se a URL da imagem é relativa ou absoluta
  let imageUrl = produto.imagem || getPlaceholderSVG(300, 200, 'Imagem');
  if (imageUrl.startsWith('/')) {
    // Se for um caminho relativo, adicionar o host
    imageUrl = window.location.origin + imageUrl;
    console.log('URL da imagem ajustada para:', imageUrl);
  }
  
  elements.currentProduct.innerHTML = `
    <div class="product-card">
      <div class="product-image-container">
        <img src="${imageUrl}" 
             alt="${produto.nome}" 
             class="product-image" 
             onerror="console.error('Erro ao carregar imagem:', this.src); this.src='${getPlaceholderSVG(300, 200, 'Erro')}'; this.onerror=null;">
      </div>
      <div class="product-info">
        <h3 class="product-name">${produto.nome}</h3>
        <p class="product-description">${produto.descricao || 'Delicioso lanche preparado com ingredientes frescos'}</p>
        <div class="product-price">R$ ${produto.preco.toFixed(2).replace('.', ',')}</div>
        <button class="add-to-cart" data-id="${produto.id}">
          Adicionar ao Carrinho
        </button>
      </div>
    </div>
  `;
  
  // Verificar se a imagem foi renderizada corretamente
  const imgElement = elements.currentProduct.querySelector('.product-image');
  if (imgElement) {
    console.log('Elemento de imagem criado:', imgElement);
    console.log('Src da imagem:', imgElement.src);
    
    // Adicionar listeners para verificar o carregamento
    imgElement.addEventListener('load', function() {
      console.log('Imagem carregada com sucesso:', this.src);
    });
    
    imgElement.addEventListener('error', function(e) {
      console.error('Erro ao carregar imagem:', this.src, e);
    });
  } else {
    console.error('Elemento de imagem não encontrado após renderização');
  }
  
  // Atualizar indicadores ativos
  atualizarIndicadoresAtivos();
}

// Renderizar indicadores do carrossel
function renderizarIndicadoresCarrossel() {
  console.log('Iniciando renderização dos indicadores do carrossel...');
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  
  console.log('Produtos da categoria para indicadores:', produtosDaCategoria);
  
  if (!elements.carouselDots) {
    console.error('Elemento carouselDots não encontrado');
    return;
  }
  
  elements.carouselDots.innerHTML = '';
  
  if (!produtosDaCategoria || produtosDaCategoria.length === 0) {
    console.log('Nenhum indicador para renderizar - categoria vazia');
    return;
  }
  
  console.log('Número de indicadores a serem criados:', produtosDaCategoria.length);
  
  produtosDaCategoria.forEach((produto, index) => {
    const dot = document.createElement('div');
    dot.className = `dot ${index === indiceProdutoAtual ? 'active' : ''}`;
    dot.dataset.index = index;
    dot.addEventListener('click', () => {
      console.log('Clicou no indicador:', index);
      indiceProdutoAtual = index;
      renderizarProdutoAtual();
    });
    elements.carouselDots.appendChild(dot);
    console.log('Indicador criado para índice:', index, 'produto:', produto.nome);
  });
  
  console.log('Indicadores renderizados:', elements.carouselDots.children.length);
}

// Mostrar modal de seleção de quantidade
function mostrarModalQuantidade(produto) {
  console.log('🎯 mostrarModalQuantidade() chamada com produto:', produto);
  
  elements.quantityProductImage.src = produto.imagem || getPlaceholderSVG(80, 80, 'Imagem');
  elements.quantityProductImage.alt = produto.nome;
  elements.quantityProductName.textContent = produto.nome;
  elements.quantityProductPrice.textContent = `R$ ${produto.preco.toFixed(2).replace('.', ',')}`;
  
  quantidadeSelecionada = 1;
  elements.selectedQuantity.textContent = quantidadeSelecionada;
  
  // Limpar observação e adicionais selecionados
  observacaoAtual = '';
  adicionaisSelecionados = [];
  elements.observationInput.value = '';
  
  console.log('🔄 Limpando adicionais selecionados');
  console.log('📞 Chamando carregarAdicionais()...');
  
  // Carregar adicionais
  carregarAdicionais();
  
  console.log('✅ Modal de quantidade sendo exibido');
  mostrarModal(elements.quantityModal);
}

// Função para atualizar o preço exibido no modal de quantidade
function atualizarPrecoModalQuantidade() {
  if (produtoSelecionado) {
    // Calcular preço base
    let precoBase = produtoSelecionado.preco * quantidadeSelecionada;
    
    // Adicionar preço dos adicionais selecionados
    const precoAdicionais = adicionaisSelecionados.reduce((acc, adicional) => acc + adicional.preco, 0) * quantidadeSelecionada;
    
    // Calcular preço total
    const precoTotal = precoBase + precoAdicionais;
    
    // Atualizar exibição do preço
    elements.quantityProductPrice.textContent = `R$ ${precoTotal.toFixed(2).replace('.', ',')}`;
  }
}

// Carregar adicionais no modal (ou buffet para marmitas)
async function carregarAdicionais() {
  console.log('🍔 carregarAdicionais() chamada');
  console.log('📦 produtoSelecionado:', produtoSelecionado);
  
  // Verificar se é categoria Marmita/Marmitas (case insensitive)
  const categoriaProduto = (produtoSelecionado && produtoSelecionado.categoria) ? produtoSelecionado.categoria.toLowerCase().trim() : '';
  const isMarmita = categoriaProduto === 'marmita' || categoriaProduto === 'marmitas';
  
  console.log('🍱 Categoria do produto:', produtoSelecionado?.categoria);
  console.log('🍱 Categoria normalizada:', categoriaProduto);
  console.log('🍱 É marmita:', isMarmita);
  
  if (isMarmita) {
    // Carregar buffet do dia ao invés de adicionais
    await carregarBuffetDoDia();
    return;
  }
  
  // Determinar lista de adicionais de forma robusta
  const adicionaisList = getAdicionaisList();
  console.log('📋 adicionaisList:', adicionaisList);
  console.log('📊 Quantidade de adicionais encontrados:', adicionaisList.length);

  // Se o produto for bebida ou se o produto for da própria subcategoria adicionais, não mostrar
  const produtoIsBebida = (bebidasCategoriaName && produtoSelecionado && produtoSelecionado.categoria && produtoSelecionado.categoria.toLowerCase().trim() === bebidasCategoriaName.toLowerCase().trim()) || (produtoSelecionado && /bebida/i.test(produtoSelecionado.categoria || ''));
  const produtoIsAdicional = (adicionaisCategoriaName && produtoSelecionado && produtoSelecionado.categoria && produtoSelecionado.categoria.toLowerCase().trim() === adicionaisCategoriaName.toLowerCase().trim()) || (produtoSelecionado && /adicional/i.test(produtoSelecionado.categoria || ''));
  
  console.log('🍺 produtoIsBebida:', produtoIsBebida);
  console.log('➕ produtoIsAdicional:', produtoIsAdicional);

  if (adicionaisList.length > 0 && !produtoIsBebida && !produtoIsAdicional) {
    console.log('✅ Mostrando seção de adicionais');
    console.log('📦 Element additionalsSection:', elements.additionalsSection);
    console.log('📦 Element additionalsList:', elements.additionalsList);
    elements.additionalsSection.style.display = 'block';
    console.log('✅ Style display definido como: block');
    
    // Restaurar título para "Adicionais" (caso tenha sido mudado para Buffet)
    const sectionTitle = elements.additionalsSection.querySelector('h3');
    if (sectionTitle) {
      sectionTitle.innerHTML = 'Adicionais';
    }
    
    elements.additionalsList.innerHTML = '';
    console.log('✅ Lista de adicionais limpa, pronta para adicionar itens');
    console.log(`🔄 Iniciando loop para renderizar ${adicionaisList.length} adicionais...`);

    adicionaisList.forEach((adicional, index) => {
      console.log(`  📌 Renderizando adicional ${index + 1}/${adicionaisList.length}:`, adicional.nome);
      const additionalItem = document.createElement('div');
      additionalItem.className = 'additional-item';
      additionalItem.innerHTML = `
        <input type="checkbox" id="additional-${adicional.id}" class="additional-checkbox" data-id="${adicional.id}">
        <div class="additional-info">
          <div class="additional-name">${adicional.nome}</div>
          <div class="additional-price">R$ ${adicional.preco.toFixed(2).replace('.', ',')}</div>
        </div>
      `;

      const checkbox = additionalItem.querySelector('.additional-checkbox');
      checkbox.addEventListener('change', (e) => {
        const adicionalId = parseInt(e.target.dataset.id);
        const adicionalObj = adicionaisList.find(a => a.id === adicionalId);

        if (e.target.checked) {
          adicionaisSelecionados.push(adicionalObj);
        } else {
          adicionaisSelecionados = adicionaisSelecionados.filter(a => a.id !== adicionalId);
        }

        atualizarPrecoModalQuantidade();
      });

      elements.additionalsList.appendChild(additionalItem);
      console.log(`  ✅ Adicional "${adicional.nome}" adicionado ao DOM`);
    });
    console.log('✅ Adicionais renderizados com sucesso!');
    console.log('📊 Total de elementos filhos em additionalsList:', elements.additionalsList.children.length);
    console.log('📊 Display atual da seção:', window.getComputedStyle(elements.additionalsSection).display);
  } else {
    console.log('❌ Ocultando seção de adicionais - motivo:');
    console.log('   - Sem adicionais:', adicionaisList.length === 0);
    console.log('   - É bebida:', produtoIsBebida);
    console.log('   - É adicional:', produtoIsAdicional);
    elements.additionalsSection.style.display = 'none';
  }
}

// ============================================================
// FUNÇÃO PARA CARREGAR BUFFET DO DIA (MARMITAS)
// ============================================================
async function carregarBuffetDoDia() {
  console.log('🍱 carregarBuffetDoDia() chamada');
  
  // Limpar seleções anteriores
  buffetSelecionados = [];
  
  try {
    const res = await fetch('/api/buffet');
    const data = await res.json();
    
    if (!data.success || !data.itens || data.itens.length === 0) {
      console.log('🍱 Nenhum item no buffet - ocultando seção');
      elements.additionalsSection.style.display = 'none';
      return;
    }
    
    console.log('🍱 Itens do buffet carregados:', data.itens.length);
    
    // Mostrar seção de adicionais mas com título de buffet
    elements.additionalsSection.style.display = 'block';
    
    // Alterar título da seção para "Buffet Atual:"
    const sectionTitle = elements.additionalsSection.querySelector('h3');
    if (sectionTitle) {
      sectionTitle.innerHTML = '<i class="fas fa-utensils" style="color: #3498db;"></i> Buffet Atual:';
    }
    
    // Limpar lista
    elements.additionalsList.innerHTML = '';
    
    // Renderizar itens do buffet
    data.itens.forEach((item) => {
      const buffetItem = document.createElement('div');
      buffetItem.className = 'additional-item buffet-item';
      buffetItem.innerHTML = `
        <input type="checkbox" id="buffet-${item.id}" class="additional-checkbox buffet-checkbox" data-id="${item.id}" data-nome="${item.nome}">
        <div class="additional-info">
          <div class="additional-name">${item.nome}</div>
          <div class="additional-price" style="color: #27ae60; font-size: 0.85rem;">Incluso</div>
        </div>
      `;

      const checkbox = buffetItem.querySelector('.buffet-checkbox');
      checkbox.addEventListener('change', (e) => {
        const itemId = parseInt(e.target.dataset.id);
        const itemNome = e.target.dataset.nome;

        if (e.target.checked) {
          buffetSelecionados.push({ id: itemId, nome: itemNome });
        } else {
          buffetSelecionados = buffetSelecionados.filter(b => b.id !== itemId);
        }
        
        console.log('🍱 Buffet selecionados:', buffetSelecionados);
      });

      elements.additionalsList.appendChild(buffetItem);
    });
    
    console.log('✅ Buffet do dia renderizado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao carregar buffet:', error);
    elements.additionalsSection.style.display = 'none';
  }
}

// Retorna a lista de produtos que são considerados adicionais
function getAdicionaisList() {
  console.log('🔍 getAdicionaisList() chamada');
  console.log('📝 adicionaisCategoriaName:', adicionaisCategoriaName);
  console.log('🗂️ produtosPorCategoria:', produtosPorCategoria);
  console.log('🗂️ Chaves disponíveis em produtosPorCategoria:', Object.keys(produtosPorCategoria));
  console.log('📋 Total de produtos carregados:', produtos.length);
  
  let list = [];
  
  // Tentar encontrar categoria "Adicionais" de várias formas
  if (adicionaisCategoriaName && produtosPorCategoria[adicionaisCategoriaName]) {
    list = produtosPorCategoria[adicionaisCategoriaName];
    console.log('✅ Lista de adicionais encontrada por adicionaisCategoriaName:', list);
  } else if (produtosPorCategoria['Adicionais'] && produtosPorCategoria['Adicionais'].length > 0) {
    list = produtosPorCategoria['Adicionais'];
    console.log('✅ Lista de adicionais encontrada em produtosPorCategoria["Adicionais"]:', list);
  } else if (produtosPorCategoria.adicionais && produtosPorCategoria.adicionais.length > 0) {
    list = produtosPorCategoria.adicionais;
    console.log('✅ Lista de adicionais encontrada em produtosPorCategoria.adicionais:', list);
  } else {
    // Tentar buscar por chave que contenha "adicional" (case insensitive)
    console.log('⚠️ Tentando buscar por chave que contenha "adicional"...');
    const adicionaisKey = Object.keys(produtosPorCategoria).find(key => /adicional/i.test(key));
    if (adicionaisKey && produtosPorCategoria[adicionaisKey]) {
      list = produtosPorCategoria[adicionaisKey];
      console.log(`✅ Lista de adicionais encontrada pela chave "${adicionaisKey}":`, list);
    } else {
      // fallback: filtrar produtos que tenham indicador de adicional
      console.log('⚠️ Nenhuma categoria de adicionais encontrada - usando fallback (filtro de produtos)...');
      console.log('📋 Todos os produtos:', produtos);
      list = produtos.filter(p => {
        const cat = (p.categoria || '').toString();
        const match = /adicional|extra|opcional|acrescentar/i.test(cat) || /adicional|extra|opcional|acrescentar/i.test((p.nome||''));
        if (match) {
          console.log(`  ✅ Produto "${p.nome}" corresponde ao filtro (categoria: "${cat}")`);
        }
        return match;
      });
      console.log('⚠️ Lista de adicionais encontrada por fallback (filtro):', list);
    }
  }
  
  console.log('📤 Retornando lista de adicionais:', list);
  console.log('📊 Total de adicionais:', list.length);
  return Array.isArray(list) ? list : [];
}

// Atualizar quantidade selecionada
function atualizarQuantidade(delta) {
  const novaQuantidade = quantidadeSelecionada + delta;
  if (novaQuantidade >= 1 && novaQuantidade <= 99) {
    quantidadeSelecionada = novaQuantidade;
    elements.selectedQuantity.textContent = quantidadeSelecionada;
    
    // Atualizar o preço exibido no modal
    atualizarPrecoModalQuantidade();
  }
}

// Atualizar indicadores ativos
function atualizarIndicadoresAtivos() {
  console.log('Iniciando atualização dos indicadores ativos...');
  
  if (!elements.carouselDots) {
    console.error('Elemento carouselDots não encontrado');
    return;
  }
  
  const dots = elements.carouselDots.querySelectorAll('.dot');
  console.log('Número de dots encontrados:', dots.length);
  console.log('Índice do produto atual:', indiceProdutoAtual);
  
  dots.forEach((dot, index) => {
    if (index === indiceProdutoAtual) {
      dot.classList.add('active');
      console.log('Dot', index, 'ativado');
    } else {
      dot.classList.remove('active');
      console.log('Dot', index, 'desativado');
    }
  });
}

// Navegar para o próximo produto
function proximoProduto() {
  // Proteção contra execuções duplicadas (múltiplos event listeners acionando ao mesmo tempo)
  if (proximoProduto._locked) {
    console.log('proximoProduto: chamada ignorada devido ao lock');
    return;
  }
  proximoProduto._locked = true;
  setTimeout(() => { proximoProduto._locked = false; }, 150);

  console.log('Navegando para o próximo produto');
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  
  if (!produtosDaCategoria || produtosDaCategoria.length === 0) {
    console.log('Nenhuma categoria ativa ou categoria vazia');
    return;
  }
  
  console.log('Índice atual:', indiceProdutoAtual);
  console.log('Total de produtos:', produtosDaCategoria.length);
  
  indiceProdutoAtual = (indiceProdutoAtual + 1) % produtosDaCategoria.length;
  console.log('Novo índice:', indiceProdutoAtual);
  
  renderizarProdutoAtual();
  atualizarEstadoBotoes();
}

// Navegar para o produto anterior
function produtoAnterior() {
  // Proteção contra execuções duplicadas (múltiplos event listeners acionando ao mesmo tempo)
  if (produtoAnterior._locked) {
    console.log('produtoAnterior: chamada ignorada devido ao lock');
    return;
  }
  produtoAnterior._locked = true;
  setTimeout(() => { produtoAnterior._locked = false; }, 150);

  console.log('Navegando para o produto anterior');
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  
  if (!produtosDaCategoria || produtosDaCategoria.length === 0) {
    console.log('Nenhuma categoria ativa ou categoria vazia');
    return;
  }
  
  console.log('Índice atual:', indiceProdutoAtual);
  console.log('Total de produtos:', produtosDaCategoria.length);
  
  indiceProdutoAtual = (indiceProdutoAtual - 1 + produtosDaCategoria.length) % produtosDaCategoria.length;
  console.log('Novo índice:', indiceProdutoAtual);
  
  renderizarProdutoAtual();
  atualizarEstadoBotoes();
}

// Mudar categoria
function mudarCategoria(novaCategoria) {
  // impedir selecionar a subcategoria de adicionais como categoria principal
  const isAdicionaisCategory = (adicionaisCategoriaName && novaCategoria === adicionaisCategoriaName) || /adicional/i.test(novaCategoria || '');
  
  if (isAdicionaisCategory) {
    console.log('⛔ Tentativa de mudar para a subcategoria adicionais interrompida:', novaCategoria);
    return;
  }
  console.log('✅ Mudando categoria para:', novaCategoria);
  // Atualizar botões dinamicamente
  if (elements.categoryButtonsContainer) {
    const btns = elements.categoryButtonsContainer.querySelectorAll('.category-btn');
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === novaCategoria);
    });
  }

  // Atualizar categoria atual
  categoriaAtual = novaCategoria;
  console.log('Categoria atual definida como:', categoriaAtual);
  
  // Resetar índice do produto
  indiceProdutoAtual = 0;
  console.log('Índice do produto resetado para:', indiceProdutoAtual);
  
  // Atualizar carrossel
  atualizarCarrossel();
}

// Adicionar produto ao carrinho
function adicionarAoCarrinho(produto, quantidade, observacao, adicionais) {
  // Verificar se há adicionais específicos para este produto
  let adicionaisParaEsteItem = [];
  let buffetParaEsteItem = [];

  // Se o produto for da categoria 'Adicionais', não aplicamos os adicionais selecionados.
  const produtoIsAdicional = (adicionaisCategoriaName && produto.categoria && produto.categoria.toLowerCase().trim() === adicionaisCategoriaName.toLowerCase().trim()) || /adicional/i.test(produto.categoria || '');
  
  // Verificar se é marmita
  const categoriaProduto = (produto && produto.categoria) ? produto.categoria.toLowerCase().trim() : '';
  const isMarmita = categoriaProduto === 'marmita' || categoriaProduto === 'marmitas';

  if (produtoIsAdicional) {
    adicionaisParaEsteItem = [];
  } else if (isMarmita) {
    // Para marmitas, usar buffet selecionado
    buffetParaEsteItem = buffetSelecionados.length > 0 ? [...buffetSelecionados] : [];
    adicionaisParaEsteItem = [];
  } else {
    adicionaisParaEsteItem = adicionaisSelecionados.length > 0 ? adicionaisSelecionados : (adicionais || []);
  }
  
  carrinho.push({
    produto: produto,
    quantidade: quantidade,
    observacao: observacao,
    adicionais: adicionaisParaEsteItem,
    buffet: buffetParaEsteItem
  });
  
  // Limpar os adicionais e buffet selecionados
  adicionaisSelecionados = [];
  buffetSelecionados = [];
  
  atualizarCarrinho();
  mostrarNotificacao(`${quantidade}x ${produto.nome} adicionado(s) ao carrinho!`);
}

// Atualizar carrinho
function atualizarCarrinho() {
  // Atualizar contador do carrinho
  const totalItens = carrinho.reduce((total, item) => total + item.quantidade, 0);
  elements.cartCount.textContent = totalItens;
  elements.cartCountModal.textContent = totalItens;
  
  // Atualizar itens do carrinho no modal
  elements.cartItems.innerHTML = '';
  
  carrinho.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    
    // Construir HTML do item
    let itemHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.quantidade}x ${item.produto.nome}</div>
    `;
    
    // Adicionar buffet se existir (para marmitas)
    if (item.buffet && item.buffet.length > 0) {
      const buffetText = item.buffet.map(b => b.nome).join(', ');
      itemHTML += `<div class="cart-item-additionals" style="color: #3498db;"><i class="fas fa-utensils"></i> Buffet: ${buffetText}</div>`;
    }
    
    // Adicionar adicionais se existirem
    if (item.adicionais && item.adicionais.length > 0) {
      const adicionaisText = item.adicionais.map(a => a.nome).join(', ');
      itemHTML += `<div class="cart-item-additionals">Adicionais: ${adicionaisText}</div>`;
    }
    
    // Adicionar observação se existir
    if (item.observacao) {
      itemHTML += `<div class="cart-item-observation">${item.observacao}</div>`;
    }
    
    // Calcular preço total do item (produto + adicionais)
    const precoProduto = item.produto.preco * item.quantidade;
    const precoAdicionais = (item.adicionais || []).reduce((acc, adicional) => acc + adicional.preco, 0) * item.quantidade;
    const precoTotal = precoProduto + precoAdicionais;
    
    itemHTML += `
        <div class="cart-item-price">R$ ${precoTotal.toFixed(2).replace('.', ',')}</div>
      </div>
      <div class="cart-item-actions">
        <div class="quantity-control-cart">
          <button class="quantity-btn-cart decrease" data-index="${index}">-</button>
          <span class="quantity-cart">${item.quantidade}</span>
          <button class="quantity-btn-cart increase" data-index="${index}">+</button>
        </div>
        <button class="remove-item" data-index="${index}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    
    li.innerHTML = itemHTML;
    elements.cartItems.appendChild(li);
  });
  
  // Adicionar eventos aos botões de quantidade
  document.querySelectorAll('.quantity-btn-cart.decrease').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      if (carrinho[index].quantidade > 1) {
        carrinho[index].quantidade -= 1;
      } else {
        carrinho.splice(index, 1);
      }
      atualizarCarrinho();
    });
  });
  
  document.querySelectorAll('.quantity-btn-cart.increase').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      carrinho[index].quantidade += 1;
      atualizarCarrinho();
    });
  });
  
  document.querySelectorAll('.remove-item').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      carrinho.splice(index, 1);
      atualizarCarrinho();
    });
  });
  
  // Atualizar total
  const total = carrinho.reduce((sum, item) => {
    // Calcular preço do produto
    let precoProduto = item.produto.preco * item.quantidade;
    
    // Adicionar preço dos adicionais
    const precoAdicionais = item.adicionais.reduce((acc, adicional) => acc + adicional.preco, 0) * item.quantidade;
    
    return sum + precoProduto + precoAdicionais;
  }, 0);
  
  elements.cartTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  elements.orderTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

  // Atualizar total com valor da entrega, se disponível (aceita price === 0)
  const entregaAtual = entregaInfo || (typeof window !== 'undefined' ? window.entregaInfo : null);
  if (entregaAtual && entregaAtual.price !== null && entregaAtual.price !== undefined) {
    const totalComEntrega = total + entregaAtual.price;
    elements.cartTotal.textContent = `R$ ${totalComEntrega.toFixed(2).replace('.', ',')}`;
    elements.orderTotal.textContent = `R$ ${totalComEntrega.toFixed(2).replace('.', ',')}`;
  }
  
  // Atualizar resumo do pedido
  atualizarResumoPedido();
}

// Atualizar resumo do pedido
function atualizarResumoPedido() {
  elements.orderItemsSummary.innerHTML = '';
  
  carrinho.forEach(item => {
    const li = document.createElement('li');
    li.className = 'order-item-summary';
    
    // Construir HTML do item
    let itemHTML = `
      <div>
        <div>${item.quantidade}x ${item.produto.nome}</div>
    `;
    
    // Adicionar adicionais se existirem
    if (item.adicionais && item.adicionais.length > 0) {
      const adicionaisText = item.adicionais.map(a => a.nome).join(', ');
      itemHTML += `<div class="order-item-additionals">Adicionais: ${adicionaisText}</div>`;
    }
    
    // Adicionar observação se existir
    if (item.observacao) {
      itemHTML += `<div class="order-item-observation">${item.observacao}</div>`;
    }
    
    // Calcular preço total do item (produto + adicionais)
    const precoProduto = item.produto.preco * item.quantidade;
    const precoAdicionais = item.adicionais.reduce((acc, adicional) => acc + adicional.preco, 0) * item.quantidade;
    const precoTotal = precoProduto + precoAdicionais;
    
    itemHTML += `
      </div>
      <span>R$ ${precoTotal.toFixed(2).replace('.', ',')}</span>
    `;
    
    li.innerHTML = itemHTML;
    elements.orderItemsSummary.appendChild(li);
  });
  
  // Debug: Verificar informações de entrega
  console.log('📦 atualizarResumoPedido - entregaInfo:', entregaInfo);
  console.log('📦 atualizarResumoPedido - window.entregaInfo:', window.entregaInfo);
  
  const entregaParaResumo = entregaInfo || (typeof window !== 'undefined' ? window.entregaInfo : null);
  console.log('📦 entregaParaResumo:', entregaParaResumo);
  
  if (entregaParaResumo && entregaParaResumo.price !== null && entregaParaResumo.price !== undefined) {
    console.log('✅ Adicionando item de entrega ao resumo');
    const entregaItem = document.createElement('li');
    entregaItem.className = 'order-item-summary';
    entregaItem.innerHTML = `
      <div>
        <div>Entrega</div>
        <div>Distância: ${Number(entregaParaResumo.distance || 0).toFixed(2)} km</div>
      </div>
      <span>R$ ${Number(entregaParaResumo.price).toFixed(2).replace('.', ',')}</span>
    `;
    elements.orderItemsSummary.appendChild(entregaItem);
  } else {
    console.log('❌ Entrega não será adicionada ao resumo. Price:', entregaParaResumo?.price);
  }
}

// Mostrar notificação
function mostrarNotificacao(mensagem) {
  // Criar elemento de notificação
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = mensagem;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #27ae60;
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 1001;
    animation: fadeInOut 3s ease;
  `;
  
  // Adicionar animação
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; bottom: 0; }
      10% { opacity: 1; bottom: 20px; }
      90% { opacity: 1; bottom: 20px; }
      100% { opacity: 0; bottom: 0; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Remover notificação após 3 segundos
  setTimeout(() => {
    notification.remove();
    style.remove();
  }, 3000);
}

// Mostrar modal
function mostrarModal(modal) {
  modal.classList.add('show');
  // Removido o bloqueio de scroll para permitir rolagem na página
}

// Fechar modal
function fecharModal(modal) {
  modal.classList.remove('show');
  // Removido o controle de scroll para permitir rolagem na página
}

// Função para gerar SVG placeholder inline
function getPlaceholderSVG(width, height, text = '') {
  // Codificar o texto para uso em SVG
  const encodedText = encodeURIComponent(text);
  
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'%3E%3Crect width='100%25' height='100%25' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='${Math.min(width, height) / 8}' fill='%23666'%3E${encodedText}%3C/text%3E%3C/svg%3E`;
}

// Carregar informações do cliente via WhatsApp ID
async function carregarClienteInfo() {
  if (!whatsappId) return;
  
  try {
    const res = await fetch(`/api/clientes/${encodeURIComponent(whatsappId)}`);
    const data = await res.json();
    
    if (data.success && data.cliente) {
      clienteInfo = data.cliente;
      
      // Preencher campos do formulário com dados salvos
      elements.clientName.value = clienteInfo.nome || '';
      elements.clientAddress.value = clienteInfo.endereco || '';
      
      // Preencher automaticamente as informações salvas
      if (clienteInfo.nome) {
        elements.clientName.value = clienteInfo.nome;
      }
      
      // Telefone não é necessário preencher novamente pois veio pelo WhatsApp
      
      // Mostrar opção para usar endereço anterior
      if (clienteInfo.endereco) {
          // Preencher endereço automaticamente, mas permitir alteração
          elements.clientAddress.value = clienteInfo.endereco;
        }
    }
  } catch (error) {
    console.error('Erro ao carregar informações do cliente:', error);
  }
}

// Carregar informações de sessão salvas via JWT cookie (brutus_token)
async function carregarSessionInfo() {
  try {
    const res = await fetch('/api/session');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.success || !data.session) return;

    const s = data.session;
    console.log('🔐 sessão recuperada do servidor:', s);

    // Se houver whatsappId na sessão e ainda não temos whatsappId, usar
    if (s.whatsappId && !whatsappId) {
      whatsappId = s.whatsappId;
      try { sessionStorage.setItem('whatsappId', whatsappId); } catch (e) { /* ignore */ }
    }

    // Preencher nome se disponível e campo vazio
    if (s.nome && (!elements.clientName.value || elements.clientName.value.trim() === '')) {
      elements.clientName.value = s.nome;
    }

    // Preencher endereço e mostrar opção de usar endereço anterior
    if (s.endereco) {
      // Preencher campo de endereço se vazio

      // preencher campo de endereço se vazio
      if (!elements.clientAddress.value || elements.clientAddress.value.trim() === '') {
        elements.clientAddress.value = s.endereco;
      }
    }

    // Store session payload in memory but DO NOT auto-apply delivery fee
    // The goal is to avoid applying delivery price until user explicitly calculates or applies it.
    // If the UI has a 'use-last-session' button elsewhere, that button can call aplicarSessaoSalva();
    sessionInfoSaved = s;
    // If the page still contains a use-last-session button, show it as an option to the user
    const fee = (s.deliveryFee !== undefined) ? s.deliveryFee : (s.price !== undefined ? s.price : null);
    const coords = s.coordenadas ?? s.coordinates ?? null;
    if (elements.useLastSessionBtn && (s.endereco || (fee !== null && fee !== undefined) || coords)) {
      try { elements.useLastSessionBtn.style.display = 'inline-block'; } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.warn('Erro ao carregar sessão do servidor:', err && err.message);
  }
}

// Salvar informações do cliente
async function salvarClienteInfo() {
  if (!whatsappId) return;
  
  const clienteData = {
    whatsappId: whatsappId,
    nome: elements.clientName.value,
    endereco: elements.clientAddress.value
  };
  
  try {
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clienteData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      console.log('Informações do cliente salvas com sucesso');
    }
  } catch (error) {
    console.error('Erro ao salvar informações do cliente:', error);
  }
}

// Event Listeners
elements.cartIcon.addEventListener('click', () => {
  mostrarModal(elements.cartModal);
});

elements.checkoutBtn.addEventListener('click', () => {
  if (carrinho.length === 0) {
    mostrarNotificacao('Adicione itens ao carrinho antes de finalizar!');
    return;
  }
  
  // Atualizar resumo do pedido antes de abrir o modal de checkout
  atualizarResumoPedido();
  
  fecharModal(elements.cartModal);
  mostrarModal(elements.checkoutModal);
  // Inicializar a seção de dinheiro com base no método de pagamento padrão
  if (elements.paymentMethod.value === 'dinheiro') {
    elements.dinheiroSection.style.display = 'block';
  } else {
    elements.dinheiroSection.style.display = 'none';
    elements.valorPago.value = '';
  }
});

// Adicionar evento para mudança de método de pagamento
elements.paymentMethod.addEventListener('change', () => {
  if (elements.paymentMethod.value === 'dinheiro') {
    elements.dinheiroSection.style.display = 'block';
  } else {
    elements.dinheiroSection.style.display = 'none';
    elements.valorPago.value = '';
  }
});

elements.confirmOrderBtn.addEventListener('click', async () => {
  if (carrinho.length === 0) return;
  
  // Validar campos obrigatórios (telefone não é obrigatório pois já veio pelo WhatsApp)
  // Se for retirada no balcão, não precisa de endereço
  if (!elements.clientName.value) {
    mostrarNotificacao('Por favor, preencha seu nome!');
    return;
  }
  
  if (!isPickupMode && !elements.clientAddress.value) {
    mostrarNotificacao('Por favor, preencha seu endereço ou selecione Retirada no Balcão!');
    return;
  }
  
  // Verificar se o valor da entrega foi calculado (não necessário se for retirada)
  // Se a entregaInfo.price for 0 (taxa mínima ou retirada), ainda é considerado válido
  if (!isPickupMode && (!entregaInfo || entregaInfo.price === null || entregaInfo.price === undefined)) {
    // Verificar também no objeto global window
    if (window.entregaInfo && (window.entregaInfo.price !== null && window.entregaInfo.price !== undefined)) {
      entregaInfo = window.entregaInfo;
    } else {
      mostrarNotificacao('Por favor, calcule o valor da entrega antes de finalizar o pedido!');
      return;
    }
  }
  
  // Se já tem endereço salvo e não digitou um novo, usar o salvo
  if (clienteInfo && clienteInfo.endereco && !elements.clientAddress.value) {
    elements.clientAddress.value = clienteInfo.endereco;
  }
  
  // Note: 'usar endereço anterior' has been removed; the client address will be prefilled if empty.
  
  // Validar valor pago se for dinheiro e a seção estiver visível
  if (elements.paymentMethod.value === 'dinheiro' && elements.dinheiroSection.style.display === 'block') {
    const valorPago = parseFloat(elements.valorPago.value);
    const totalPedido = calcularTotalPedido();
    
    // Verificar se o valor é 0 ou 0,00 (cliente quer troco)
    if (isNaN(valorPago) || valorPago < 0) {
      mostrarNotificacao('Por favor, informe o valor pago em dinheiro!');
      return;
    }
    
    if (valorPago > 0 && valorPago < totalPedido) {
      mostrarNotificacao('O valor pago deve ser maior ou igual ao total do pedido!');
      return;
    }
  }
  
  // DEBUG: Verificar whatsappId antes de criar pedido
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 DEBUG - CONFIRMAÇÃO DE PEDIDO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📱 whatsappId (variável global):', whatsappId);
  console.log('  📱 whatsappId (sessionStorage):', sessionStorage.getItem('whatsappId'));
  console.log('  🌐 URL atual:', window.location.href);
  console.log('  🌐 URL search params:', window.location.search);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Tentar recuperar do sessionStorage se whatsappId estiver null
  if (!whatsappId) {
    whatsappId = sessionStorage.getItem('whatsappId');
    console.log('⚠️ ATENÇÃO: whatsappId estava null, recuperado do sessionStorage:', whatsappId);
    
    if (!whatsappId) {
      console.error('❌ ERRO CRÍTICO: whatsappId não encontrado em lugar nenhum!');
      console.error('   Isso significa que o pedido será criado sem vincular ao WhatsApp do cliente.');
    }
  }
  
  // Preparar dados do cliente para salvar no banco
  const clienteData = {
    nome: elements.clientName.value,
    endereco: isPickupMode ? 'Retirada no Balcão' : elements.clientAddress.value,
    whatsappId: whatsappId,
    // Se o whatsappId for um ID de grupo (@g.us), NÃO extrair telefone — pode gerar o número do grupo
    telefone: (whatsappId && !String(whatsappId).includes('@g.us')) ? whatsappId.replace(/\D/g, '') : null,
    pagamento: elements.paymentMethod.value,
    troco: elements.paymentMethod.value === 'dinheiro' ? parseFloat(elements.valorPago.value) : null,
    isPickup: isPickupMode
  };
  
  console.log('📞 Cliente Data sendo enviado:', {
    whatsappId: clienteData.whatsappId,
    telefone: clienteData.telefone,
    nome: clienteData.nome
  });
  
  // Salvar/atualizar informações do cliente no banco
  await salvarClienteInfo();
  
  // Preparar dados do pedido
  const pedidoData = {
    cliente: clienteData,
    itens: carrinho,
    total: calcularTotalPedido(),
    entrega: entregaInfo
  };
  
  try {
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pedidoData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      // ============================================================
      // ATUALIZAR CACHE LOCAL COM DADOS DO PEDIDO CONFIRMADO
      // ============================================================
      if (window.ClienteCache && window.ClienteCache.salvar) {
        const coordsInput = document.getElementById('client-coordinates');
        let coords = null;
        try {
          if (coordsInput && coordsInput.value) {
            coords = JSON.parse(coordsInput.value);
          }
        } catch (e) {}
        
        window.ClienteCache.salvar({
          nome: elements.clientName.value,
          endereco: elements.clientAddress.value,
          coordinates: coords || (entregaInfo ? entregaInfo.coordinates : null),
          distance: entregaInfo ? entregaInfo.distance : 0,
          price: entregaInfo ? entregaInfo.price : 0,
          addressNote: entregaInfo ? entregaInfo.addressNote : ''
        });
        console.log('✅ Cache atualizado após confirmação do pedido');
      }
      
      // Fechar modal de checkout e mostrar confirmação
      fecharModal(elements.checkoutModal);
      mostrarModal(elements.confirmationModal);
      
      // Limpar carrinho
      carrinho = [];
      atualizarCarrinho();
      
      // Limpar informações de entrega
      entregaInfo = null;
      if (elements.deliveryInfo) {
        elements.deliveryInfo.style.display = 'none';
      }
      if (elements.deliveryError) {
        elements.deliveryError.style.display = 'none';
      }
      if (elements.clientCoordinates) {
        elements.clientCoordinates.value = '';
      }
    } else {
      mostrarNotificacao('Erro ao criar pedido. Tente novamente.');
    }
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    mostrarNotificacao('Erro ao criar pedido. Tente novamente.');
  }
});

// Calcular total do pedido (itens + entrega)
function calcularTotalPedido() {
  const totalItens = carrinho.reduce((sum, item) => {
    let precoProduto = item.produto.preco * item.quantidade;
    const precoAdicionais = item.adicionais.reduce((acc, adicional) => acc + adicional.preco, 0) * item.quantidade;
    return sum + precoProduto + precoAdicionais;
  }, 0);
  
  // Adicionar valor da entrega, se disponível
  // Adicionar valor da entrega, se disponível (aceita price === 0)
  if (entregaInfo && entregaInfo.price !== null && entregaInfo.price !== undefined) {
    return totalItens + entregaInfo.price;
  }
  
  return totalItens;
}

elements.newOrderBtn.addEventListener('click', () => {
  fecharModal(elements.confirmationModal);
});

// Controles do seletor de categorias
// Note: category buttons are generated dynamically by carregarCategoriasUI()

// Controles do carrossel
if (elements.prevProductBtn) {
  elements.prevProductBtn.addEventListener('click', () => {
    console.log('Botão anterior clicado');
    produtoAnterior();
  });
} else {
  console.error('Botão anterior não encontrado');
}

if (elements.nextProductBtn) {
  elements.nextProductBtn.addEventListener('click', () => {
    console.log('Botão próximo clicado');
    proximoProduto();
  });
} else {
  console.error('Botão próximo não encontrado');
}

// Controles do modal de quantidade
elements.decreaseQuantityBtn.addEventListener('click', () => {
  atualizarQuantidade(-1);
});

elements.increaseQuantityBtn.addEventListener('click', () => {
  atualizarQuantidade(1);
});

elements.addToCartConfirmBtn.addEventListener('click', () => {
  if (produtoSelecionado) {
    observacaoAtual = elements.observationInput.value.trim();
    adicionarAoCarrinho(produtoSelecionado, quantidadeSelecionada, observacaoAtual, adicionaisSelecionados);
    fecharModal(elements.quantityModal);
  }
});

// category button events are attached when carregarCategoriasUI() builds the buttons

// Fechar modais com botão X
elements.closeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const modal = button.closest('.modal');
    fecharModal(modal);
  });
});

// Fechar modais ao clicar fora
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      fecharModal(modal);
    }
  });
});

// Função para inicializar a barra de pesquisa
function inicializarBarraPesquisa() {
  // Adicionar evento de digitação no campo de pesquisa
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', debounce(pesquisarProdutos, 300));
  }
  
  // Adicionar evento de clique no botão de pesquisa
  if (elements.searchButton) {
    elements.searchButton.addEventListener('click', () => {
      pesquisarProdutos();
    });
  }
  
  // Adicionar evento de clique fora da barra de pesquisa para fechar os resultados
  document.addEventListener('click', (event) => {
    if (elements.searchInput && elements.searchButton && elements.searchResults &&
        !elements.searchInput.contains(event.target) && 
        !elements.searchButton.contains(event.target) && 
        !elements.searchResults.contains(event.target)) {
      elements.searchResults.style.display = 'none';
    }
  });
}

// Função para pesquisar produtos
function pesquisarProdutos() {
  // Verificar se os elementos existem
  if (!elements.searchInput || !elements.searchResults) {
    return;
  }
  
  const termo = elements.searchInput.value.toLowerCase().trim();
  
  // Se o termo estiver vazio, esconder os resultados
  if (termo === '') {
    elements.searchResults.style.display = 'none';
    return;
  }
  
  // Posicionar o dropdown corretamente (position: fixed)
  const inputRect = elements.searchInput.getBoundingClientRect();
  const dropdownWidth = Math.max(280, inputRect.width); // Mínimo 280px
  elements.searchResults.style.top = (inputRect.bottom + 4) + 'px';
  elements.searchResults.style.left = Math.max(8, inputRect.left) + 'px'; // Mínimo 8px da borda
  elements.searchResults.style.width = dropdownWidth + 'px';
  
  // Filtrar produtos que correspondem ao termo de pesquisa
  const resultados = produtos.filter(produto => 
    produto.nome.toLowerCase().includes(termo) || 
    (produto.descricao && produto.descricao.toLowerCase().includes(termo))
  );
  
  // Renderizar resultados
  renderizarResultadosPesquisa(resultados);
}

// Função para renderizar resultados da pesquisa
function renderizarResultadosPesquisa(resultados) {
  // Verificar se o elemento de resultados existe
  if (!elements.searchResults) {
    console.error('❌ Elemento searchResults não encontrado');
    return;
  }
  
  // Limitar a 10 resultados
  const resultadosLimitados = resultados.slice(0, 10);
  
  if (resultadosLimitados.length === 0) {
    elements.searchResults.innerHTML = '<div class="search-result-item no-results">Nenhum produto encontrado</div>';
    elements.searchResults.style.display = 'block';
    return;
  }
  
  elements.searchResults.innerHTML = resultadosLimitados.map(produto => {
    const imagemSrc = produto.imagem || '/uploads/placeholder.png';
    return `
    <div class="search-result-item" data-id="${produto.id}">
      <div class="search-result-image">
        <img src="${imagemSrc}" alt="${produto.nome}" onerror="this.src='/uploads/placeholder.png'">
      </div>
      <div class="search-result-info">
        <div class="search-result-name">${produto.nome}</div>
        <div class="search-result-price">R$ ${produto.preco.toFixed(2).replace('.', ',')}</div>
      </div>
    </div>
  `;
  }).join('');
  
  elements.searchResults.style.display = 'block';
  console.log('✅ Resultados de pesquisa renderizados:', resultadosLimitados.length);
  
  // Adicionar eventos de clique aos resultados
  document.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const produtoId = parseInt(item.dataset.id);
      const produto = produtos.find(p => p.id === produtoId);
      
      if (produto) {
        // Fechar resultados da pesquisa
        elements.searchResults.style.display = 'none';
        elements.searchInput.value = '';
        
        // Encontrar a categoria do produto (usar categorias dinâmicas quando disponíveis)
        let categoriaProduto = null;
        const prodCat = (produto.categoria || '').toString().trim();
        if (prodCat && categorias && categorias.length > 0) {
          const matchEqual = categorias.find(c => (c.nome || '').toLowerCase().trim() === prodCat.toLowerCase());
          if (matchEqual) categoriaProduto = matchEqual.nome;
          else {
            const matchContains = categorias.find(c => prodCat.toLowerCase().includes((c.nome || '').toLowerCase()));
              if (matchContains && matchContains.nome !== adicionaisCategoriaName) categoriaProduto = matchContains.nome;
          }
        }

        if (!categoriaProduto) {
          // fallback para a primeira categoria disponível ou 'lanches'
          categoriaProduto = (categorias && categorias[0] && categorias[0].nome) ? categorias[0].nome : 'lanches';
        }

        // Mudar para a categoria do produto
        mudarCategoria(categoriaProduto);

        // Encontrar o índice do produto na categoria
        const lista = produtosPorCategoria[categoriaProduto] || [];
        const indice = lista.findIndex(p => p.id === produtoId);
        if (indice !== -1) {
          indiceProdutoAtual = indice;
          atualizarCarrossel();
        }
      }
    });
  });
}

// Função debounce para limitar a frequência de chamadas
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Função para converter endereço em coordenadas e calcular entrega
async function converterEnderecoECalcularEntrega() {
  const endereco = elements.clientAddress ? elements.clientAddress.value.trim() : '';
  
  if (!endereco) {
    if (elements.deliveryError) {
      elements.deliveryError.textContent = 'Por favor, informe seu endereço para calcular o valor da entrega.';
      elements.deliveryError.style.display = 'block';
      if (elements.deliveryInfo) elements.deliveryInfo.style.display = 'none';
    }
    
    // Esconder o botão de calcular taxa
    if (elements.calcularTaxaBtn) {
      elements.calcularTaxaBtn.style.display = 'none';
    }
    
    return;
  }
  
  // Mostrar mensagem de carregamento
  if (elements.deliveryError) {
    elements.deliveryError.textContent = 'Convertendo endereço e calculando entrega...';
    elements.deliveryError.style.display = 'block';
    if (elements.deliveryInfo) elements.deliveryInfo.style.display = 'none';
  }
  
  try {
    // Converter endereço em coordenadas
    const response = await fetch('/api/entrega/calcular-taxa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ endereco })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Verificar se o endereço está fora de Imbituva
      if (data.isOutsideImbituva) {
        // Mostrar mensagem especial para endereços fora de Imbituva
        if (elements.deliveryError) {
          elements.deliveryError.innerHTML = `
            <div style="text-align: center; padding: 10px;">
              <p><strong>⚠️ não encontrado ⚠️</strong></p>
              <p>adicionando taxa minima</p>
              <p><strong>⚠️ Caso de interior envie a localização ⚠️</strong></p>
            </div>
          `;
          elements.deliveryError.style.display = 'block';
          if (elements.deliveryInfo) elements.deliveryInfo.style.display = 'none';
        }
      } else {
        // Mostrar informações da entrega normalmente
        if (elements.deliveryInfo && elements.deliveryDistance && elements.deliveryPrice) {
          elements.deliveryDistance.textContent = data.distance.toFixed(2);
          elements.deliveryPrice.textContent = data.price.toFixed(2).replace('.', ',');
          elements.deliveryInfo.style.display = 'block';
          elements.deliveryError.style.display = 'none';
        }
      }
      
      // Atualizar informações de entrega
      entregaInfo = {
        distance: data.distance,
        price: data.price,
        coordinates: data.coordinates
      };
      
      // Salvar coordenadas no elemento hidden
      if (elements.clientCoordinates) {
        elements.clientCoordinates.value = JSON.stringify(data.coordinates);
      }
      
      // Atualizar totais com o valor da entrega
      atualizarCarrinho();
      
      // Atualizar informações de entrega no objeto global
      window.entregaInfo = {
        distance: data.distance,
        price: data.price,
        coordinates: data.coordinates
      };
      
      // Esconder o botão de calcular taxa
      if (elements.calcularTaxaBtn) {
        elements.calcularTaxaBtn.style.display = 'none';
      }
    } else {
      if (elements.deliveryError) {
        elements.deliveryError.textContent = data.error || 'Erro ao calcular taxa de entrega.';
        elements.deliveryError.style.display = 'block';
        if (elements.deliveryInfo) elements.deliveryInfo.style.display = 'none';
      }
      
      // Manter o botão visível em caso de erro
      if (elements.calcularTaxaBtn) {
        elements.calcularTaxaBtn.style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Erro ao calcular taxa de entrega:', error);
    if (elements.deliveryError) {
      elements.deliveryError.textContent = 'Erro ao processar o endereço. Por favor, tente novamente.';
      elements.deliveryError.style.display = 'block';
      if (elements.deliveryInfo) elements.deliveryInfo.style.display = 'none';
    }
    
    // Manter o botão visível em caso de erro
    if (elements.calcularTaxaBtn) {
      elements.calcularTaxaBtn.style.display = 'block';
    }
  }
}

// Tratar erros de localização
function tratarErroLocalizacao(error) {
  let errorMessage = '';
  
  switch (error.code) {
    case error.PERMISSION_DENIED:
      errorMessage = 'Permissão para acessar localização negada. Por favor, habilite o acesso à localização nas configurações do seu navegador.';
      break;
    case error.POSITION_UNAVAILABLE:
      errorMessage = 'Informação de localização indisponível. Por favor, tente novamente.';
      break;
    case error.TIMEOUT:
      errorMessage = 'Tempo limite para obter localização esgotado. Por favor, tente novamente.';
      break;
    default:
      errorMessage = 'Erro desconhecido ao obter localização.';
      break;
  }
  
  if (elements.deliveryError) {
    elements.deliveryError.textContent = errorMessage;
    elements.deliveryError.style.display = 'block';
    elements.deliveryInfo.style.display = 'none';
  }
}

// Função para usar a localização do usuário
function usarLocalizacao() {
  if (navigator.geolocation) {
    // Mostrar mensagem de carregamento
    if (elements.deliveryError) {
      elements.deliveryError.textContent = 'Obtendo sua localização...';
      elements.deliveryError.style.display = 'block';
      elements.deliveryInfo.style.display = 'none';
    }
    
    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        
        // Abrir mapa de pré-visualização com a localização obtida
        if (typeof window.Mapa !== 'undefined' && typeof window.Mapa.openMapModal === 'function') {
          window.Mapa.openMapModal(latitude, longitude);
        } else {
          console.error('Função Mapa.openMapModal não encontrada');
          // Fallback: calcular entrega diretamente
          calcularEntrega(latitude, longitude);
        }
      },
      error => {
        tratarErroLocalizacao(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  } else {
    if (elements.deliveryError) {
      elements.deliveryError.textContent = 'Geolocalização não é suportada pelo seu navegador.';
      elements.deliveryError.style.display = 'block';
    }
  }
}

// Calcular valor da entrega
async function calcularEntrega(latitude, longitude) {
  try {
    const response = await fetch('/api/entrega/calcular', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ latitude, longitude })
    });
    
    const data = await response.json();
    
    if (data.success) {
      if (data.error) {
        // Fora da área de entrega
        if (elements.deliveryError) {
          elements.deliveryError.textContent = data.error;
          elements.deliveryError.style.display = 'block';
          if (elements.deliveryInfo) elements.deliveryInfo.style.display = 'none';
        }
        // Atualizar informações de entrega no objeto global mesmo quando há erro
        window.entregaInfo = {
          distance: data.distance || 0,
          price: data.price || 0,
          coordinates: { lat: latitude, lng: longitude }
        };
      } else {
        // Preencher UI com as informações da entrega calculada
        if (elements.deliveryInfo && elements.deliveryDistance && elements.deliveryPrice) {
          elements.deliveryDistance.textContent = (data.distance || 0).toFixed ? data.distance.toFixed(2) : String(data.distance || 0);
          elements.deliveryPrice.textContent = Number(data.price).toFixed(2).replace('.', ',');
          elements.deliveryInfo.style.display = 'block';
          if (elements.deliveryError) elements.deliveryError.style.display = 'none';
        }

        // Atualizar objeto de entrega usado globalmente
        entregaInfo = {
          distance: data.distance,
          price: data.price,
          coordinates: { lat: latitude, lng: longitude }
        };
        if (elements.clientCoordinates) {
          try { elements.clientCoordinates.value = JSON.stringify(entregaInfo.coordinates); } catch (e) { /* ignore */ }
        }
        window.entregaInfo = entregaInfo;
        atualizarCarrinho();
      }
    }

// Aplica os dados da sessão guardada (endereço + taxa) ao formulário e à UI
function aplicarSessaoSalva() {
  if (!sessionInfoSaved) return;
  const s = sessionInfoSaved;

  // Aplicar endereço
  if (s.endereco) {
    elements.clientAddress.value = s.endereco;
  }

  // Aplicar taxa/distância/coordenadas
  const fee = (s.deliveryFee !== undefined) ? s.deliveryFee : (s.price !== undefined ? s.price : null);
  const dist = s.distancia ?? s.distance ?? null;
  const coords = s.coordenadas ?? s.coordinates ?? null;

  if (fee !== null && fee !== undefined) {
    entregaInfo = {
      distance: dist || 0,
      price: Number(fee),
      coordinates: coords || null
    };

    if (elements.deliveryInfo && elements.deliveryDistance && elements.deliveryPrice) {
      elements.deliveryDistance.textContent = (entregaInfo.distance || 0).toFixed ? entregaInfo.distance.toFixed(2) : String(entregaInfo.distance);
      elements.deliveryPrice.textContent = Number(entregaInfo.price).toFixed(2).replace('.', ',');
      elements.deliveryInfo.style.display = 'block';
      if (elements.deliveryError) elements.deliveryError.style.display = 'none';
    }

    if (coords && elements.clientCoordinates) {
      try { elements.clientCoordinates.value = JSON.stringify(coords); } catch (e) { /* ignore */ }
    }

    window.entregaInfo = {
      distance: entregaInfo.distance,
      price: entregaInfo.price,
      coordinates: entregaInfo.coordinates
    };

    atualizarCarrinho();

    // esconder botão de calcular taxa — já temos o valor salvo
    if (elements.calcularTaxaBtn) elements.calcularTaxaBtn.style.display = 'none';
  }

  // ocultar o botão de aplicar sessão após uso
  if (elements.useLastSessionBtn) elements.useLastSessionBtn.style.display = 'none';
  sessionInfoSaved = null;
}
  } catch (error) {
    console.error('Erro ao calcular entrega:', error);
    if (elements.deliveryError) {
      elements.deliveryError.textContent = 'Erro ao calcular valor da entrega. Por favor, tente novamente.';
      elements.deliveryError.style.display = 'block';
      elements.deliveryInfo.style.display = 'none';
    }
  }
}

// Inicializar a aplicação
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM completamente carregado');
  
  // Verificar se os elementos principais existem
  if (!elements.currentProduct) {
    console.error('Elemento currentProduct não encontrado');
    return;
  }
  
  if (!elements.carouselDots) {
    console.error('Elemento carouselDots não encontrado');
    return;
  }
  
  if (!elements.prevProductBtn || !elements.nextProductBtn) {
    console.error('Botões do carrossel não encontrados');
    return;
  }
  
  console.log('Todos os elementos principais encontrados');
  console.log('WhatsApp ID já capturado:', whatsappId);
  // Aplicar sessão salva (se existir) antes de carregar produtos e UI
  await carregarSessionInfo();

  await carregarProdutos();
  
  // Selecionar categoria "Lanches" por padrão após carregar produtos
  const lanchesCategoria = Object.keys(produtosPorCategoria).find(cat => /lanches/i.test(cat));
  if (lanchesCategoria) {
    console.log('🎯 Selecionando categoria Lanches por padrão:', lanchesCategoria);
    mudarCategoria(lanchesCategoria);
  }
  
  // Carregar informações do cliente se houver WhatsApp ID
  if (whatsappId) {
    await carregarClienteInfo();
  }
  
  // Adicionar evento para o botão de usar localização
  if (elements.useLocationBtn) {
    elements.useLocationBtn.addEventListener('click', usarLocalizacao);
  }

  // Botão para aplicar a sessão salva (último endereço + taxa)
  if (elements.useLastSessionBtn) {
    elements.useLastSessionBtn.addEventListener('click', () => {
      aplicarSessaoSalva();
      mostrarNotificacao('Último endereço e taxa aplicados');
    });
  }
  
  // Delegação de eventos para o botão "Adicionar ao Carrinho"
  elements.currentProduct.addEventListener('click', (e) => {
    // Verificar se o clique foi no botão "Adicionar ao Carrinho"
    if (e.target.classList.contains('add-to-cart')) {
      e.preventDefault();
      e.stopPropagation();
      const produtoId = parseInt(e.target.dataset.id);
      produtoSelecionado = produtos.find(p => p.id === produtoId);
      if (produtoSelecionado) {
        mostrarModalQuantidade(produtoSelecionado);
      }
    }
  });
  
  // Também adicionar delegação para eventos de toque
  elements.currentProduct.addEventListener('touchend', (e) => {
    // Verificar se o toque foi no botão "Adicionar ao Carrinho"
    if (e.target.classList.contains('add-to-cart')) {
      // Prevenir o comportamento padrão para evitar conflitos
      e.preventDefault();
      e.stopPropagation();
      
      // Tratar como clique direto
      const produtoId = parseInt(e.target.dataset.id);
      produtoSelecionado = produtos.find(p => p.id === produtoId);
      if (produtoSelecionado) {
        mostrarModalQuantidade(produtoSelecionado);
      }
      
      return;
    }
  });
  
  // Adicionar eventos swipe para o carrossel - FUNCIONALIDADE TEMPORARIAMENTE DESABILITADA
  function adicionarEventosSwipe() {
    const carouselElement = elements.currentProduct;
    const bodyElement = document.body;
    
    console.log('Adicionando eventos de swipe');
    console.log('Carousel element:', carouselElement);
    console.log('Body element:', bodyElement);
    
    // Eventos para swipe para cima (abrir carrinho) - REMOVIDO
    // if (bodyElement) {
    //   bodyElement.addEventListener('touchstart', handleTouchStartCart, false);
    //   bodyElement.addEventListener('touchmove', handleTouchMoveCart, false);
    //   bodyElement.addEventListener('touchend', handleTouchEndCart, false);
    //   bodyElement.addEventListener('touchcancel', handleTouchEndCart, false);
    //   console.log('Eventos de swipe para carrinho adicionados');
    // }
    
    // Prevenir seleção de texto durante o swipe
    if (carouselElement) {
      carouselElement.addEventListener('selectstart', (e) => {
        // Permitir seleção de texto em inputs e textareas
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          return true;
        }
        e.preventDefault();
      }, false);
      console.log('Evento de prevenção de seleção adicionado');
    }
  }
  
  // Adicionar navegação por botões como alternativa
  console.log('Adicionando event listeners aos botões do carrossel');
  console.log('Prev button:', elements.prevProductBtn);
  console.log('Next button:', elements.nextProductBtn);
  
  if (elements.prevProductBtn && elements.nextProductBtn) {
    elements.prevProductBtn.addEventListener('click', produtoAnterior);
    elements.nextProductBtn.addEventListener('click', proximoProduto);
    console.log('Event listeners adicionados com sucesso');
  } else {
    console.error('Não foi possível adicionar event listeners aos botões do carrossel');
  }
  
  console.log('Aplicação inicializada com sucesso');
});

// Funções para touch do carrinho (swipe para cima) - REMOVIDO PARA FUNCIONALIDADE DE ABRIR CARRINHO

// Função para processar o gesto de swipe - REMOVIDO TEMPORARIAMENTE
function handleSwipeGesture() {
  // Funcionalidade de swipe temporariamente desativada
  console.log('Swipe functionality temporarily disabled');
  return;
}

// Atualizar estado dos botões do carrossel
function atualizarEstadoBotoes() {
  console.log('Iniciando atualização do estado dos botões do carrossel...');
  const produtosDaCategoria = produtosPorCategoria[categoriaAtual];
  
  console.log('Produtos da categoria atual:', produtosDaCategoria);
  console.log('Número de produtos:', produtosDaCategoria ? produtosDaCategoria.length : 'undefined');
  
  if (!elements.prevProductBtn || !elements.nextProductBtn) {
    console.error('Botões do carrossel não encontrados');
    return;
  }
  
  if (!produtosDaCategoria || produtosDaCategoria.length <= 1) {
    // Se houver 0 ou 1 produto, desativar ambos os botões
    console.log('Desativando botões - 0 ou 1 produto');
    elements.prevProductBtn.disabled = true;
    elements.nextProductBtn.disabled = true;
    console.log('Botão anterior desativado:', elements.prevProductBtn.disabled);
    console.log('Botão próximo desativado:', elements.nextProductBtn.disabled);
  } else {
    // Ativar ambos os botões
    console.log('Ativando botões - mais de 1 produto');
    elements.prevProductBtn.disabled = false;
    elements.nextProductBtn.disabled = false;
    console.log('Botão anterior ativado:', !elements.prevProductBtn.disabled);
    console.log('Botão próximo ativado:', !elements.nextProductBtn.disabled);
  }
}