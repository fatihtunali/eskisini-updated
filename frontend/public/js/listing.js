// frontend/public/js/listing.js - REVISED VERSION
(function () {
  'use strict';
  
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => r.querySelectorAll(s);

  // ---- Utilities ----
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);

  const money = (priceMinor, currency = 'TRY') => {
    try {
      const amount = (Number(priceMinor) || 0) / 100;
      return new Intl.NumberFormat('tr-TR', { 
        style: 'currency', 
        currency: currency 
      }).format(amount);
    } catch (e) {
      // Fallback for unsupported currencies
      const amount = ((Number(priceMinor) || 0) / 100).toLocaleString('tr-TR', { 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2 
      });
      return `${amount} ${currency}`;
    }
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  const getParams = () => {
    const u = new URL(location.href);
    return {
      slug: u.searchParams.get('slug') || '',
      id: u.searchParams.get('id') || '',
      q: u.searchParams.get('q') || '',
      cat: u.searchParams.get('cat') || ''
    };
  };

  const toLogin = () => {
    const nextUrl = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${nextUrl}`;
  };

  const showError = (message, container = null) => {
    const errorHtml = `<div class="error-message pad">${esc(message)}</div>`;
    if (container) {
      container.innerHTML = errorHtml;
    } else {
      // Show in a toast or alert
      alert(message);
    }
  };

  const showLoading = (container, message = 'Yükleniyor...') => {
    if (container) {
      container.innerHTML = `<div class="loading pad">${esc(message)}</div>`;
    }
  };

  // ---- API Helpers ----
  const apiRequest = async (path, options = {}) => {
    const url = `${API_BASE}${path}`;
    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (response.status === 401) {
      toLogin();
      return null;
    }

    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    return data;
  };

  // ---- Favorite functionality ----
  const hydrateFavButtons = async (root = document) => {
    if (window.FAV?.wireFavButtons) {
      try {
        await window.FAV.wireFavButtons(root);
      } catch (e) {
        console.warn('Failed to wire favorite buttons:', e);
      }
    }
  };

  // ---- Messaging functionality ----
  const startConversation = async (listingId) => {
    try {
      const data = await apiRequest('/api/messages/start', {
        method: 'POST',
        body: JSON.stringify({ listing_id: listingId })
      });
      
      if (!data || !data.conversation_id) {
        throw new Error('Geçersiz yanıt formatı');
      }
      
      return data.conversation_id;
    } catch (e) {
      console.error('Start conversation error:', e);
      throw new Error('Mesaj başlatılamadı: ' + e.message);
    }
  };

  const openThread = (convId) => {
    location.href = `/thread.html?id=${encodeURIComponent(convId)}`;
  };

  // ---- Image Gallery ----
  const setupImageGallery = (images, container) => {
    if (!container || !Array.isArray(images) || images.length === 0) {
      return;
    }

    let currentIndex = 0;
    
    const updateImage = (index) => {
      const img = container.querySelector('img');
      const counter = container.querySelector('.image-counter');
      
      if (img && images[index]) {
        img.src = images[index].file_url || images[index].thumb_url || '/assets/placeholder.png';
        img.alt = `Ürün resmi ${index + 1}`;
      }
      
      if (counter) {
        counter.textContent = `${index + 1} / ${images.length}`;
      }
    };

    // Add navigation if multiple images
    if (images.length > 1) {
      const navHtml = `
        <div class="image-nav">
          <button class="nav-btn prev" type="button" aria-label="Önceki resim">‹</button>
          <span class="image-counter">${currentIndex + 1} / ${images.length}</span>
          <button class="nav-btn next" type="button" aria-label="Sonraki resim">›</button>
        </div>
      `;
      container.insertAdjacentHTML('afterbegin', navHtml);

      const prevBtn = container.querySelector('.prev');
      const nextBtn = container.querySelector('.next');

      prevBtn?.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        updateImage(currentIndex);
      });

      nextBtn?.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % images.length;
        updateImage(currentIndex);
      });

      // Keyboard navigation
      container.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          prevBtn?.click();
        } else if (e.key === 'ArrowRight') {
          nextBtn?.click();
        }
      });
    }

    updateImage(currentIndex);
  };

  // ---- Main listing detail loading ----
  const loadDetail = async () => {
    const { slug } = getParams();
    const detailRoot = $('#detail');
    
    if (!slug || slug.trim().length === 0) {
      showError('Geçersiz ilan linki', detailRoot);
      return;
    }

    if (!detailRoot) {
      console.error('Detail root element not found');
      return;
    }

    showLoading(detailRoot, 'İlan yükleniyor...');

    try {
      const data = await apiRequest(`/api/listings/${encodeURIComponent(slug)}`);
      
      if (!data || !data.ok || !data.listing) {
        throw new Error('İlan bulunamadı');
      }

      const listing = data.listing;
      const images = data.images || [];

      // Update DOM elements
      updateListingDisplay(listing, images);

      // Setup interactive features
      await setupInteractiveFeatures(listing);

      // Setup image gallery
      const imageContainer = $('#imageContainer');
      if (imageContainer) {
        setupImageGallery(images, imageContainer);
      }

      // Update page metadata
      updatePageMetadata(listing);

    } catch (e) {
      console.error('Load detail error:', e);
      showError(e.message || 'İlan yüklenirken bir hata oluştu', detailRoot);
    }
  };

  // ---- Update listing display ----
  const updateListingDisplay = (listing, images) => {
    // Title
    const titleEl = $('#title');
    if (titleEl) {
      titleEl.textContent = listing.title || 'Başlıksız İlan';
    }

    // Metadata (category, location, date)
    const metaEl = $('#meta');
    if (metaEl) {
      const metaParts = [
        listing.category_name,
        listing.location_city,
        listing.created_at ? formatDate(listing.created_at) : null
      ].filter(Boolean);
      metaEl.textContent = metaParts.join(' • ');
    }

    // Price
    const priceEl = $('#price');
    if (priceEl && listing.price_minor) {
      priceEl.textContent = money(listing.price_minor, listing.currency || 'TRY');
    }

    // Description
    const descEl = $('#desc');
    if (descEl) {
      const description = listing.description_md || 'Açıklama bulunmuyor.';
      descEl.innerHTML = `<pre class="listing-description">${esc(description)}</pre>`;
    }

    // Main image
    const imgEl = $('#img');
    if (imgEl) {
      const coverImage = images[0]?.file_url || listing.cover || '/assets/placeholder.png';
      imgEl.src = coverImage;
      imgEl.alt = listing.title || 'Ürün resmi';
    }

    // Additional info
    const infoElements = {
      condition: $('#condition'),
      viewCount: $('#viewCount'),
      seller: $('#seller'),
      allowTrade: $('#allowTrade')
    };

    if (infoElements.condition) {
      const conditions = {
        'new': 'Sıfır',
        'like_new': 'Sıfır Ayarında',
        'good': 'İyi',
        'fair': 'Orta',
        'poor': 'Kötü'
      };
      infoElements.condition.textContent = conditions[listing.condition_grade] || listing.condition_grade;
    }

    if (infoElements.viewCount) {
      infoElements.viewCount.textContent = `${listing.views_count || 0} görüntülenme`;
    }

    if (infoElements.seller) {
      const sellerName = listing.seller_name || listing.seller_username || 'Anonim';
      infoElements.seller.textContent = `Satıcı: ${sellerName}`;
    }

    if (infoElements.allowTrade) {
      infoElements.allowTrade.textContent = listing.allow_trade ? 'Takas kabul ediyor' : 'Sadece satış';
    }
  };

  // ---- Setup interactive features ----
  const setupInteractiveFeatures = async (listing) => {
    const detailRoot = $('#detail');
    if (detailRoot) {
      detailRoot.setAttribute('data-listing-id', String(listing.id));
    }

    // Favorite button
    await setupFavoriteButton(listing);

    // Message button
    await setupMessageButton(listing);

    // Buy button
    setupBuyButton(listing);

    // Trade button (if enabled)
    if (listing.allow_trade) {
      setupTradeButton(listing);
    }

    // Hide action buttons if user owns the listing
    if (listing.is_own_listing) {
      hideActionButtons();
      showOwnerActions(listing);
    }
  };

  // ---- Setup favorite button ----
  const setupFavoriteButton = async (listing) => {
    const favBtn = $('#favBtn');
    const favCount = $('#favCount');
    
    if (favBtn) {
      favBtn.dataset.listingId = listing.id;
      
      // Update visual state based on favorite status
      if (listing.is_favorited) {
        favBtn.classList.add('favorited');
      } else {
        favBtn.classList.remove('favorited');
      }
    }
    
    if (favCount) {
      favCount.textContent = String(listing.favorites_count || 0);
    }
    
    // Wire up favorite functionality (from fav.js)
    await hydrateFavButtons(document);
  };

  // ---- Setup message button ----
  const setupMessageButton = async (listing) => {
    const msgBtn = $('#msgBtn');
    
    if (!msgBtn) return;

    // Remove any existing listeners
    const newMsgBtn = msgBtn.cloneNode(true);
    msgBtn.parentNode.replaceChild(newMsgBtn, msgBtn);

    newMsgBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const button = e.currentTarget;
      const originalText = button.textContent;
      
      button.disabled = true;
      button.textContent = 'Gönderiliyor...';
      
      try {
        const convId = await startConversation(listing.id);
        if (convId) {
          openThread(convId);
        }
      } catch (error) {
        console.error('Message button error:', error);
        alert(error.message || 'Mesaj gönderilemedi');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  };

  // ---- Setup buy button ----
  const setupBuyButton = (listing) => {
    const buyBtn = $('#btnBuy');
    
    if (!buyBtn) return;

    // Remove onclick attribute if exists
    buyBtn.removeAttribute('onclick');
    
    // Remove any existing listeners
    const newBuyBtn = buyBtn.cloneNode(true);
    buyBtn.parentNode.replaceChild(newBuyBtn, buyBtn);

    newBuyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // Check if user is logged in
      try {
        const authResponse = await apiRequest('/api/auth/me');
        if (!authResponse || !authResponse.user) {
          toLogin();
          return;
        }
      } catch (error) {
        toLogin();
        return;
      }

      // Redirect to buy process or trigger buy modal
      if (window.BUY && typeof window.BUY.initiatePurchase === 'function') {
        window.BUY.initiatePurchase(listing.id);
      } else {
        // Fallback - simple confirmation
        const confirmed = confirm(`${listing.title} ürününü ${money(listing.price_minor, listing.currency)} fiyatına satın almak istediğinizi onaylıyor musunuz?`);
        if (confirmed) {
          try {
            const orderData = await apiRequest('/api/orders', {
              method: 'POST',
              body: JSON.stringify({ 
                listing_id: listing.id, 
                qty: 1 
              })
            });
            
            if (orderData && orderData.ok) {
              alert('Siparişiniz oluşturuldu! Profil sayfanızdan takip edebilirsiniz.');
              location.href = '/profile.html?tab=orders';
            }
          } catch (error) {
            alert('Sipariş oluşturulurken hata: ' + error.message);
          }
        }
      }
    });
  };

  // ---- Setup trade button ----
  const setupTradeButton = (listing) => {
    const tradeBtn = $('#tradeBtn');
    
    if (!tradeBtn) return;

    tradeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // Check authentication
      try {
        const authResponse = await apiRequest('/api/auth/me');
        if (!authResponse || !authResponse.user) {
          toLogin();
          return;
        }
      } catch (error) {
        toLogin();
        return;
      }

      // Simple trade offer dialog
      const tradeText = prompt('Takas teklifinizi yazın:');
      if (!tradeText || tradeText.trim().length === 0) {
        return;
      }

      const cashAdjust = prompt('Ek nakit ödemesi (TL, opsiyonel):') || '0';
      const cashAdjustMinor = Math.floor((parseFloat(cashAdjust) || 0) * 100);

      try {
        const tradeData = await apiRequest('/api/trade/offer', {
          method: 'POST',
          body: JSON.stringify({
            listing_id: listing.id,
            offered_text: tradeText.trim(),
            cash_adjust_minor: cashAdjustMinor
          })
        });

        if (tradeData && tradeData.ok) {
          alert('Takas teklifiniz gönderildi!');
        }
      } catch (error) {
        alert('Takas teklifi gönderilemedi: ' + error.message);
      }
    });
  };

  // ---- Hide action buttons for own listings ----
  const hideActionButtons = () => {
    const buttons = ['#msgBtn', '#btnBuy', '#tradeBtn'];
    buttons.forEach(selector => {
      const btn = $(selector);
      if (btn) {
        btn.style.display = 'none';
      }
    });
  };

  // ---- Show owner actions ----
  const showOwnerActions = (listing) => {
    const actionsContainer = $('#ownerActions');
    if (!actionsContainer) return;

    actionsContainer.innerHTML = `
      <div class="owner-actions">
        <h3>İlan Yönetimi</h3>
        <div class="button-group">
          <button id="editBtn" class="btn secondary" type="button">Düzenle</button>
          <button id="deleteBtn" class="btn danger" type="button">Sil</button>
          <a href="/my-listings.html" class="btn">Tüm İlanlarım</a>
        </div>
      </div>
    `;

    // Edit button
    const editBtn = $('#editBtn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        location.href = `/sell.html?edit=${encodeURIComponent(listing.slug)}`;
      });
    }

    // Delete button
    const deleteBtn = $('#deleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = confirm('Bu ilanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.');
        if (!confirmed) return;

        try {
          await apiRequest(`/api/listings/${encodeURIComponent(listing.slug)}`, {
            method: 'DELETE'
          });
          
          alert('İlan başarıyla silindi.');
          location.href = '/my-listings.html';
        } catch (error) {
          alert('İlan silinirken hata oluştu: ' + error.message);
        }
      });
    }
  };

  // ---- Update page metadata ----
  const updatePageMetadata = (listing) => {
    // Update page title
    document.title = `${listing.title || 'İlan'} - ${money(listing.price_minor, listing.currency)} | Eskisini Ver Yenisini Al`;

    // Update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    
    const description = listing.description_md || listing.title || '';
    const truncatedDesc = description.length > 150 
      ? description.substring(0, 147) + '...' 
      : description;
    
    metaDesc.content = `${listing.title} - ${money(listing.price_minor, listing.currency)}. ${truncatedDesc}`;

    // Update canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${location.origin}/listing.html?slug=${encodeURIComponent(listing.slug)}`;
  };

  // ---- Error handling for network issues ----
  const handleNetworkError = (error) => {
    console.error('Network error:', error);
    
    if (!navigator.onLine) {
      return 'İnternet bağlantısı bulunamadı. Lütfen bağlantınızı kontrol edin.';
    }
    
    if (error.message.includes('fetch')) {
      return 'Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin.';
    }
    
    return error.message || 'Beklenmeyen bir hata oluştu.';
  };

  // ---- Initialize page ----
  const initializePage = async () => {
    // Load partials (header/footer)
    if (typeof includePartials === 'function') {
      try {
        includePartials();
      } catch (e) {
        console.warn('Failed to load partials:', e);
      }
    }

    // Get slug from URL
    const { slug } = getParams();

    if (!slug || slug.trim().length === 0) {
      console.error('No slug provided, redirecting to home');
      location.href = '/';
      return;
    }

    // Load listing detail
    await loadDetail();

    // Initialize session management
    if (window.SESSION && typeof window.SESSION.init === 'function') {
      try {
        window.SESSION.init();
      } catch (e) {
        console.warn('Session initialization failed:', e);
      }
    }
  };

  // ---- Event Listeners ----
  
  // Handle online/offline status
  window.addEventListener('online', () => {
    console.log('Connection restored');
    // Optionally reload the page or retry failed requests
  });

  window.addEventListener('offline', () => {
    console.log('Connection lost');
    // Show offline message
  });

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    const { slug } = getParams();
    if (slug) {
      loadDetail();
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
  } else {
    initializePage();
  }

  // ---- Public API ----
  
  // Expose some functions globally for potential external use
  window.LISTING = {
    loadDetail,
    money,
    formatDate,
    startConversation
  };

})();