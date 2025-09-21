// frontend/public/js/api.js
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  async function json(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
      ...opts
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  window.API = {
    /** Ana kategoriler (varsayılan 20 adet) */
    getMainCategories(limit = 20) {
      const u = new URL(`${API_BASE}/api/categories/main`);
      u.searchParams.set('limit', String(limit));
      return json(u.toString());
    },

    /** Arama/Listeleme proxy — verilen parametreleri querystring’e yazar */
    search(params = {}) {
      const u = new URL(`${API_BASE}/api/listings/search`);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          u.searchParams.set(k, String(v));
        }
      });
      return json(u.toString());
    }
  };
})();
