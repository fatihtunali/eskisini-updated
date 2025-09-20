// frontend/public/js/api.js
const API = (() => {
  const BASE = (window.APP && window.APP.API_BASE) || window.API_BASE || '';

  async function jfetch(path, { method='GET', params=null, body=null, headers={} } = {}) {
    const url = new URL(path, BASE);
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
    }
    const res = await fetch(url.toString(), {
      method,
      credentials: 'include',                 // <<< JWT cookie için şart
      headers: {
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    // JSON bekliyoruz; hata durumunda da JSON döndürmeye çalış
    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  return {
    // ---- Auth / Me (header hydrate için yararlı) ----
    me() {
      return jfetch('/api/auth/me'); // 401 atarsa logout/hdr guest'e düşür
    },

    // ---- Kategoriler ----
    getMainCategories() {
      return jfetch('/api/categories/main');
    },
    getChildren(slug) {
      return jfetch(`/api/categories/children/${encodeURIComponent(slug)}`);
    },

    // ---- İlanlar (listing) ----
    search({ q = '', cat = '', limit = 24, offset = 0 } = {}) {
      return jfetch('/api/listings/search', { params: { q, cat, limit, offset } });
    },
    getListing(slug) {
      return jfetch(`/api/listings/${encodeURIComponent(slug)}`);
    },
    createListing(payload) { // seller_id backend'de cookie'den alınır
      return jfetch('/api/listings', { method: 'POST', body: payload });
    },
    myListings({ page = 1, size = 12 } = {}) {
      return jfetch('/api/listings/my', { params: { page, size } });
    },

    // ---- Favoriler ----
    addFavorite(listing_id) { // user_id body'ye gönderilmiyor
      return jfetch('/api/favorites', { method: 'POST', body: { listing_id } });
    },
    removeFavorite(listing_id) {
      // İstersen DELETE /api/favorites/:listing_id yapabiliriz; şimdilik body'li DELETE
      return jfetch('/api/favorites', { method: 'DELETE', body: { listing_id } });
    },
    myFavorites() {
      return jfetch('/api/favorites/my');
    },

    // ---- Mesajlar ----
    startMessage({ listing_id, body }) {
      // buyer_id/seller_id backend tarafından belirleniyor
      return jfetch('/api/messages/start', { method: 'POST', body: { listing_id, body } });
    },
    threads() {
      return jfetch('/api/messages/threads');
    },
    messages(conversation_id) {
      return jfetch(`/api/messages/${encodeURIComponent(conversation_id)}`);
    },
    sendMessage(conversation_id, body) {
      return jfetch(`'/api/messages/${encodeURIComponent(conversation_id)}/messages'`.replace("'", ""), {
        method: 'POST',
        body: { body }
      });
    },

    // ---- Takas (trade) ----
    makeTrade({ listing_id, offered_text, cash_adjust_minor = 0 }) {
      // offerer_id backend tarafından cookie'den alınır
      return jfetch('/api/trade/offer', { method: 'POST', body: { listing_id, offered_text, cash_adjust_minor } });
    },
    respondTrade({ offer_id, action }) { // action: 'accept' | 'reject' | 'withdraw'
      return jfetch('/api/trade/respond', { method: 'POST', body: { offer_id, action } });
    },
    myTradeOffers() {
      return jfetch('/api/trade/my-offers');
    },
    incomingTrades() {
      return jfetch('/api/trade/incoming');
    },

    // ---- Siparişler ----
    createOrder({ listing_id, qty = 1, shipping_minor = 0 }) {
      // buyer_id backend'de cookie'den alınır
      return jfetch('/api/orders', { method: 'POST', body: { listing_id, qty, shipping_minor } });
    },
    myOrders() {
      return jfetch('/api/orders/my');
    }
  };
})();
