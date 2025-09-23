(function () {
  // Arka uç kökü: index.html içinden <script> ile APP.API_BASE verilebilir
  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  // ---------- yardımcılar ----------
  function buildURL(path, params) {
    const u = new URL(`${API_BASE}${path}`);
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') {
          u.searchParams.set(k, String(v));
        }
      });
    }
    return u.toString();
  }

  async function parseJsonSafe(res) {
    try { return await res.json(); } catch { return null; }
  }

  async function request(path, { method = 'GET', qs, body, headers } = {}) {
    const url = qs ? buildURL(path, qs) : `${API_BASE}${path}`;
    const opts = {
      method,
      credentials: 'include', // cookie tabanlı auth için şart
      headers: {
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    };

    const res = await fetch(url, opts);
    const data = await parseJsonSafe(res);

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  // ---------- API yüzeyi ----------
  const API = {
    // ---- Sağlık
    health() {
      return request('/api/health');
    },

    // ---- Auth
    auth: {
      register({ email, password, full_name, username, phone_e164, tc_no }) {
        return request('/api/auth/register', {
          method: 'POST',
          body: { email, password, full_name, username, phone_e164, tc_no }
        });
      },
      login({ email, password }) {
        return request('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });
      },
      logout() {
        return request('/api/auth/logout', { method: 'POST' });
      },
      me() {
        return request('/api/auth/me');
      },
      kycSubmit({ tc_no }) {
        return request('/api/auth/kyc', { method: 'POST', body: { tc_no } });
      },
      adminVerifyKyc({ user_id, result, admin_key }) {
        return request('/api/auth/admin/kyc/verify', {
          method: 'POST',
          headers: admin_key ? { 'x-admin-key': admin_key } : undefined,
          body: { user_id, result, admin_key }
        });
      }
    },

    // ---- Kullanıcı
    users: {
      getProfile() {
        return request('/api/users/profile');
      },
      updateProfile({ full_name, phone_e164 }) {
        return request('/api/users/profile', {
          method: 'POST',
          body: { full_name, phone_e164 }
        });
      }
    },

    // ---- Kategoriler
    categories: {
      getAll() {
        return request('/api/categories');
      },
      getMain(limit = 20) {
        return request('/api/categories/main', { qs: { limit } });
      },
      getChildren(slug) {
        return request(`/api/categories/children/${encodeURIComponent(slug)}`);
      }
    },

    // ---- İlanlar
    listings: {
      create(payload) {
        // payload: { category_slug, title, slug?, description_md?, price_minor, currency?, condition_grade?, location_city?, allow_trade?, image_urls? }
        return request('/api/listings', { method: 'POST', body: payload });
      },

      search(params = {}) {
        // params: { q, cat, min_price, max_price, sort, limit, offset, city, district, lat, lng, radius_km, condition }
        return request('/api/listings/search', { qs: params });
      },

      mine({ page = 1, size = 12 } = {}) {
        return request('/api/listings/my', { qs: { page, size } });
      },

      detail(slug) {
        return request(`/api/listings/${encodeURIComponent(slug)}`);
      }
    },

    // ---- Favoriler
    favorites: {
      add(listing_id) {
        return request(`/api/favorites/${encodeURIComponent(listing_id)}`, { method: 'POST' });
      },
      remove(listing_id) {
        return request(`/api/favorites/${encodeURIComponent(listing_id)}`, { method: 'DELETE' });
      },
      mine({ page = 1, size = 12 } = {}) {
        return request('/api/favorites/my', { qs: { page, size } });
      }
    },

    // ---- Mesajlar
    messages: {
      threads() {
        return request('/api/messages/threads');
      },
      thread(conversation_id) {
        return request(`/api/messages/thread/${encodeURIComponent(conversation_id)}`);
      },
      send(conversation_id, body) {
        return request(`/api/messages/thread/${encodeURIComponent(conversation_id)}`, {
          method: 'POST',
          body: { body }
        });
      },
      start({ listing_id, to_user_id } = {}) {
        return request('/api/messages/start', {
          method: 'POST',
          body: { listing_id, to_user_id }
        });
      }
    },

    // ---- Siparişler
    orders: {
      create({ listing_id, qty = 1 }) {
        return request('/api/orders', { method: 'POST', body: { listing_id, qty } });
      },
      cancel(order_id) {
        return request(`/api/orders/${encodeURIComponent(order_id)}/cancel`, { method: 'POST' });
      },
      mine({ include_cancelled = false } = {}) {
        return request('/api/orders/mine', { qs: { include_cancelled: include_cancelled ? 1 : '' } });
      },
      sold({ include_cancelled = false } = {}) {
        return request('/api/orders/sold', { qs: { include_cancelled: include_cancelled ? 1 : '' } });
      }
    },

    // ---- Takas / Teklif
    trade: {
      offer({ listing_id, offered_text = '', cash_adjust_minor = 0 }) {
        return request('/api/trade/offer', {
          method: 'POST',
          body: { listing_id, offered_text, cash_adjust_minor }
        });
      },
      // Satıcı olduğum ilanlar için gelen teklifler
      listingOffers(listing_id) {
        return request(`/api/trade/listing/${encodeURIComponent(listing_id)}/offers`);
      },
      // Benim tekliflerim: role = 'sent' | 'received'
      my({ role = 'sent' } = {}) {
        return request('/api/trade/my', { qs: { role } });
      },
      // Aksiyonlar
      accept(offer_id) {
        return request(`/api/trade/offer/${encodeURIComponent(offer_id)}/accept`, { method: 'POST' });
      },
      reject(offer_id) {
        return request(`/api/trade/offer/${encodeURIComponent(offer_id)}/reject`, { method: 'POST' });
      },
      withdraw(offer_id) {
        return request(`/api/trade/offer/${encodeURIComponent(offer_id)}/withdraw`, { method: 'POST' });
      }
    },

    // ---- Abonelik / Faturalama
    billing: {
      getPlans() {
        return request('/api/billing/plans');
      },
      me() {
        return request('/api/billing/me');
      }
    },

    // ---- Bildirimler
    notifications: {
      list({ page = 1, size = 20, unread_only = false } = {}) {
        return request('/api/notifications', { 
          qs: { page, size, unread_only: unread_only.toString() } 
        });
      },
      markRead(notification_id) {
        return request(`/api/notifications/${encodeURIComponent(notification_id)}/read`, { 
          method: 'POST' 
        });
      },
      markAllRead() {
        return request('/api/notifications/read-all', { method: 'POST' });
      }
    }
  };

  // Eski kısa yollar (geri uyumluluk)
  API.getMainCategories = function (limit = 20) {
    return API.categories.getMain(limit);
  };
  API.search = function (params = {}) {
    return API.listings.search(params);
  };

  // Dışarı ver
  window.API = API;
})();