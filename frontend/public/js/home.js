// public/js/home.js

// Partials (header/footer)
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  boot(); // içerik yüklemeyi DOM hazır olduğunda başlat
});

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
      <div class="skel avatar"></div>
      <div class="skel line w70"></div>
      <div class="skel line w40"></div>
    </div>
  `).join('');
}

function clearSkeleton(container) { container?.classList.remove('skeleton-on'); }

// === Güvenli başlatma ===
async function boot(){
  const url   = new URL(location.href);
  const q     = url.searchParams.get('q') || '';

  const catsBox = document.getElementById('cats');
  const featBox = document.getElementById('featured');
  const hFeat   = document.getElementById('hFeatured'); // varsa “Öne çıkanlar” başlığı

  catsBox?.classList.add('grid','five');
  featBox?.classList.add('grid','five');

  // Kategoriler
  if (catsBox) {
    renderCategorySkeleton(catsBox, 10);
    try {
      const res = await API.getMainCategories();
      const categories = res?.categories || [];
      if (res?.ok && categories.length) {
        catsBox.innerHTML = categories.slice(0, 10).map(c => `
          <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
            <div class="icon">▦</div>
            <div class="c-title">${h(c.name)}</div>
            <div class="c-sub muted">Popüler</div>
          </a>
        `).join('');
      } else {
        catsBox.innerHTML = `<div class="muted center">Kategoriler yüklenemedi.</div>`;
      }
    } catch (e) {
      console.error(e);
      catsBox.innerHTML = `<div class="muted center">Kategoriler yüklenemedi.</div>`;
    } finally {
      clearSkeleton(catsBox);
      attachImgFallback(catsBox);
    }
  }

  // Öne çıkanlar / Arama sonuçları
  if (featBox) {
    renderProductSkeleton(featBox, 10);
    try {
      // q varsa arama sonucunu, yoksa öne çıkanları getir
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
              <img src="${cover}" alt="${h(x.title)}" data-fallback>
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
      console.error(e);
      if (hFeat) hFeat.style.display = 'none';
      featBox.innerHTML = `<div class="muted center">İlanlar yüklenemedi.</div>`;
    } finally {
      clearSkeleton(featBox);
      attachImgFallback(featBox);
    }
  }
}
