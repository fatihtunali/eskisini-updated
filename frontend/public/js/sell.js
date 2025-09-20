// public/js/sell.js
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- helpers ----------
  const toMinor = (v) => {
    if (v == null) return null;
    const str = String(v).trim().replace(/\./g, '').replace(',', '.'); // "1.234,56" -> "1234.56"
    const num = Number(str);
    if (!isFinite(num)) return null;
    return Math.round(num * 100);
  };
  const slugify = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i')
    .replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json', ...(opts.headers||{}) },
      ...opts
    });
    if (r.status === 401) {
      const u = new URL('/login.html', location.origin);
      u.searchParams.set('redirect', location.pathname + location.search);
      location.href = u.toString();
      throw new Error('unauthorized');
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function getMe() {
    try {
      const d = await fetchJSON(`${API_BASE}/api/auth/me`);
      return d.user || d;
    } catch { return null; }
  }

  // ---------- categories ----------
  async function loadMainCats(selectEl) {
    selectEl.innerHTML = `<option value="">Seçiniz…</option>`;
    const { ok, categories=[] } = await fetchJSON(`${API_BASE}/api/categories/main`);
    if (ok) {
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = c.name;
        selectEl.appendChild(opt);
      });
    }
    // Diğer/elle
    const other = document.createElement('option');
    other.value = '__other';
    other.textContent = 'Diğer / Elle gir';
    selectEl.appendChild(other);
  }

  async function loadChildCats(mainSlug, selectEl) {
    selectEl.innerHTML = `<option value="">Alt kategori (opsiyonel)</option>`;
    if (!mainSlug || mainSlug === '__other') {
      selectEl.disabled = true;
      return;
    }
    const { ok, children=[] } = await fetchJSON(`${API_BASE}/api/categories/children/${encodeURIComponent(mainSlug)}`);
    if (ok && children.length) {
      children.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = c.name;
        selectEl.appendChild(opt);
      });
      selectEl.disabled = false;
    } else {
      selectEl.disabled = true;
    }
  }

  function getSelectedCategorySlug() {
    const main = $('#catMain');
    const child = $('#catChild');
    const customWrap = $('#customSlugWrap');
    const custom = $('#customSlug');

    const childSlug = child && !child.disabled ? (child.value || '') : '';
    if (childSlug) return childSlug;

    const mainSlug = main ? (main.value || '') : '';
    if (mainSlug && mainSlug !== '__other') return mainSlug;

    const customSlug = custom ? custom.value.trim() : '';
    return customSlug || '';
  }

  // ---------- form bind ----------
  function bind() {
    const form = $('#f');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    const msg = $('#msg');
    const submitBtn = form.querySelector('[type="submit"]');

    // Kategori selectlerini hazırla
    const catMain  = $('#catMain');
    const catChild = $('#catChild');
    const customWrap = $('#customSlugWrap');
    const custom    = $('#customSlug');

    // Ana kategorileri doldur
    loadMainCats(catMain).catch(console.error);

    // Ana kategori değişince altları ve custom alanını yönet
    catMain?.addEventListener('change', async () => {
      const v = catMain.value;
      customWrap.style.display = (v === '__other') ? '' : 'none';
      if (v === '__other') {
        catChild.innerHTML = `<option value="">Önce ana kategoriyi seçin</option>`;
        catChild.disabled = true;
        return;
      }
      await loadChildCats(v, catChild).catch(console.error);
    });

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

        // category_slug: child -> main -> custom
        const category_slug = getSelectedCategorySlug();
        if (!category_slug) {
          alert('Lütfen bir kategori seçin veya slug girin.');
          return;
        }

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
        if (!title) {
          alert('Başlık zorunludur.');
          return;
        }

        // slug yoksa üret
        let slug = String(fd.get('slug') || '').trim();
        if (!slug) slug = slugify(title);

        // görseller
        const image_urls = String(fd.get('image_urls')||'')
          .split(/[\n,]/).map(s=>s.trim()).filter(Boolean);

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

  function boot() {
    bind();
  }

  document.addEventListener('partials:loaded', boot);
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof includePartials === 'function') includePartials();
    boot();
  });
})();
