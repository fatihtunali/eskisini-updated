// frontend/public/js/api.js
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  async function getJSON(url) {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function withParams(base, params) {
    const u = new URL(base, location.origin);
    (Object.entries(params || {})).forEach(([k, v]) => {
      if (v != null && v !== '') u.searchParams.set(k, String(v));
    });
    return u.toString().replace(location.origin, ''); // relative
  }

  const API = {
    // Kategoriler
    async getMainCategories() {
      return getJSON(`${API_BASE}/api/categories/main`);
    },

    // Arama
    async search(params) {
      const url = withParams(`${API_BASE}/api/listings/search`, params);
      return getJSON(url);
    },

    // Paketler (abonelik planları)
    async getPlans() {
      return getJSON(`${API_BASE}/api/billing/plans`);
    },

    // Kullanıcının aktif aboneliği (opsiyonel)
async getMySubscription() {
  try {
    return await getJSON(`${API_BASE}/api/billing/me`);
  } catch {
    return { ok:false, subscription:null };
  }
},

    // Kullanıcı bilgileri (giriş yapılmışsa)
    async getMe() {
      try {
        return await getJSON(`${API_BASE}/api/auth/me`);
      } catch {
        return { ok: false, user: null };
      }
    }
  };

  // Global’e yaz
  window.API = Object.assign({}, window.API || {}, API);
})();
