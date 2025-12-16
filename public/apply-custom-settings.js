// Script para aplicar configurações personalizadas na página de pedidos
(async function () {
  console.log('🎨 Iniciando aplicação de configurações customizadas...');

  try {
    // Carregar configurações customizadas
    const response = await fetch('/api/custom-settings');
    if (!response.ok) {
      console.warn('⚠️ Não foi possível carregar configurações customizadas');
      return;
    }

    const settings = await response.json();
    console.log('📋 Configurações customizadas carregadas:', settings);

    // Aplicar cores CSS
    const root = document.documentElement;

    if (settings.primaryColor) {
      root.style.setProperty('--primary-color', settings.primaryColor);
      console.log('✅ Cor primária aplicada:', settings.primaryColor);
    }

    if (settings.secondaryColor) {
      root.style.setProperty('--secondary-color', settings.secondaryColor);
      console.log('✅ Cor secundária aplicada:', settings.secondaryColor);
    }

    if (settings.backgroundColor) {
      root.style.setProperty('--bg-dark', settings.backgroundColor);
      console.log('✅ Cor de fundo aplicada:', settings.backgroundColor);
    }

    // Aplicar nome do restaurante
    if (settings.restaurantName) {
      const header = document.querySelector('.app-header h1');
      if (header) {
        header.textContent = settings.restaurantName;
        console.log('✅ Nome do restaurante aplicado:', settings.restaurantName);
      }
      // Atualizar título da página para acompanhar o nome do restaurante
      try {
        var titleBase = settings.restaurantName || document.title || 'Restaurante';
        document.title = titleBase + ' - Pedido via WhatsApp';
        console.log('✅ Título da página atualizado:', document.title);
      } catch (e) {
        console.warn('Não foi possível atualizar o título da página:', e && e.message);
      }
    }
    // Verificar se restaurante está aberto
    function isRestaurantOpen() {
      if (!settings.openTime || !settings.closeTime) return true; // Se não configurado, considerar aberto

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const [openHour, openMin] = settings.openTime.split(':').map(Number);
      const [closeHour, closeMin] = settings.closeTime.split(':').map(Number);

      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      // Se fecha depois da meia-noite
      if (closeMinutes < openMinutes) {
        return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
      }

      return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    }

    // Função para bloquear todos os botões de compra
    function bloquearBotoesCompra() {
      // Bloquear botões de adicionar ao carrinho
      document.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Restaurante fechado no momento';
      });

      // Bloquear botão "Finalizar Pedido" no carrinho
      document.querySelectorAll('.checkout-btn, .checkout-button, .finalizar-pedido, #checkout-btn, [data-action="checkout"]').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.style.backgroundColor = '#666';
        btn.title = 'Restaurante fechado no momento';
        // Mudar texto do botão
        if (btn.textContent.includes('Finalizar')) {
          btn.textContent = '🔴 FECHADO - Abrimos às ' + (settings.openTime || '18:00');
        }
      });

      // Bloquear botão de confirmar no checkout modal
      const confirmBtn = document.querySelector('.confirm-order, #confirm-order-btn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.cursor = 'not-allowed';
        confirmBtn.style.backgroundColor = '#666';
      }
    }

    // Aplicar horário de funcionamento e verificar se está aberto
    const hoursBar = document.querySelector('.hours-bar');
    if (hoursBar) {
      const isOpen = isRestaurantOpen();
      const hoursText = settings.hours || `${settings.openTime || '18:00'} às ${settings.closeTime || '23:00'}`;

      if (isOpen) {
        hoursBar.textContent = `Funcionamento: ${hoursText}`;
        hoursBar.classList.remove('closed');
        hoursBar.classList.add('open');
        console.log('✅ Restaurante ABERTO - Horário:', hoursText);
        // Armazenar estado globalmente
        window.restauranteClosed = false;
      } else {
        hoursBar.textContent = `🔴 FECHADO - Abrimos às ${settings.openTime || '18:00'}`;
        hoursBar.classList.remove('open');
        hoursBar.classList.add('closed');
        console.log('🔴 Restaurante FECHADO - Horário:', hoursText);

        // Armazenar estado globalmente
        window.restauranteClosed = true;

        // Bloquear botões imediatamente
        bloquearBotoesCompra();

        // Bloquear botões dinamicamente criados a cada segundo
        setInterval(bloquearBotoesCompra, 1000);
      }

      // Disponibilizar função globalmente para verificação em outros scripts
      window.isRestaurantOpen = isRestaurantOpen;
      window.bloquearBotoesCompra = bloquearBotoesCompra;
    }

    // Aplicar logo (se existir)
    if (settings.logo) {
      const header = document.querySelector('.app-header h1');
      if (header) {
        // Se já houver uma imagem, atualiza; caso contrário cria e insere antes do texto
        let img = header.querySelector('img');
        let text = header.textContent || '';
        if (!img) {
          img = document.createElement('img');
          header.innerHTML = '';
          header.appendChild(img);
          const nameSpan = document.createElement('span');
          nameSpan.textContent = settings.restaurantName || text || '';
          header.appendChild(nameSpan);
        }

        img.src = settings.logo;
        img.alt = settings.restaurantName || 'Logo';

        // Tamanho da logo (altura)
        const logoSize = Number(settings.logoSize) || 70;
        const scale = Number(settings.logoScale) || 1;
        const finalSize = Math.round(logoSize * scale);

        // Aplicar estilos simples da logo
        img.style.height = finalSize + 'px';
        img.style.width = 'auto';
        img.style.objectFit = 'contain';
        img.style.display = 'block';

        // Se não houver nome definido, remover texto
        const hasName = settings.restaurantName && String(settings.restaurantName).trim().length > 0;
        if (!hasName) {
          header.querySelectorAll('span').forEach(s => s.remove());
        }

        console.log('✅ Logo aplicada - Tamanho:', finalSize + 'px');
      }
    }

    // Aplicar tema (se não for dark)
    if (settings.theme && settings.theme !== 'dark') {
      document.body.classList.add('theme-' + settings.theme);
      console.log('✅ Tema aplicado:', settings.theme);
    }

    // Configurar opção de Retirada no Balcão
    if (settings.pickupEnabled !== undefined) {
      window.pickupEnabled = settings.pickupEnabled;

      // Tentar aplicar imediatamente
      const applyPickupSetting = () => {
        const pickupSection = document.getElementById('pickup-section');
        if (pickupSection) {
          pickupSection.style.display = settings.pickupEnabled ? 'block' : 'none';
          console.log('✅ Retirada no balcão:', settings.pickupEnabled ? 'Habilitada' : 'Desabilitada');
          return true;
        }
        return false;
      };

      // Se não encontrou, tentar novamente após DOMContentLoaded
      if (!applyPickupSetting()) {
        document.addEventListener('DOMContentLoaded', applyPickupSetting);
        // E também tentar após um pequeno delay
        setTimeout(applyPickupSetting, 500);
      }
    }

    // Aplicar imagem de fundo (se existir)
    if (settings.backgroundImage) {
      const applyBackgroundImage = () => {
        // Criar ou atualizar o elemento de fundo
        let bgOverlay = document.getElementById('custom-background-overlay');
        if (!bgOverlay) {
          bgOverlay = document.createElement('div');
          bgOverlay.id = 'custom-background-overlay';
          bgOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
          `;
          // Inserir como primeiro filho do body
          if (document.body.firstChild) {
            document.body.insertBefore(bgOverlay, document.body.firstChild);
          } else {
            document.body.appendChild(bgOverlay);
          }
        }

        const opacity = (settings.backgroundOpacity || 30) / 100;
        bgOverlay.style.backgroundImage = `url(${settings.backgroundImage})`;
        bgOverlay.style.backgroundSize = 'cover';
        bgOverlay.style.backgroundPosition = 'center';
        bgOverlay.style.backgroundRepeat = 'no-repeat';
        bgOverlay.style.opacity = opacity;

        // Tornar o body e containers principais transparentes para a imagem aparecer
        document.body.style.backgroundColor = 'transparent';

        const mobileContainer = document.querySelector('.mobile-container');
        if (mobileContainer) {
          mobileContainer.style.backgroundColor = 'transparent';
        }

        // Container do modo PC
        const pcContainer = document.querySelector('.pc-container');
        if (pcContainer) {
          pcContainer.style.backgroundColor = 'transparent';
        }

        const productCarousel = document.querySelector('.product-carousel');
        if (productCarousel) {
          productCarousel.style.backgroundColor = 'transparent';
        }

        const bgCard = document.querySelector('.bg-card');
        if (bgCard) {
          bgCard.style.backgroundColor = 'transparent';
        }

        // Aplicar transparência às variáveis CSS
        root.style.setProperty('--bg-dark', 'transparent');

        console.log('✅ Imagem de fundo aplicada - Opacidade:', (opacity * 100) + '%');
      };

      // Tentar aplicar imediatamente e após delay para garantir
      applyBackgroundImage();
      setTimeout(applyBackgroundImage, 500);
    }

    // Calcular cores derivadas (mais claras e mais escuras)
    if (settings.primaryColor) {
      const primaryLighter = adjustColor(settings.primaryColor, 20);
      const primaryDarker = adjustColor(settings.primaryColor, -20);
      root.style.setProperty('--primary-color-light', primaryLighter);
      root.style.setProperty('--primary-color-dark', primaryDarker);
    }

    console.log('✅ Todas as configurações customizadas foram aplicadas!');

    // Disparar evento para notificar que as configurações foram carregadas
    window.dispatchEvent(new CustomEvent('customSettingsLoaded', { detail: settings }));

    // Adicionar indicador visual (apenas em modo debug)
    if (window.location.search.includes('debug=true')) {
      const debugIndicator = document.createElement('div');
      debugIndicator.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: ${settings.primaryColor};
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.75rem;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      debugIndicator.innerHTML = '<i class="fas fa-palette"></i> Customizado';
      document.body.appendChild(debugIndicator);
    }

  } catch (error) {
    console.error('❌ Erro ao aplicar configurações customizadas:', error);
  }
})();

// Função auxiliar para ajustar cor (clarear ou escurecer)
function adjustColor(color, amount) {
  // Converter hex para RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Ajustar valores
  const newR = Math.min(255, Math.max(0, r + amount));
  const newG = Math.min(255, Math.max(0, g + amount));
  const newB = Math.min(255, Math.max(0, b + amount));

  // Converter de volta para hex
  return '#' +
    newR.toString(16).padStart(2, '0') +
    newG.toString(16).padStart(2, '0') +
    newB.toString(16).padStart(2, '0');
}
