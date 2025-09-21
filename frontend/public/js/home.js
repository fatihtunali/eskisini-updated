// public/js/home.js

// Partials yüklenince çalışalım (header/footer hazır)
document.addEventListener('partials:loaded', () => {
  safeBoot();
});

// Yedek: partials tetiklenmezse DOM hazır olunca da deneyelim (çift çağrıya karşı kilit var)
document.addEventListener('DOMContentLoaded', () => {
  safeBoot();
});

// -- tek seferlik çalıştırma kilidi
let __booted = false;
function safeBoot(){
  if (__booted) return;
  __booted = true;
  try { boot(); }
  catch (e) {
    console.error('[HOME] boot failed:', e);
    const catsBox = document.getElementById('cats');
    const featBox = document.getElementById('featured');
    if (catsBox) catsBox.innerHTML = `<div class="muted center">Anasayfa yüklenemedi.</div>`;
    if (featBox) featBox.innerHTML = `<div class="muted center">Anasayfa yüklenemedi.</div>`;
  }
}

// === Helpers (CSP uyumlu) ===
const h = s => String(s ?? '').replace(/[&<>"'`]/g, m =>
  m === '&' ? '&amp;' :
  m === '<' ? '&lt;'  :
  m === '>' ? '&gt;'  :
  m === '"' ? '&quot;':
  m === "'" ? '&#39;' :
  '&#96;'
);

const fmtPrice = (minor, cur='TRY') =>
  `${((Number(minor) || 0) / 100).toLocaleString('tr-TR')} ${h(cur)}`;

function attachImgFallback(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('img[data-fallback]').forEach(img => {
    if (img.dataset.bound) return;
    img.dataset.bound = '1';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.src = 'assets/hero.jpg';
      img.removeAttribute('data-fallback');
    }, { once: true });
  });
}

function renderProductSkeleton(container, count) {
  if (!container) return;
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skel card">
      <div class="skel media"></div>
      <div class="skel line w80"></div>
      <div class="skel line w60"></div>
    </div>
  `).join('');
}

function renderCategorySkeleton(container, count) {
  if (!container) return;
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skel card">
      <div class="skel media"></div>
      <div class="skel line w70"></div>
      <div class="skel line w40"></div>
    </div>
  `).join('');
}

function clearSkeleton(container) { container?.classList.remove('skeleton-on'); }

// === Asıl iş ===
async function boot(){
  // API yüklendi mi?
  if (!window.API || typeof API.getMainCategories !== 'function') {
    throw new Error('window.API yüklü değil veya api.js sırası yanlış. index.html’de api.js, home.js’ten ÖNCE gelmeli.');
  }

  const url   = new URL(location.href);
  const q     = url.searchParams.get('q') || '';

  const catsBox = document.getElementById('cats');
  const featBox = document.getElementById('featured');
  const hFeat   = document.getElementById('hFeatured'); // varsa “Öne çıkanlar” başlığı

  catsBox?.classList.add('grid','five');
  featBox?.classList.add('grid','five');

  // ---- KATEGORİLER ----
  if (catsBox) {
    renderCategorySkeleton(catsBox, 10);
    try {
      const res = await API.getMainCategories(12);
      const categories = res?.categories || [];
      if (res?.ok && categories.length) {
        catsBox.innerHTML = categories.slice(0, 12).map(c => {
          const img = c.sample_image || 'assets/hero.jpg';
          const href = `search.html?cat=${encodeURIComponent(c.slug)}`;
          const count = Number(c.active_count || 0).toLocaleString('tr-TR');
          return `
            <a class="catcard" href="${href}">
              <div class="media">
                <img src="${img}" alt="${h(c.name)}" data-fallback>
              </div>
              <div class="pad">
                <div class="c-title">${h(c.name)}</div>
                <div class="c-sub muted">${count} ilan</div>
              </div>
            </a>
          `;
        }).join('');
      } else {
        catsBox.innerHTML = `<div class="muted center">Kategoriler yüklenemedi.</div>`;
      }
    } catch (e) {
      console.error('[HOME] categories error:', e);
      catsBox.innerHTML = `<div class="muted center">Kategoriler yüklenemedi.</div>`;
    } finally {
      clearSkeleton(catsBox);
      attachImgFallback(catsBox);
    }
  }

  // ---- ÖNE ÇIKANLAR / ARAMA SONUÇLARI ----
  if (featBox) {
    renderProductSkeleton(featBox, 10);
    try {
      const params = q ? { q, limit: 12 } : { cat: 'akilli-telefonlar', limit: 12 };
      const res = await API.search(params);
      const items = res?.listings || [];
      if (res?.ok && items.length) {
        if (hFeat) hFeat.style.display = 'block';
        featBox.innerHTML = items.map(x => {
          const cover = x.cover || 'assets/hero.jpg';
          return `
            <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
              ${q ? '' : '<div class="flag">Öne Çıkan</div>'}
              <div class="media"><img src="${cover}" alt="${h(x.title)}" data-fallback></div>
              <div class="p-meta">
                <div class="p-price">${fmtPrice(x.price_minor, x.currency)}</div>
                <div class="p-views" aria-label="Görüntülenme">👁 ${Math.floor(50 + Math.random()*250)}</div>
              </div>
              <div class="p-title">${h(x.title)}</div>
              <div class="p-sub muted">${h(x.location_city || '')}</div>
            </a>
          `;
        }).join('');
      } else {
        if (hFeat) hFeat.style.display = 'none';
        featBox.innerHTML = `<div class="muted center">${q ? 'Arama sonucu bulunamadı.' : 'İlan bulunamadı.'}</div>`;
      }
    } catch (e) {
      console.error('[HOME] featured error:', e);
      if (hFeat) hFeat.style.display = 'none';
      featBox.innerHTML = `<div class="muted center">İlanlar yüklenemedi.</div>`;
    } finally {
      clearSkeleton(featBox);
      attachImgFallback(featBox);
    }
  }
}
