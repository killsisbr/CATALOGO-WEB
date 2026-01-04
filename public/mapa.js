// Elementos do DOM relacionados ao mapa
const mapElements = {
  mapModal: document.getElementById('map-modal'),
  mapContainer: document.getElementById('map-container'),
  confirmLocationBtn: document.getElementById('confirm-location-btn'),
  cancelMapBtn: document.getElementById('cancel-map-btn'),
  closeButtons: document.querySelectorAll('.close-button'),
  useLocationBtn: document.getElementById('use-location-btn')
};

// Variáveis do mapa
let map;
let marker;
let userLocation;
let openRouteServiceLoaded = false;

// ============================================================
// SISTEMA DE CACHE LOCAL PARA DADOS DO CLIENTE
// ============================================================
const CLIENTE_CACHE_KEY = 'brutus_cliente_cache';
const CACHE_EXPIRY_DAYS = 30; // Cache válido por 30 dias

// Salvar dados do cliente no cache local
function salvarClienteCache(dados) {
  try {
    const cacheData = {
      ...dados,
      timestamp: Date.now(),
      expiry: Date.now() + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    };
    localStorage.setItem(CLIENTE_CACHE_KEY, JSON.stringify(cacheData));
    console.log('✅ Dados do cliente salvos no cache local:', cacheData);
    return true;
  } catch (error) {
    console.error('Erro ao salvar cache do cliente:', error);
    return false;
  }
}

// Carregar dados do cliente do cache local
function carregarClienteCache() {
  try {
    const cacheStr = localStorage.getItem(CLIENTE_CACHE_KEY);
    if (!cacheStr) return null;

    const cacheData = JSON.parse(cacheStr);

    // Verificar se o cache expirou
    if (cacheData.expiry && Date.now() > cacheData.expiry) {
      console.log('⚠️ Cache do cliente expirado, removendo...');
      localStorage.removeItem(CLIENTE_CACHE_KEY);
      return null;
    }

    console.log('✅ Dados do cliente carregados do cache local:', cacheData);
    return cacheData;
  } catch (error) {
    console.error('Erro ao carregar cache do cliente:', error);
    return null;
  }
}

// Limpar cache do cliente
function limparClienteCache() {
  try {
    localStorage.removeItem(CLIENTE_CACHE_KEY);
    console.log('🗑️ Cache do cliente limpo');
    return true;
  } catch (error) {
    console.error('Erro ao limpar cache do cliente:', error);
    return false;
  }
}

// Exportar funções de cache para uso global
window.ClienteCache = {
  salvar: salvarClienteCache,
  carregar: carregarClienteCache,
  limpar: limparClienteCache
};

// Verificar se estamos na página de pedidos
if (window.location.pathname.includes('pedido')) {
  // Adicionar eventos quando o DOM estiver pronto (ou imediatamente se já estivermos prontos)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMapEvents);
  } else {
    // DOM já carregado
    initializeMapEvents();
  }
}

// Inicializar eventos do mapa
function initializeMapEvents() {
  // Refresh DOM elements to ensure they're available (in case this script runs before DOM)
  mapElements.mapModal = document.getElementById('map-modal');
  mapElements.mapContainer = document.getElementById('map-container');
  mapElements.confirmLocationBtn = document.getElementById('confirm-location-btn');
  mapElements.cancelMapBtn = document.getElementById('cancel-map-btn');
  mapElements.closeButtons = document.querySelectorAll('.close-button');
  mapElements.useLocationBtn = document.getElementById('use-location-btn');
  // Adicionar evento ao botão de usar localização
  if (mapElements.useLocationBtn) {
    mapElements.useLocationBtn.addEventListener('click', showMapWithUserLocation);
  }

  // Adicionar evento ao botão de confirmar localização
  if (mapElements.confirmLocationBtn) {
    mapElements.confirmLocationBtn.addEventListener('click', confirmLocation);
  }

  // Adicionar evento ao botão de cancelar
  if (mapElements.cancelMapBtn) {
    mapElements.cancelMapBtn.addEventListener('click', closeMapModal);
  }

  // Adicionar evento aos botões de fechar
  if (mapElements.closeButtons) {
    mapElements.closeButtons.forEach(button => {
      button.addEventListener('click', closeMapModal);
    });
  }

  // Fechar modal ao clicar fora
  if (mapElements.mapModal) {
    mapElements.mapModal.addEventListener('click', (e) => {
      if (e.target === mapElements.mapModal) {
        closeMapModal();
      }
    });
  }
}

// Mostrar mapa com a localização do usuário
function showMapWithUserLocation() {
  if (navigator.geolocation) {
    // Mostrar mensagem de carregamento
    showDeliveryLoading();

    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        userLocation = { lat: latitude, lng: longitude };

        // Abrir modal do mapa para o cliente ajustar a localização
        openMapModal(latitude, longitude);
      },
      error => {
        handleLocationError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  } else {
    showDeliveryError('Geolocalização não é suportada pelo seu navegador.');
  }
}

// Abrir modal do mapa
function openMapModal(lat, lng) {
  // Carregar a API do OpenRouteService se ainda não estiver carregada
  if (!openRouteServiceLoaded) {
    loadOpenRouteServiceAPI(() => {
      openRouteServiceLoaded = true;
      initMap(lat, lng);
      showMapModal();
    });
  } else {
    initMap(lat, lng);
    showMapModal();
  }
}

// Carregar API do OpenRouteService
function loadOpenRouteServiceAPI(callback) {
  // Verificar se já está carregada
  if (typeof L !== 'undefined' && L.map) {
    callback();
    return;
  }

  // Verificar se o script já foi adicionado
  if (document.querySelector('script[src*="leaflet"]')) {
    // Aguardar o carregamento
    const checkInterval = setInterval(() => {
      if (typeof L !== 'undefined' && L.map) {
        clearInterval(checkInterval);
        callback();
      }
    }, 100);
    return;
  }

  // Carregar Leaflet CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);

  // Carregar Leaflet JS
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.async = true;
  script.defer = true;

  script.onload = function () {
    callback();
  };

  script.onerror = function () {
    showDeliveryError('Erro ao carregar a API do mapa. Verifique sua conexão.');
  };

  document.head.appendChild(script);
}

// Inicializar o mapa
function initMap(lat, lng) {
  // Verificar se o contêiner do mapa existe
  if (!mapElements.mapContainer) {
    console.error('Contêiner do mapa não encontrado');
    return;
  }

  const location = [lat, lng];

  // Criar mapa com OpenStreetMap
  if (map) {
    map.remove();
  }

  map = L.map(mapElements.mapContainer).setView(location, 16);

  // Adicionar camada do OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Criar marcador draggable
  if (marker) {
    map.removeLayer(marker);
  }

  marker = L.marker(location, { draggable: true }).addTo(map);
  marker.bindPopup('Arraste para ajustar a localização').openPopup();

  // Adicionar evento para quando o marcador for arrastado
  marker.on('dragend', function () {
    const position = marker.getLatLng();
    userLocation = { lat: position.lat, lng: position.lng };
  });

  // Adicionar evento para quando o mapa for clicado
  map.on('click', function (event) {
    marker.setLatLng(event.latlng);
    userLocation = { lat: event.latlng.lat, lng: event.latlng.lng };
  });
}

// Mostrar modal do mapa
function showMapModal() {
  if (mapElements.mapModal) {
    mapElements.mapModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

// Fechar modal do mapa
function closeMapModal() {
  if (mapElements.mapModal) {
    mapElements.mapModal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

// Confirmar localização selecionada
async function confirmLocation() {
  if (userLocation) {
    // Fechar modal do mapa
    closeMapModal();

    // Mostrar loading
    showDeliveryLoading();

    // Calcular entrega e obter endereço
    await calculateDeliveryForConfirmation(userLocation.lat, userLocation.lng);

    // Se por algum motivo o cálculo/endpoint não abrir o modal de confirmação,
    // usar um fallback: abrir o modal de confirmação com dados mínimos para
    // permitir que o usuário edite o endereço (ex.: quando o servidor falha).
    const addressModal = document.getElementById('address-confirm-modal');
    if (addressModal && !addressModal.classList.contains('show')) {
      // tentar obter info calculada previamente
      const info = window.entregaInfo || {};
      const lat = userLocation.lat;
      const lng = userLocation.lng;
      const distance = typeof info.distance !== 'undefined' ? info.distance : 0;
      const price = typeof info.price !== 'undefined' ? info.price : 0;
      // abrir modal de confirmação com dados básicos (o usuário pode editar)
      showAddressConfirmModal(info.endereco || '', distance, price, lat, lng);
    }
  }
}

// Mostrar estado de carregamento (reutilizando função existente)
function showDeliveryLoading() {
  const deliveryError = document.getElementById('delivery-error');
  const deliveryInfo = document.getElementById('delivery-info');

  if (deliveryError) {
    deliveryError.textContent = 'Obtendo sua localização...';
    deliveryError.style.display = 'block';
    if (deliveryInfo) {
      deliveryInfo.style.display = 'none';
    }
  }
}

// Mostrar erro na entrega (reutilizando função existente)
function showDeliveryError(message) {
  const deliveryError = document.getElementById('delivery-error');
  const deliveryInfo = document.getElementById('delivery-info');

  if (deliveryError) {
    // Se a mensagem for HTML, inserir como HTML, caso contrário como texto
    if (message.includes('<') && message.includes('>')) {
      deliveryError.innerHTML = message;
    } else {
      deliveryError.textContent = message;
    }
    deliveryError.style.display = 'block';
    if (deliveryInfo) {
      deliveryInfo.style.display = 'none';
    }
  }
}

// Calcular entrega e abrir modal de confirmação
async function calculateDeliveryForConfirmation(latitude, longitude) {
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
        // Fora da área de entrega ou erro específico
        showDeliveryError(data.error);

        // Atualizar informações de entrega no objeto global mesmo quando há erro
        if (typeof window !== 'undefined') {
          window.entregaInfo = {
            distance: data.distance || 0,
            price: data.price || 0,
            coordinates: { lat: latitude, lng: longitude }
          };
        }
      } else {
        // Entrega válida - Abrir modal de confirmação de endereço
        showAddressConfirmModal(data.endereco || '', data.distance, data.price, latitude, longitude);
      }
    } else {
      showDeliveryError(data.error || 'Erro ao calcular entrega.');
    }
  } catch (error) {
    console.error('Erro ao calcular entrega:', error);
    showDeliveryError('Erro ao calcular valor da entrega. Por favor, tente novamente.');
  }
}

// Calcular valor da entrega (reutilizando função existente)
async function calculateDelivery(latitude, longitude) {
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
        // Fora da área de entrega ou erro específico
        showDeliveryError(data.error);

        // Atualizar informações de entrega no objeto global mesmo quando há erro
        // Isso é importante para que o sistema reconheça que a entrega foi calculada
        if (typeof window !== 'undefined') {
          window.entregaInfo = {
            distance: data.distance || 0,
            price: data.price || 0,
            coordinates: { lat: latitude, lng: longitude }
          };
        }
      } else {
        // Entrega válida
        showDeliveryInfo(data.distance, data.price);

        // Preencher o campo de endereço com o endereço convertido, se disponível
        const clientAddress = document.getElementById('client-address');
        if (data.endereco && clientAddress) {
          clientAddress.value = data.endereco;
        }

        // Salvar coordenadas no elemento hidden para envio com o pedido
        const coordsInput = document.getElementById('client-coordinates');
        if (coordsInput) {
          coordsInput.value = JSON.stringify({ lat: latitude, lng: longitude });
        }

        // Atualizar informações de entrega no objeto global
        if (typeof window !== 'undefined') {
          window.entregaInfo = {
            distance: data.distance,
            price: data.price,
            coordinates: { lat: latitude, lng: longitude }
          };
        }
      }
    } else {
      showDeliveryError(data.error || 'Erro ao calcular entrega.');
    }
  } catch (error) {
    console.error('Erro ao calcular entrega:', error);
    showDeliveryError('Erro ao calcular valor da entrega. Por favor, tente novamente.');
  }
}

// Mostrar informações da entrega (reutilizando função existente)
function showDeliveryInfo(distance, price) {
  const deliveryInfo = document.getElementById('delivery-info');
  const deliveryDistance = document.getElementById('delivery-distance');
  const deliveryPrice = document.getElementById('delivery-price');
  const deliveryError = document.getElementById('delivery-error');

  if (deliveryInfo && deliveryDistance && deliveryPrice) {
    deliveryDistance.textContent = distance.toFixed(2);
    deliveryPrice.textContent = price.toFixed(2).replace('.', ',');
    deliveryInfo.style.display = 'block';
    if (deliveryError) {
      deliveryError.style.display = 'none';
    }

    // Atualizar total do pedido
    updateOrderTotalWithDelivery(price);

    // Atualizar informações de entrega no objeto global
    if (typeof window !== 'undefined') {
      window.entregaInfo = {
        distance: distance,
        price: price,
        coordinates: userLocation || { lat: 0, lng: 0 }
      };
    }
    // Mostrar observações do local caso já preenchidas
    const deliveryNotePreview = document.getElementById('delivery-note-preview');
    const deliveryNoteText = document.getElementById('delivery-note-text');
    if (deliveryNotePreview && deliveryNoteText) {
      const note = (window.entregaInfo && (window.entregaInfo.addressNote || window.entregaInfo.observacao)) || '';
      if (note && note.trim().length > 0) {
        deliveryNoteText.textContent = note.trim();
        deliveryNotePreview.style.display = 'block';
      } else {
        deliveryNoteText.textContent = '';
        deliveryNotePreview.style.display = 'none';
      }
    }
  }
}

// Atualizar total do pedido com o valor da entrega (reutilizando função existente)
function updateOrderTotalWithDelivery(deliveryPrice) {
  const orderTotalElement = document.getElementById('order-total');
  const cartTotalElement = document.getElementById('cart-total');

  if (orderTotalElement) {
    // Extrair valor atual
    const currentTotalText = orderTotalElement.textContent.replace('R$ ', '').replace(',', '.');
    const currentTotal = parseFloat(currentTotalText) || 0;

    // Calcular novo total
    const newTotal = currentTotal + deliveryPrice;

    // Atualizar exibição
    orderTotalElement.textContent = `R$ ${newTotal.toFixed(2).replace('.', ',')}`;
  }

  if (cartTotalElement) {
    // Extrair valor atual
    const currentTotalText = cartTotalElement.textContent.replace('R$ ', '').replace(',', '.');
    const currentTotal = parseFloat(currentTotalText) || 0;

    // Calcular novo total
    const newTotal = currentTotal + deliveryPrice;

    // Atualizar exibição
    cartTotalElement.textContent = `R$ ${newTotal.toFixed(2).replace('.', ',')}`;
  }
}

// Tratar erros de localização (reutilizando função existente)
function handleLocationError(error) {
  let errorMessage = '';

  switch (error.code) {
    case error.PERMISSION_DENIED:
      // Permissão negada - abrir modal de entrada manual de endereço
      errorMessage = 'Permissão para acessar localização negada.';
      showDeliveryError(errorMessage);
      // Abrir modal de entrada manual de endereço
      openManualAddressModal();
      return; // Sair da função para não mostrar mais mensagens
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

  showDeliveryError(errorMessage);
}

// Mostrar modal de confirmação de endereço
function showAddressConfirmModal(endereco, distance, price, latitude, longitude) {
  const modal = document.getElementById('address-confirm-modal');
  const addressInput = document.getElementById('address-confirm-input');
  const modalDistance = document.getElementById('modal-distance');
  const modalPrice = document.getElementById('modal-delivery-price');

  if (!modal || !addressInput) {
    console.error('Modal de confirmação de endereço não encontrado');
    return;
  }

  // Preencher dados no modal
  addressInput.value = endereco;
  const addressNotes = document.getElementById('address-notes');
  if (addressNotes) {
    // Prefill from global entregaInfo if present
    const savedNotes = (window.entregaInfo && (window.entregaInfo.addressNote || window.entregaInfo.observacao)) || '';
    addressNotes.value = savedNotes;
  }
  if (modalDistance) modalDistance.textContent = distance.toFixed(2);
  if (modalPrice) modalPrice.textContent = price.toFixed(2).replace('.', ',');

  // Guardar dados temporariamente
  modal.dataset.latitude = latitude;
  modal.dataset.longitude = longitude;
  modal.dataset.distance = distance;
  modal.dataset.price = price;

  // Mostrar modal
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // Adicionar eventos aos botões (remover listeners antigos primeiro)
  const confirmBtn = document.getElementById('confirm-address-btn');
  const cancelBtn = document.getElementById('cancel-address-btn');
  const closeBtn = modal.querySelector('.close-address-modal');

  if (confirmBtn) {
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', confirmAddressFromModal);
  }

  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', closeAddressConfirmModal);
  }

  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeAddressConfirmModal);
  }
}

// Fechar modal de confirmação de endereço
function closeAddressConfirmModal() {
  const modal = document.getElementById('address-confirm-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

// Confirmar endereço do modal
function confirmAddressFromModal() {
  const modal = document.getElementById('address-confirm-modal');
  const addressInput = document.getElementById('address-confirm-input');

  if (!modal || !addressInput) return;

  const endereco = addressInput.value.trim();
  const latitude = parseFloat(modal.dataset.latitude);
  const longitude = parseFloat(modal.dataset.longitude);
  const distance = parseFloat(modal.dataset.distance);
  const price = parseFloat(modal.dataset.price);

  if (!endereco) {
    alert('Por favor, informe um endereço válido.');
    return;
  }

  // Preencher o campo de endereço principal (hidden input) e o preview
  const clientAddressHidden = document.getElementById('client-address');
  const clientAddressPreview = document.getElementById('client-address-preview');
  if (clientAddressHidden) {
    clientAddressHidden.value = endereco;
  }
  if (clientAddressPreview) {
    clientAddressPreview.textContent = endereco;
    clientAddressPreview.classList.add('filled');
  }

  // Salvar coordenadas no elemento hidden
  const coordsInput = document.getElementById('client-coordinates');
  if (coordsInput) {
    coordsInput.value = JSON.stringify({ lat: latitude, lng: longitude });
  }

  // Atualizar informações de entrega
  showDeliveryInfo(distance, price);

  // Atualizar informações de entrega no objeto global
  if (typeof window !== 'undefined') {
    window.entregaInfo = {
      distance: distance,
      price: price,
      coordinates: { lat: latitude, lng: longitude }
    };
  }
  // Capturar observações adicionais de endereço, se houver
  const addressNotes = document.getElementById('address-notes');
  if (addressNotes && addressNotes.value && typeof window !== 'undefined') {
    window.entregaInfo.addressNote = addressNotes.value.trim();
  } else if (typeof window !== 'undefined') {
    window.entregaInfo.addressNote = window.entregaInfo.addressNote || null;
  }

  // Atualizar preview de observação (pequena linha no modal / seção de entrega)
  const deliveryNotePreview = document.getElementById('delivery-note-preview');
  const deliveryNoteText = document.getElementById('delivery-note-text');
  const deliveryNoteMain = document.getElementById('delivery-note-main');
  const deliveryNoteMainContainer = document.getElementById('delivery-note');
  if (deliveryNotePreview && deliveryNoteText) {
    if (window.entregaInfo.addressNote && window.entregaInfo.addressNote.trim()) {
      deliveryNoteText.textContent = window.entregaInfo.addressNote.trim();
      deliveryNotePreview.style.display = 'block';
    } else {
      deliveryNoteText.textContent = '';
      deliveryNotePreview.style.display = 'none';
    }
  }
  if (deliveryNoteMain && deliveryNoteMainContainer) {
    if (window.entregaInfo.addressNote && window.entregaInfo.addressNote.trim()) {
      deliveryNoteMain.textContent = window.entregaInfo.addressNote.trim();
      deliveryNoteMainContainer.style.display = 'block';
    } else {
      deliveryNoteMain.textContent = '';
      deliveryNoteMainContainer.style.display = 'none';
    }
  }
  // (already handled earlier) ensure addressNote property exists
  if (typeof window !== 'undefined') {
    window.entregaInfo.addressNote = window.entregaInfo.addressNote || null;
  }

  // ============================================================
  // SALVAR DADOS NO CACHE LOCAL
  // ============================================================
  const clientNameInput = document.getElementById('client-name');
  const clienteNome = clientNameInput ? clientNameInput.value.trim() : '';

  salvarClienteCache({
    nome: clienteNome,
    endereco: endereco,
    coordinates: { lat: latitude, lng: longitude },
    distance: distance,
    price: price,
    addressNote: window.entregaInfo.addressNote || ''
  });

  console.log('✅ Endereço confirmado e salvo no cache local');

  // Fechar modal
  closeAddressConfirmModal();
}

// Exportar funções para uso global
window.Mapa = {
  showMapWithUserLocation,
  openMapModal,
  closeMapModal,
  openManualAddressModal
};

// ============================================================
// MODAL DE ENDEREÇO MANUAL (quando geolocalização negada)
// ============================================================

// Abrir modal de endereço manual
function openManualAddressModal() {
  const modal = document.getElementById('manual-address-modal');
  if (!modal) {
    console.error('Modal de endereço manual não encontrado');
    return;
  }

  // Mostrar modal
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // Focar no primeiro campo
  const streetInput = document.getElementById('manual-street');
  if (streetInput) {
    setTimeout(() => streetInput.focus(), 100);
  }

  // Adicionar eventos aos botões (remover listeners antigos primeiro)
  setupManualAddressEvents();
}

// Fechar modal de endereço manual
function closeManualAddressModal() {
  const modal = document.getElementById('manual-address-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

// Configurar eventos do modal de endereço manual
function setupManualAddressEvents() {
  const modal = document.getElementById('manual-address-modal');
  if (!modal) return;

  const confirmBtn = document.getElementById('confirm-manual-address-btn');
  const cancelBtn = document.getElementById('cancel-manual-address-btn');
  const closeBtn = modal.querySelector('.close-manual-address-modal');

  // Remover listeners antigos e adicionar novos
  if (confirmBtn) {
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', processManualAddress);
  }

  if (cancelBtn) {
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', closeManualAddressModal);
  }

  if (closeBtn) {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn.addEventListener('click', closeManualAddressModal);
  }

  // Fechar ao clicar fora
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeManualAddressModal();
    }
  });
}

// Processar endereço manual
async function processManualAddress() {
  const street = document.getElementById('manual-street')?.value?.trim() || '';
  const number = document.getElementById('manual-number')?.value?.trim() || '';
  const neighborhood = document.getElementById('manual-neighborhood')?.value?.trim() || '';
  const notes = document.getElementById('manual-notes')?.value?.trim() || '';

  // Validar campos obrigatórios
  if (!street) {
    alert('Por favor, informe a rua/avenida.');
    document.getElementById('manual-street')?.focus();
    return;
  }

  if (!number) {
    alert('Por favor, informe o número.');
    document.getElementById('manual-number')?.focus();
    return;
  }

  // Montar endereço completo
  let endereco = `${street}, ${number}`;
  if (neighborhood) {
    endereco += `, ${neighborhood}`;
  }
  endereco += ', Imbituva, PR, Brazil';

  // Fechar modal de entrada manual
  closeManualAddressModal();

  // Mostrar loading
  showDeliveryLoading();

  try {
    // Calcular taxa de entrega usando o endereço digitado
    const response = await fetch('/api/entrega/calcular-taxa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ endereco })
    });

    const data = await response.json();

    if (data.success) {
      // Mostrar modal de confirmação de endereço com os dados
      const lat = data.coordinates?.lat || 0;
      const lng = data.coordinates?.lng || 0;

      // Guardar coordenadas
      userLocation = { lat, lng };

      // Preencher dados de entrega
      window.entregaInfo = {
        distance: data.distance,
        price: data.price,
        coordinates: { lat, lng },
        addressNote: notes
      };

      // Usar o endereço digitado pelo cliente (não o genérico da geocodificação)
      // O endereço já foi montado com rua, número e bairro
      const enderecoFinal = endereco;

      // Abrir modal de confirmação de endereço
      showAddressConfirmModal(enderecoFinal, data.distance, data.price, lat, lng);

      // Preencher observações no modal
      const addressNotes = document.getElementById('address-notes');
      if (addressNotes && notes) {
        addressNotes.value = notes;
      }

    } else {
      showDeliveryError(data.error || 'Não foi possível calcular a entrega para esse endereço. Verifique o endereço e tente novamente.');
    }
  } catch (error) {
    console.error('Erro ao processar endereço manual:', error);
    showDeliveryError('Erro ao processar o endereço. Por favor, tente novamente.');
  }
}

// Exportar funções de endereço manual para uso global
window.ManualAddress = {
  open: openManualAddressModal,
  close: closeManualAddressModal,
  process: processManualAddress
};