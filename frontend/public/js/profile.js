// public/js/profile.js - İyileştirilmiş Versiyon
(function(){
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);

  // --- Cache sistemi (5 dakika)
  const ProfileCache = {
    data: new Map(),
    set(key, value, ttl = 300000) {
      this.data.set(key, {
        value,
        expires: Date.now() + ttl
      });
    },
    get(key) {
      const item = this.data.get(key);
      if (!item) return null;
      if (Date.now() > item.expires) {
        this.data.delete(key);
        return null;
      }
      return item.value;
    },
    clear() {
      this.data.clear();
    }
  };

  // --- helpers
  const esc = (s)=> (s??'').toString().replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
  const toTL = (minor, cur='TRY') => {
    const v = (Number(minor)||0) / 100;
    try { return v.toLocaleString('tr-TR',{style:'currency',currency:cur||'TRY'}); }
    catch { return `${v.toLocaleString('tr-TR')} ${esc(cur||'TRY')}`; }
  };
  const noStoreHeaders = { 'Accept':'application/json', 'Cache-Control':'no-cache' };

  // --- Loading & Error states
  function showLoading(root, message = 'Yükleniyor...') {
    if (!root) return;
    root.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <span class="muted">${message}</span>
      </div>
    `;
  }

  function showError(root, message, retryCallback = null) {
    if (!root) return;
    root.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <p>${message}</p>
        ${retryCallback ? '<button class="btn" id="retryBtn">Tekrar Dene</button>' : ''}
      </div>
    `;
    
    if (retryCallback) {
      const retryBtn = root.querySelector('#retryBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', retryCallback);
      }
    }
  }

  // --- Form validation
  function validatePhone(phone) {
    if (!phone) return { valid: true, message: '' };
    const cleaned = phone.replace(/[\s\-()]/g, '');
    const isValid = /^\+90[0-9]{10}$/.test(cleaned);
    return {
      valid: isValid,
      message: isValid ? '' : 'Geçerli TR telefon numarası: +905551234567'
    };
  }

  function showFieldError(field, message) {
    let errorEl = field.parentNode.querySelector('.field-error');
    if (message) {
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'field-error';
        field.parentNode.appendChild(errorEl);
      }
      errorEl.textContent = message;
      field.classList.add('error');
    } else {
      if (errorEl) errorEl.remove();
      field.classList.remove('error');
    }
  }

  // --- Navigation & URL handling
  function getTab(){
    const u = new URL(location.href);
    const qTab = u.searchParams.get('tab');
    if (qTab) return qTab;
    const h = (u.hash || '').replace('#','').trim();
    if (['orders','edit','mylistings','overview'].includes(h)) return h || 'overview';
    return 'overview';
  }

  function setActive(tab){
    document.querySelectorAll('#tabs a').forEach(a => {
      const isActive = a?.dataset?.tab === tab;
      a.classList.toggle('active', isActive);
      a.setAttribute('aria-selected', isActive);
      a.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function updateTabURL(tab) {
    const url = new URL(location.href);
    if (tab === 'overview') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    history.pushState({ tab }, '', url.toString());
  }

  function redirectToLogin(){
    const u = new URL('/login.html', location.origin);
    u.searchParams.set('redirect', location.pathname + location.search + location.hash);
    location.href = u.toString();
  }

  // --- API calls with caching
  async function fetchJSON(url, opts = {}){
    const r = await fetch(url, {
      credentials:'include',
      cache: 'no-store',
      headers: noStoreHeaders,
      ...opts
    });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }

  async function fetchUserProfile(forceRefresh = false) {
    const cacheKey = 'user-profile';
    if (!forceRefresh) {
      const cached = ProfileCache.get(cacheKey);
      if (cached) return cached;
    }
    
    const data = await fetchJSON(`${API_BASE}/api/auth/me?_ts=${Date.now()}`);
    const user = data.user || data;
    ProfileCache.set(cacheKey, user);
    return user;
  }

  async function requireLogin(){
    try{
      return await fetchUserProfile();
    }catch{
      redirectToLogin();
      throw new Error('not-authenticated');
    }
  }

  // ---- cancel API
  async function cancelOrder(id){
    try {
      const data = await (window.API && window.API.orders
        ? window.API.orders.cancel(id)
        : (async () => {
            const url = new URL(`${API_BASE}/api/orders/${id}/cancel`);
            url.searchParams.set('_ts', Date.now());
            const r = await fetch(url, {
              method: 'POST',
              credentials: 'include',
              cache: 'no-store',
              headers: { 'Accept':'application/json', 'Cache-Control':'no-cache' }
            });
            let d = {};
            try { d = await r.json(); } catch {}
            if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP_${r.status}`);
            return d;
          })()
      );
      return data;
    } catch (e) {
      throw e;
    }
  }

  // ---- OVERVIEW (İlan Ver butonu kaldırıldı)
  async function renderOverview(root){
    if (!root) return;
    showLoading(root, 'Profil bilgileri yükleniyor...');
    
    try{
      const u = await fetchUserProfile();

      root.innerHTML = `
        <div class="profile-grid">
          <div class="card">
            <div class="card-header">
              <h3>Profil Özeti</h3>
              <div class="muted small">Hesap bilgileriniz</div>
            </div>
            <div class="card-body">
              <div class="profile-info">
                <div class="info-item">
                  <label>Ad Soyad</label>
                  <span>${esc(u.full_name || 'Belirtilmemiş')}</span>
                </div>
                <div class="info-item">
                  <label>E-posta</label>
                  <span>${esc(u.email || '-')}</span>
                </div>
                <div class="info-item">
                  <label>Telefon</label>
                  <span>${esc(u.phone_e164 || 'Belirtilmemiş')}</span>
                </div>
                <div class="info-item">
                  <label>KYC Durumu</label>
                  <span class="kyc-badge kyc-${u.kyc_status || 'none'}">${esc(u.kyc_status || 'Doğrulanmamış')}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h3>Hızlı İşlemler</h3>
            </div>
            <div class="card-body">
              <div class="quick-actions">
                <a class="btn block ghost" href="?tab=edit">
                  <span class="icon">✏️</span>
                  Profili Düzenle
                </a>
                <a class="btn block ghost" href="?tab=mylistings">
                  <span class="icon">📋</span>
                  İlanlarım
                </a>
                <a class="btn block" href="/favorites.html">
                  <span class="icon">❤️</span>
                  Favorilerim
                </a>
                <a class="btn block" href="/messages.html">
                  <span class="icon">💬</span>
                  Mesajlarım
                </a>
                <a class="btn block ghost" href="?tab=orders">
                  <span class="icon">🛒</span>
                  Siparişlerim
                </a>
              </div>
            </div>
          </div>
        </div>
      `;
    }catch(e){
      showError(root, 'Profil bilgileri alınamadı.', () => renderOverview(root));
    }
  }

  // ---- EDIT (Geliştirilmiş validasyon)
  async function renderEdit(root){
    if (!root) return;
    showLoading(root, 'Form hazırlanıyor...');

    root.innerHTML = `
      <form id="pf" class="card form-card" novalidate>
        <div class="card-header">
          <h3>Profil Düzenle</h3>
        </div>
        <div class="card-body">
          <label class="field">
            <span>Ad Soyad <span class="required">*</span></span>
            <input name="full_name" type="text" required autocomplete="name">
          </label>
          <label class="field">
            <span>Telefon (Türkiye)</span>
            <input name="phone_e164" type="tel" placeholder="+905551234567" autocomplete="tel">
          </label>
          <div class="form-actions">
            <button id="btnSave" class="btn primary" type="submit">Kaydet</button>
            <span id="msg" class="status-message"></span>
          </div>
        </div>
      </form>
    `;

    try{
      const u = await fetchUserProfile();
      const form = $('#pf');
      form.querySelector('[name="full_name"]').value = u.full_name || '';
      form.querySelector('[name="phone_e164"]').value = u.phone_e164 || '';

      // Real-time validation
      const phoneField = form.querySelector('[name="phone_e164"]');
      phoneField.addEventListener('input', (e) => {
        const validation = validatePhone(e.target.value);
        showFieldError(e.target, validation.message);
      });

      // Form submit
      let busy = false;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        
        const btn = $('#btnSave');
        const msg = $('#msg');
        const fullNameField = form.querySelector('[name="full_name"]');
        const phoneField = form.querySelector('[name="phone_e164"]');
        
        // Validation
        const fullName = fullNameField.value.trim();
        const phone = phoneField.value.trim();
        
        let hasErrors = false;
        
        if (!fullName) {
          showFieldError(fullNameField, 'Ad Soyad gereklidir');
          hasErrors = true;
        } else {
          showFieldError(fullNameField, '');
        }
        
        const phoneValidation = validatePhone(phone);
        if (!phoneValidation.valid) {
          showFieldError(phoneField, phoneValidation.message);
          hasErrors = true;
        } else {
          showFieldError(phoneField, '');
        }
        
        if (hasErrors) return;
        
        // Submit
        busy = true;
        btn.disabled = true;
        msg.textContent = 'Kaydediliyor...';
        msg.className = 'status-message loading';

        try{
          await (window.API && window.API.users
            ? window.API.users.updateProfile({ 
                full_name: fullName, 
                phone_e164: phone || null 
              })
            : (async () => {
                const r = await fetch(`${API_BASE}/api/users/profile?_ts=${Date.now()}`, {
                  method:'POST',
                  credentials:'include',
                  cache:'no-store',
                  headers:{'Content-Type':'application/json', ...noStoreHeaders},
                  body: JSON.stringify({ 
                    full_name: fullName, 
                    phone_e164: phone || null 
                  })
                });
                const data = await r.json().catch(()=>({}));
                if (!r.ok || data.ok===false) throw new Error(data.message||'Kaydedilemedi');
                return data;
              })()
          );

          msg.textContent = 'Başarıyla kaydedildi ✓';
          msg.className = 'status-message success';
          
          // Cache'i temizle
          ProfileCache.clear();
          
          // Auth event trigger
          document.dispatchEvent(new Event('auth:login'));
          
          // 3 saniye sonra mesajı temizle
          setTimeout(() => {
            msg.textContent = '';
            msg.className = 'status-message';
          }, 3000);
          
        }catch(e){
          msg.textContent = 'Kaydetme başarısız: ' + (e.message || 'Bilinmeyen hata');
          msg.className = 'status-message error';
        } finally {
          btn.disabled = false;
          busy = false;
        }
      });

    }catch(e){
      showError(root, 'Form hazırlanamadı.', () => renderEdit(root));
    }
  }

  // ---- ORDERS (Geliştirilmiş tablo)
  async function fetchOrders(){
    try {
      const data = await (window.API && window.API.orders
        ? window.API.orders.mine({ include_cancelled: false })
        : (async () => {
            const url = new URL(`${API_BASE}/api/orders/mine`);
            url.searchParams.set('_ts', Date.now());
            const r = await fetch(url, {
              credentials:'include',
              cache:'no-store',
              headers: noStoreHeaders
            });
            if (r.status === 401) { redirectToLogin(); return { orders: [] }; }
            const d = await r.json().catch(()=>({}));
            return d && d.ok ? d : { orders: [] };
          })()
      );
      return data.orders || [];
    } catch (e) {
      console.error('fetchOrders error:', e);
      return [];
    }
  }

  function pickThumb(o){
    const t = o.thumb_url || o.thumb || '';
    if (!t) return '/assets/placeholder.png';
    if (/^https?:\/\//i.test(t) || t.startsWith('/')) return t;
    return `/uploads/${t}`;
  }

  function buildListingHref(o){
    if (o.slug) return `/listing.html?slug=${encodeURIComponent(o.slug)}`;
    return `/listing.html?id=${o.listing_id || o.id}`;
  }

  function formatOrderStatus(status) {
    const statusMap = {
      'pending': { text: 'Beklemede', class: 'status-pending' },
      'confirmed': { text: 'Onaylandı', class: 'status-confirmed' },
      'shipped': { text: 'Kargoda', class: 'status-shipped' },
      'delivered': { text: 'Teslim Edildi', class: 'status-delivered' },
      'cancelled': { text: 'İptal Edildi', class: 'status-cancelled' },
      'completed': { text: 'Tamamlandı', class: 'status-completed' }
    };
    
    const statusInfo = statusMap[status] || { text: status, class: 'status-unknown' };
    return `<span class="order-status ${statusInfo.class}">${statusInfo.text}</span>`;
  }

  async function renderOrders(root){
    if (!root) return;
    showLoading(root, 'Siparişler yükleniyor...');
    
    try{
      const orders = await fetchOrders();
      
      if (!orders.length) {
        root.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🛒</div>
            <h3>Henüz siparişiniz yok</h3>
            <p class="muted">Beğendiğiniz ürünleri satın alarak ilk siparişinizi verin.</p>
            <a class="btn primary" href="/">Alışverişe Başla</a>
          </div>
        `;
        return;
      }

      root.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3>Siparişlerim</h3>
            <span class="badge">${orders.length} sipariş</span>
          </div>
          <div class="table-responsive">
            <table class="orders-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Fiyat</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody id="ordersTableBody">
              </tbody>
            </table>
          </div>
        </div>
      `;

      const tbody = root.querySelector('#ordersTableBody');

      for (const o of orders){
        const tr = document.createElement('tr');
        tr.className = 'order-row';
        
        // Product info
        const tdProd = document.createElement('td');
        tdProd.innerHTML = `
          <div class="product-info">
            <img src="${pickThumb(o)}" alt="" class="product-thumb">
            <div class="product-details">
              <a href="${buildListingHref(o)}" class="product-title">${esc(o.title || `#${o.listing_id}`)}</a>
              <div class="product-meta muted small">ID: ${o.id}</div>
            </div>
          </div>
        `;

        // Price
        const tdPrice = document.createElement('td');
        const totalMinor = (o.total_minor != null) ? o.total_minor : (Number(o.unit_price_minor||0) * (o.qty || 1));
        tdPrice.innerHTML = `<strong>${toTL(totalMinor, o.currency)}</strong>`;

        // Status
        const tdStatus = document.createElement('td');
        tdStatus.innerHTML = formatOrderStatus(o.status);

        // Date
        const tdDate = document.createElement('td');
        tdDate.innerHTML = `
          <time datetime="${o.created_at}">
            ${new Date(o.created_at).toLocaleDateString('tr-TR')}
          </time>
        `;

        // Actions
        const tdAct = document.createElement('td');
        if (o.status === 'pending') {
          tdAct.innerHTML = `
            <button class="btn btn-sm danger" data-cancel-order="${o.id}">İptal Et</button>
          `;
        } else {
          tdAct.innerHTML = `<span class="muted">—</span>`;
        }

        tr.append(tdProd, tdPrice, tdStatus, tdDate, tdAct);
        tbody.appendChild(tr);
      }

      // Cancel order handlers
      root.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-cancel-order]');
        if (!btn) return;
        
        const orderId = btn.dataset.cancelOrder;
        if (!confirm('Bu siparişi iptal etmek istediğinize emin misiniz?')) return;
        
        btn.disabled = true;
        btn.textContent = 'İptal ediliyor...';
        
        try {
          await cancelOrder(orderId);
          const row = btn.closest('tr');
          row.style.transition = 'opacity 0.3s';
          row.style.opacity = '0.5';
          
          setTimeout(() => {
            row.remove();
            const remaining = tbody.children.length;
            if (remaining === 0) {
              root.innerHTML = `
                <div class="empty-state">
                  <div class="empty-icon">🛒</div>
                  <h3>Tüm siparişler iptal edildi</h3>
                  <a class="btn primary" href="/">Yeni Alışveriş Yap</a>
                </div>
              `;
            } else {
              root.querySelector('.badge').textContent = `${remaining} sipariş`;
            }
          }, 300);
          
        } catch (e) {
          console.error(e);
          alert('İptal işlemi başarısız: ' + (e.message || 'Bilinmeyen hata'));
          btn.disabled = false;
          btn.textContent = 'İptal Et';
        }
      });

    } catch (e) {
      showError(root, 'Siparişler yüklenemedi.', () => renderOrders(root));
    }
  }

  // ---- MY LISTINGS (İlan Ver butonu kaldırıldı)
  async function fetchMyListings(page=1, size=24){
    try {
      const data = await (window.API && window.API.listings
        ? window.API.listings.mine({ page, size })
        : (async () => {
            const url = new URL('/api/listings/my', API_BASE);
            url.searchParams.set('page', page);
            url.searchParams.set('size', size);
            url.searchParams.set('_ts', Date.now());
            const r = await fetch(url.toString(), { credentials:'include', cache:'no-store', headers: noStoreHeaders });
            if (r.status === 401) { redirectToLogin(); return { items:[], total:0 }; }
            const d = await r.json().catch(()=>({}));
            if (!r.ok) return { items:[], total:0 };
            return d;
          })()
      );
      
      const items = data.items || data.listings || [];
      const total = Number(data.total ?? data.count ?? items.length);
      return { items, total };
    } catch (e) {
      console.error('fetchMyListings error:', e);
      return { items: [], total: 0 };
    }
  }

  function listingCard(x){
    const img = x.thumb_url || x.cover || '/assets/placeholder.png';
    const href = x.slug ? `/listing.html?slug=${encodeURIComponent(x.slug)}` : `/listing.html?id=${encodeURIComponent(x.id)}`;
    let priceStr = '';
    if (typeof x.price_minor === 'number') priceStr = toTL(x.price_minor, x.currency || 'TRY');
    else if (x.price != null) priceStr = `${(Number(x.price)||0).toLocaleString('tr-TR')} ${esc(x.currency||'TRY')}`;
    
    const statusBadge = x.status === 'active' ? '' : `<span class="listing-status status-${x.status || 'draft'}">${esc(x.status || 'taslak')}</span>`;
    
    return `
      <article class="card listing-card">
        <div class="card-media">
          <img src="${img}" alt="${esc(x.title)}" loading="lazy" onerror="this.src='/assets/placeholder.png';this.onerror=null">
          ${statusBadge}
        </div>
        <div class="card-body">
          <h3 class="listing-title">
            <a href="${href}">${esc(x.title || 'Başlıksız İlan')}</a>
          </h3>
          <div class="listing-meta">
            <span class="category muted">${esc(x.category_name || '')}</span>
            <span class="date muted">${x.created_at ? new Date(x.created_at).toLocaleDateString('tr-TR') : ''}</span>
          </div>
          <div class="listing-price">${priceStr}</div>
          <div class="listing-actions">
            <a class="btn btn-sm" href="${href}">Görüntüle</a>
            <a class="btn btn-sm ghost" href="/sell.html?edit=${encodeURIComponent(x.id)}">Düzenle</a>
          </div>
        </div>
      </article>
    `;
  }

  async function renderMyListings(root){
    if (!root) return;
    showLoading(root, 'İlanlarınız yükleniyor...');
    
    try{
      const { items, total } = await fetchMyListings(1, 24);
      
      if (!items.length){
        root.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>Henüz ilanınız yok</h3>
            <p class="muted">İlk ilanınızı vererek satış yapmaya başlayın.</p>
          </div>
        `;
        return;
      }

      root.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3>İlanlarım</h3>
            <span class="badge">${total} ilan</span>
          </div>
          <div class="card-body">
            <div class="listings-grid" id="myListGrid">
              ${items.map(listingCard).join('')}
            </div>
          </div>
        </div>
      `;
      
    }catch(e){
      showError(root, 'İlanlar yüklenemedi.', () => renderMyListings(root));
    }
  }

  // ---- Router
  async function route(){
    try {
      await requireLogin();
    } catch {
      return; // redirected to login
    }
    
    const tab = getTab();
    setActive(tab);
    
    // Update title
    const titles = {
      'edit': 'Profil Düzenle',
      'orders': 'Siparişlerim', 
      'mylistings': 'İlanlarım',
      'overview': 'Hesabım'
    };
    document.title = `${titles[tab] || 'Hesabım'} | Eskisini Ver Yenisini Al`;
    
    const content = $('#tab_content'); 
    if (!content) return;
    
    // Route to appropriate render function
    switch(tab) {
      case 'edit':
        return renderEdit(content);
      case 'orders':
        return renderOrders(content);
      case 'mylistings':
        return renderMyListings(content);
      default:
        return renderOverview(content);
    }
  }

  // ---- Tab wiring with accessibility
  function wireTabs(){
    document.querySelectorAll('#tabs a').forEach(a => {
      if (a.dataset.bound === '1') return;
      a.dataset.bound = '1';
      
      a.addEventListener('click', (e) => {
        const tab = a.dataset.tab; 
        if (!tab) return;
        e.preventDefault();
        updateTabURL(tab);
        route();
      });
      
      // Keyboard navigation
      a.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          a.click();
        }
      });
    });

    // Arrow key navigation
    document.addEventListener('keydown', (e) => {
      if (!e.target.closest('#tabs')) return;
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tabs = Array.from(document.querySelectorAll('#tabs a'));
        const current = tabs.findIndex(tab => tab.classList.contains('active'));
        if (current === -1) return;
        
        const next = e.key === 'ArrowRight' 
          ? (current + 1) % tabs.length 
          : (current - 1 + tabs.length) % tabs.length;
        
        tabs[next].focus();
        tabs[next].click();
        e.preventDefault();
      }
    });
  }

  // ---- Initialize
  function initialize() {
    wireTabs();
    route();
  }

  // ---- Event listeners
  document.addEventListener('partials:loaded', initialize);
  window.addEventListener('popstate', route);
  window.addEventListener('DOMContentLoaded', initialize);
})();