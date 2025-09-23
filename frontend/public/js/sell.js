// public/js/sell.js
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $  = (s, r = document) => r.querySelector(s);

  // ---- helpers ----
  const toMinor = (v) => {
    if (v == null) return null;
    const str = String(v).trim().replace(/\./g, '').replace(',', '.'); // "1.234,56" -> "1234.56"
    const num = Number(str);
    if (!Number.isFinite(num)) return null;
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

  // ---- categories ----
  async function loadMainCats(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="">Seçiniz…</option>`;
    try {
      const data = await (window.API && window.API.categories 
        ? window.API.categories.getMain()
        : fetchJSON(`${API_BASE}/api/categories/main`)
      );
      const { ok, categories = [] } = data;
      if (ok && Array.isArray(categories)) {
        for (const c of categories) {
          const opt = document.createElement('option');
          opt.value = c.slug;
          opt.textContent = c.name;
          selectEl.appendChild(opt);
        }
      }
    } catch (e) { console.warn('categories/main', e); }

    const other = document.createElement('option');
    other.value = '__other';
    other.textContent = 'Diğer / Elle gir';
    selectEl.appendChild(other);
  }

  async function loadChildCats(mainSlug, selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="">Alt kategori (opsiyonel)</option>`;
    if (!mainSlug || mainSlug === '__other') {
      selectEl.disabled = true;
      return;
    }
    try {
      const data = await (window.API && window.API.categories 
        ? window.API.categories.getChildren(mainSlug)
        : fetchJSON(`${API_BASE}/api/categories/children/${encodeURIComponent(mainSlug)}`)
      );
      const { ok, children = [] } = data;
      if (ok && children.length) {
        for (const c of children) {
          const opt = document.createElement('option');
          opt.value = c.slug;
          opt.textContent = c.name;
          selectEl.appendChild(opt);
        }
        selectEl.disabled = false;
      } else {
        selectEl.disabled = true;
      }
    } catch (e) {
      console.warn('categories/children', e);
      selectEl.disabled = true;
    }
  }

  function getSelectedCategorySlug(catMain, catChild, customInput) {
    const childSlug = (catChild && !catChild.disabled && catChild.value) ? catChild.value : '';
    if (childSlug) return childSlug;
    const mainSlug = (catMain && catMain.value) ? catMain.value : '';
    if (mainSlug && mainSlug !== '__other') return mainSlug;
    const customSlug = (customInput && customInput.value) ? customInput.value.trim() : '';
    return customSlug || '';
  }

  // ---- bind ----
  function bind() {
    // Form id'leri için fallback: #sellForm veya #f
    const form = $('#sellForm') || $('#f');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    const submitBtn = form.querySelector('[type="submit"]');
    const msg = $('#msg');

    // ID fallback'leri: #mainCat/#subCat veya #catMain/#catChild
    const catMain  = $('#mainCat') || $('#catMain');
    const catChild = $('#subCat')  || $('#catChild');
    const customWrap = $('#customSlugWrap'); // varsa
    const customSlug = $('#customSlug');     // varsa

    // Title/slug
    const titleEl = $('#title');
    const slugEl  = $('#slug');

    // Price
    const priceInput = $('#price');
    const priceMinorHidden = $('#price_minor');

    // Images
    const images = $('#images');
    const imgCount = $('#imgCount');

    // ---- UI helpers ----
    // Slug önerisi
    if (titleEl && slugEl) {
      titleEl.addEventListener('input', () => {
        if (!slugEl.value) slugEl.placeholder = slugify(titleEl.value);
      });
    }

    // Fiyat -> minor
    if (priceInput && priceMinorHidden) {
      const prettify = (txt) => {
        let s = (txt || '').toString()
          .replace(/[^\d.,]/g,'')
          .replace(/,{2,}/g, ',')
          .replace(/\.(?=.*\.)/g,''); // tek nokta
        return s;
      };
      priceInput.addEventListener('input', () => {
        priceInput.value = prettify(priceInput.value);
        priceMinorHidden.value = toMinor(priceInput.value) ?? '';
      });
    }

    // Görsel sayaç
    if (images && imgCount) {
      const recalc = () => {
        const n = images.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).length;
        imgCount.textContent = String(n);
      };
      images.addEventListener('input', recalc);
      recalc();
    }

    // Kategoriler
    if (catMain) loadMainCats(catMain).catch(console.error);
    catMain?.addEventListener('change', async () => {
      const v = catMain.value;
      if (customWrap) customWrap.style.display = (v === '__other') ? '' : 'none';
      if (!catChild) return;
      if (v === '__other') {
        catChild.innerHTML = `<option value="">Önce ana kategoriyi seçin</option>`;
        catChild.disabled = true;
        return;
      }
      await loadChildCats(v, catChild);
    });

    // Submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (msg) msg.textContent = '';
      if (submitBtn?.dataset.busy === '1') return;

      try {
        submitBtn && (submitBtn.dataset.busy = '1', submitBtn.disabled = true);

        // auth
        const user = await getMe();
        if (!user) return; // 401 yönlendirmesi fetchJSON'da

        const fd = new FormData(form);

        // kategori slug
        const category_slug = getSelectedCategorySlug(catMain, catChild, customSlug);
        if (!category_slug) {
          alert('Lütfen bir kategori seçin veya slug girin.');
          return;
        }

        // fiyat
        let price_minor = null;
        if (fd.has('price_minor') && String(fd.get('price_minor')).trim() !== '') {
          const pm = Number(String(fd.get('price_minor')).trim());
          price_minor = Number.isFinite(pm) ? pm : null;
        } else if (fd.has('price')) {
          price_minor = toMinor(fd.get('price'));
        } else if (priceInput) {
          price_minor = toMinor(priceInput.value);
        }
        if (!Number.isFinite(price_minor) || price_minor <= 0) {
          alert('Lütfen geçerli bir fiyat girin.');
          return;
        }

        // başlık
        const title = String(fd.get('title') || titleEl?.value || '').trim();
        if (!title) {
          alert('Başlık zorunludur.');
          return;
        }

        // slug
        let slug = String(fd.get('slug') || slugEl?.value || '').trim();
        if (!slug) slug = slugify(title);

        // diğer alanlar
        const image_urls = String(fd.get('image_urls') || images?.value || '')
          .split(/[\n,]/).map(s=>s.trim()).filter(Boolean);

        const payload = {
          category_slug,
          title,
          slug,
          description_md: String(fd.get('description_md') || '').trim(),
          price_minor,
          currency: (fd.get('currency') || 'TRY').toString().trim().toUpperCase() || 'TRY',
          condition_grade: String(fd.get('condition_grade') || 'good'),
          location_city: String(fd.get('location_city') || ''),
          allow_trade: fd.has('allow_trade') ? true : false,
          image_urls
        };

        const data = await (window.API && window.API.listings
          ? window.API.listings.create(payload)
          : (async () => {
              const r = await fetch(`${API_BASE}/api/listings`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
              });
              const d = await r.json().catch(() => ({}));
              if (!r.ok || d.ok === false) {
                throw new Error(d.error || d.message || `HTTP ${r.status}`);
              }
              return d;
            })()
        );

        alert('İlan oluşturuldu #' + (data.id ?? ''));
        const detailUrl = slug
          ? `/listing.html?slug=${encodeURIComponent(slug)}`
          : `/listing.html?id=${encodeURIComponent(data.id)}`;
        location.href = detailUrl;

      } catch (err) {
        console.error(err);
        alert('İlan oluşturulamadı: ' + (err.message || 'Hata'));
      } finally {
        submitBtn && (submitBtn.disabled = false, submitBtn.dataset.busy = '0');
      }
    });
  }

  function boot() { bind(); }

  // partials destekliyorsa
  document.addEventListener('partials:loaded', boot);
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof includePartials === 'function') includePartials();
    boot();
  });
})();