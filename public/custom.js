// Configurações padrão
const defaultSettings = {
  restaurantName: 'Brutus Burger',
  contact: '(42) 9 99830-2047',
  primaryColor: '#27ae60',
  secondaryColor: '#f39c12',
  backgroundColor: '#121212',
  pixKey: '',
  pixName: '',
  logo: null,
  theme: 'dark',
  pickupEnabled: true
};

// Estado da aplicação
let customSettings = { ...defaultSettings };

// Elementos do DOM
const elements = {
  restaurantName: document.getElementById('restaurant-name'),
  restaurantContact: document.getElementById('restaurant-contact'),
  primaryColor: document.getElementById('primary-color'),
  primaryColorValue: document.getElementById('primary-color-value'),
  secondaryColor: document.getElementById('secondary-color'),
  secondaryColorValue: document.getElementById('secondary-color-value'),
  backgroundColor: document.getElementById('background-color'),
  backgroundColorValue: document.getElementById('background-color-value'),
  pixKey: document.getElementById('pix-key'),
  pixName: document.getElementById('pix-name'),
  logoUpload: document.getElementById('logo-upload'),
  logoPreview: document.getElementById('logo-preview'),
  restaurantHours: document.getElementById('restaurant-hours'),
  logoSize: document.getElementById('logo-size'),
  logoSizeValue: document.getElementById('logo-size-value'),
  logoZoom: document.getElementById('logo-zoom'),
  logoPosX: document.getElementById('logo-pos-x'),
  logoPosY: document.getElementById('logo-pos-y'),
  logoResetBtn: document.getElementById('logo-reset-btn'),
  themeSelector: document.getElementById('theme-selector'),
  saveSettings: document.getElementById('save-settings'),
  resetSettings: document.getElementById('reset-settings'),
  previewRestaurantName: document.getElementById('preview-restaurant-name')
};

// Carregar configurações salvas
async function loadSettings() {
  try {
    const response = await fetch('/api/custom-settings');
    if (response.ok) {
      const savedSettings = await response.json();
      customSettings = savedSettings;
    }
    
    // Preencher campos do formulário
    elements.restaurantName.value = customSettings.restaurantName;
    elements.restaurantContact.value = customSettings.contact;
    elements.primaryColor.value = customSettings.primaryColor;
    elements.primaryColorValue.value = customSettings.primaryColor;
    elements.secondaryColor.value = customSettings.secondaryColor;
    elements.secondaryColorValue.value = customSettings.secondaryColor;
    elements.backgroundColor.value = customSettings.backgroundColor;
    elements.backgroundColorValue.value = customSettings.backgroundColor;
    elements.pixKey.value = customSettings.pixKey;
    elements.pixName.value = customSettings.pixName;
    // horas
    elements.restaurantHours.value = customSettings.hours || '';
    elements.themeSelector.value = customSettings.theme;
    elements.previewRestaurantName.textContent = customSettings.restaurantName;
    const previewHoursEl = document.getElementById('preview-hours');
    if (previewHoursEl) previewHoursEl.textContent = customSettings.hours || '';
    

    // logo settings: position/scale
    if (customSettings.logo) {
      renderLogoPreview(customSettings.logo);
    }

    if (elements.logoSize) elements.logoSize.value = customSettings.logoSize || 70;
    if (elements.logoSizeValue) elements.logoSizeValue.textContent = (customSettings.logoSize || 70) + 'px';
    if (elements.logoZoom) elements.logoZoom.value = customSettings.logoScale || 1;
    if (elements.logoPosX) elements.logoPosX.value = customSettings.logoPosX || 50;
    if (elements.logoPosY) elements.logoPosY.value = customSettings.logoPosY || 50;
    
    // Configuração de Retirada no Balcão
    const pickupEnabledCheckbox = document.getElementById('pickup-enabled');
    if (pickupEnabledCheckbox) {
      // pickupEnabled: true por padrão se não estiver definido
      const isPickupEnabled = customSettings.pickupEnabled !== false;
      pickupEnabledCheckbox.checked = isPickupEnabled;
      console.log('🏪 Retirada no Balcão carregada:', isPickupEnabled, 'valor original:', customSettings.pickupEnabled);
    } else {
      console.warn('⚠️ Checkbox pickup-enabled não encontrado');
    }
    
    // Aplicar cores ao preview
    applyColorsToPreview();
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
  }
}

// Salvar configurações
async function saveSettings() {
  try {
    // Atualizar objeto de configurações
    customSettings.restaurantName = elements.restaurantName.value;
    customSettings.contact = elements.restaurantContact.value;
    customSettings.primaryColor = elements.primaryColor.value;
    customSettings.secondaryColor = elements.secondaryColor.value;
    customSettings.backgroundColor = elements.backgroundColor.value;
    customSettings.pixKey = elements.pixKey.value;
    customSettings.pixName = elements.pixName.value;
    customSettings.theme = elements.themeSelector.value;
    
    // Configuração de Retirada no Balcão
    const pickupEnabledCheckbox = document.getElementById('pickup-enabled');
    if (pickupEnabledCheckbox) {
      customSettings.pickupEnabled = pickupEnabledCheckbox.checked;
    }
    
    // Salvar no servidor
      // include logo positioning/scale before saving
      customSettings.logoSize = elements.logoSize ? parseInt(elements.logoSize.value) : (customSettings.logoSize || 70);
      customSettings.logoScale = elements.logoZoom ? parseFloat(elements.logoZoom.value) : (customSettings.logoScale || 1);
      customSettings.logoPosX = elements.logoPosX ? parseFloat(elements.logoPosX.value) : (customSettings.logoPosX || 50);
      customSettings.logoPosY = elements.logoPosY ? parseFloat(elements.logoPosY.value) : (customSettings.logoPosY || 50);

      const response = await fetch('/api/custom-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(customSettings)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Aplicar cores ao preview
      applyColorsToPreview();
      
      // Mostrar notificação de sucesso
      showNotification('Configurações salvas com sucesso!');
    } else {
      showNotification('Erro ao salvar configurações: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    showNotification('Erro ao salvar configurações!', 'error');
  }
}

// Restaurar configurações padrão
async function resetToDefault() {
  if (!confirm('Tem certeza que deseja restaurar as configurações padrão? Esta ação não pode ser desfeita.')) {
    return;
  }
  
  try {
    const response = await fetch('/api/custom-settings/reset', {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Atualizar estado local
      customSettings = { ...defaultSettings };
      
      // Recarregar configurações
      await loadSettings();
      
      showNotification('Configurações restauradas para o padrão!');
    } else {
      showNotification('Erro ao restaurar configurações: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Erro ao restaurar configurações:', error);
    showNotification('Erro ao restaurar configurações!', 'error');
  }
}

// Aplicar cores ao preview
function applyColorsToPreview() {
  // Atualizar configurações com valores atuais dos inputs
  customSettings.restaurantName = elements.restaurantName.value;
  customSettings.primaryColor = elements.primaryColor.value;
  customSettings.secondaryColor = elements.secondaryColor.value;
  customSettings.backgroundColor = elements.backgroundColor.value;
  customSettings.hours = elements.restaurantHours.value;
  
  const previewContainer = document.getElementById('preview-container');
  if (previewContainer) {
    previewContainer.style.setProperty('--preview-primary', customSettings.primaryColor);
    previewContainer.style.setProperty('--preview-secondary', customSettings.secondaryColor);
    previewContainer.style.setProperty('--preview-background', customSettings.backgroundColor);
  }
  
  // Atualizar nome do restaurante no preview
  if (elements.previewRestaurantName) {
    elements.previewRestaurantName.textContent = customSettings.restaurantName || 'Nome do Restaurante';
  }
  
  // Atualizar background do header do preview
  const previewHeader = document.querySelector('.preview-header');
  if (previewHeader) {
    previewHeader.style.background = `linear-gradient(135deg, ${customSettings.backgroundColor} 0%, rgba(30, 30, 30, 0.9) 100%)`;
  }
}

// Mostrar notificação
function showNotification(message, type = 'success') {
  // Criar elemento de notificação
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
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

// Atualizar valor da cor quando o picker muda
function setupColorPickers() {
  elements.primaryColor.addEventListener('input', () => {
    elements.primaryColorValue.value = elements.primaryColor.value;
  });
  
  elements.secondaryColor.addEventListener('input', () => {
    elements.secondaryColorValue.value = elements.secondaryColor.value;
  });
  
  elements.backgroundColor.addEventListener('input', () => {
    elements.backgroundColorValue.value = elements.backgroundColor.value;
  });
  
  // Atualizar picker quando o valor textual muda
  elements.primaryColorValue.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(elements.primaryColorValue.value)) {
      elements.primaryColor.value = elements.primaryColorValue.value;
    }
  });
  
  elements.secondaryColorValue.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(elements.secondaryColorValue.value)) {
      elements.secondaryColor.value = elements.secondaryColorValue.value;
    }
  });
  
  elements.backgroundColorValue.addEventListener('input', () => {
    if (/^#[0-9A-F]{6}$/i.test(elements.backgroundColorValue.value)) {
      elements.backgroundColor.value = elements.backgroundColorValue.value;
    }
  });
}

// Função para comprimir imagem
function compressImage(file, maxWidth = 800, maxHeight = 400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Calcular novas dimensões mantendo aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        // Criar canvas e comprimir
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Converter para base64 comprimido
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        
        console.log('📊 Tamanho original:', (event.target.result.length / 1024).toFixed(2), 'KB');
        console.log('📊 Tamanho comprimido:', (compressedBase64.length / 1024).toFixed(2), 'KB');
        
        resolve(compressedBase64);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Configurar preview da logo
function setupLogoPreview() {
  elements.logoUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Verificar se é uma imagem
        if (!file.type.startsWith('image/')) {
          showNotification('Por favor, selecione apenas arquivos de imagem!', 'error');
          return;
        }
        
        // Verificar tamanho (máximo 5MB antes da compressão)
        if (file.size > 5 * 1024 * 1024) {
          showNotification('Imagem muito grande! Tamanho máximo: 5MB', 'error');
          return;
        }
        
        // Mostrar loading
        elements.logoPreview.innerHTML = '<p style="color: #27ae60;"><i class="fas fa-spinner fa-spin"></i> Processando imagem...</p>';
        
        // Comprimir imagem
        const compressedImage = await compressImage(file);
        
        // Mostrar preview
        customSettings.logo = compressedImage;
        renderLogoPreview(compressedImage);
        
        showNotification('Logo carregada e otimizada com sucesso!');
      } catch (error) {
        console.error('Erro ao processar imagem:', error);
        showNotification('Erro ao processar imagem!', 'error');
        elements.logoPreview.innerHTML = '<p>Erro ao carregar imagem</p>';
      }
    }
  });
}

function renderLogoPreview(src) {
  // Mostrar preview simples da logo
  const imgHtml = `<img id="logo-preview-img" src="${src}" alt="Logo Preview" style="max-width:100%; max-height:150px; object-fit:contain;">`;
  elements.logoPreview.innerHTML = imgHtml;
  const img = document.getElementById('logo-preview-img');
  if (img) {
    initLogoControls(img);
  }
}

function initLogoControls(img) {
  // Controle de tamanho
  if (elements.logoSize) {
    elements.logoSize.value = customSettings.logoSize || 70;
    if (elements.logoSizeValue) elements.logoSizeValue.textContent = (customSettings.logoSize || 70) + 'px';
    elements.logoSize.addEventListener('input', () => {
      const size = parseInt(elements.logoSize.value);
      if (elements.logoSizeValue) elements.logoSizeValue.textContent = size + 'px';
      customSettings.logoSize = size;
    });
  }

  // Controle de zoom (escala)
  if (elements.logoZoom) {
    elements.logoZoom.value = customSettings.logoScale || 1;
    elements.logoZoom.addEventListener('input', () => {
      const scale = parseFloat(elements.logoZoom.value);
      customSettings.logoScale = scale;
    });
  }

  // Controles de posição (pan)
  if (elements.logoPosX) {
    elements.logoPosX.value = customSettings.logoPosX || 50;
    elements.logoPosX.addEventListener('input', () => {
      customSettings.logoPosX = parseFloat(elements.logoPosX.value);
    });
  }

  if (elements.logoPosY) {
    elements.logoPosY.value = customSettings.logoPosY || 50;
    elements.logoPosY.addEventListener('input', () => {
      customSettings.logoPosY = parseFloat(elements.logoPosY.value);
    });
  }

  // Botão de reset
  if (elements.logoResetBtn) {
    elements.logoResetBtn.addEventListener('click', () => {
      customSettings.logoPosX = 50;
      customSettings.logoPosY = 50;
      customSettings.logoScale = 1;
      customSettings.logoSize = 70;
      if (elements.logoPosX) elements.logoPosX.value = 50;
      if (elements.logoPosY) elements.logoPosY.value = 50;
      if (elements.logoZoom) elements.logoZoom.value = 1;
      if (elements.logoSize) elements.logoSize.value = 70;
      if (elements.logoSizeValue) elements.logoSizeValue.textContent = '70px';
    });
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupColorPickers();
  setupLogoPreview();
  
  // Adicionar evento para o botão de voltar
  const backToAdminBtn = document.getElementById('back-to-admin');
  if (backToAdminBtn) {
    backToAdminBtn.addEventListener('click', () => {
      window.location.href = '/admin.html';
    });
  }
});

elements.saveSettings.addEventListener('click', saveSettings);
elements.resetSettings.addEventListener('click', resetToDefault);

// Update preview hours in real time
if (elements.restaurantHours) {
  elements.restaurantHours.addEventListener('input', () => {
    const previewHoursEl = document.getElementById('preview-hours');
    if (previewHoursEl) previewHoursEl.textContent = elements.restaurantHours.value;
  });
}

// Atualizar preview em tempo real
Object.values(elements).forEach(element => {
  if (element && element.addEventListener) {
    element.addEventListener('input', applyColorsToPreview);
  }
});

// ensure logo controls reflect settings after saving
function applyLogoSettingsToHeaderPreview() {
  // if logo exists and preview image is present, apply current settings
  const img = document.getElementById('logo-preview-img');
  if (img) {
    img.style.objectPosition = `${customSettings.logoPosX || 50}% ${customSettings.logoPosY || 50}%`;
    img.style.transform = `scale(${customSettings.logoScale || 1})`;
  }
}