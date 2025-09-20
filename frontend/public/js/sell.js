// public/js/sell.js
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  // küçük yardımcılar
  const $ = (s, r = document) => r.querySelector(s);
  const toMinor = (v) => {
    if (v == null) return null;
    const str = String(v).trim().replace(/\./g, '').replace(',', '.'); // "1.234,56" → "1234.56"
    const num = Number(str);
    if (!isFinite(num)) return null;
    return Math.round(num * 100);
  };
  const slugify = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  async function getMe() {
    try {
      const r = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
      if (!r.ok) return null;
      const data = await r.json();
      return data.user || data;
    } catch { return null; }
  }

  function parseImageUrls(raw) {
    return String(raw || '')
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function bind() {
    const form = $('#f');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    const msg = $('#msg');
    const submitBtn = form.querySelector('[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (msg) msg.textContent = '';
      if (submitBtn?.dataset.busy === '1') return;
      if (submitBtn) { submitBtn.dataset.busy = '1'; submitBtn.disabled = true; }

      try {
        // login kontrolü
        const user = await getMe();
        if (!user) {
          const u = new URL('/login.html', location.origin);
          u.searchParams.set('redirect', location.pathname + location.search);
          location.href = u.toString();
          return;
        }

        const fd = new FormData(form);

        // price -> price_minor
        let price_minor = null;
        if (fd.has('price_minor') && String(fd.get('price_minor')).trim() !== '') {
          const pm = Number(String(fd.get('price_minor')).trim());
          price_minor = Number.isFinite(pm) ? pm : null;
        } else if (fd.has('price')) {
          price_minor = toMinor(fd.get('price'));
        }
        if (!Number.isFinite(price_minor) || price_minor <= 0) {
          alert('Lütfen geçerli bir fiyat girin.');
          return;
        }

        // zorunlular
        const title = String(fd.get('title') || '').trim();
        const category_slug = String(fd.get('category_slug') || '').trim();
        if (!title || !category_slug) {
          alert('Başlık ve kategori zorunludur.');
          return;
        }

        // slug yoksa üret
        let slug = String(fd.get('slug') || '').trim();
        if (!slug) slug = slugify(title);

        const image_urls = parseImageUrls(fd.get('image_urls'));

        // payload (seller_id frontend’ten gelmez; backend req.user.id kullanıyor)
        const payload = {
          category_slug,
          title,
          slug,
          description_md: String(fd.get('description_md') || ''),
          price_minor,
          currency: (fd.get('currency') || 'TRY').toString().trim().toUpperCase() || 'TRY',
          condition_grade: String(fd.get('condition_grade') || 'good'),
          location_city: String(fd.get('location_city') || ''),
          image_urls
        };

        const r = await fetch(`${API_BASE}/api/listings`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.ok === false) {
          throw new Error(data.error || data.message || `HTTP ${r.status}`);
        }

        alert('İlan oluşturuldu #' + data.id);
        const detailUrl = payload.slug
          ? `/listing.html?slug=${encodeURIComponent(payload.slug)}`
          : `/listing.html?id=${encodeURIComponent(data.id)}`;
        location.href = detailUrl;

      } catch (err) {
        console.error(err);
        alert('İlan oluşturulamadı: ' + (err.message || 'Hata'));
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.dataset.busy = '0'; }
      }
    });
  }

  function boot() { bind(); }

  document.addEventListener('partials:loaded', boot);
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof includePartials === 'function') includePartials();
    boot();
  });
})();
