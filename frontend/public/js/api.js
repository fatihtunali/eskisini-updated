// public/js/api.js
(function (global) {
  const API_BASE = (global.APP && global.APP.API_BASE) || '';

  async function jsonFetch(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { response: data });
    return data;
  }

  const API = {
    // Ana kategoriler (backend’de /main eklendi)
    async getMainCategories(limit = 12) {
      return jsonFetch(`${API_BASE}/api/categories/main?limit=${encodeURIComponent(limit)}`);
    },

    // Düz kategori listesi (gerekirse)
    async listCategories() {
      return jsonFetch(`${API_BASE}/api/categories`);
    },

    // Arama
    async search({ q, cat, min_price, max_price, sort, limit = 24, offset = 0 } = {}) {
      const u = new URL(`${API_BASE}/api/listings/search`);
      if (q) u.searchParams.set('q', q);
      if (cat) u.searchParams.set('cat', cat);
      if (min_price != null) u.searchParams.set('min_price', String(min_price));
      if (max_price != null) u.searchParams.set('max_price', String(max_price));
      if (sort) u.searchParams.set('sort', sort);
      u.searchParams.set('limit', String(limit));
      u.searchParams.set('offset', String(offset));
      return jsonFetch(u.toString());
    }
  };

  global.API = API;
})(window);
