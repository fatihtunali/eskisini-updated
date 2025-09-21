// public/js/home.js

// Partials yüklensin, sonra içerik
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  boot();
});

// === Helpers ===
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

function renderCategorySkeleton(container, count=20) {
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
function renderProductSkeleton(container, count=10) {
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
function clearSkeleton(container){ container?.classList.remove('skeleton-on'); }

// === Sayfa başlat ===
async function boot(){
  const catsBox = document.getElementById('cats');
  const featBox = document.getElementById('featured');
  const hFeat   = document.getElementById('hFeatured');

  // Kategoriler (20 adet, 5x4 görünüm)
  if (catsBox) {
    renderCategorySkeleton(catsBox, 20);
    try {
      const res = await window.API.getMainCategories();   // GET /api/categories/main
      const categories = (res?.categories || []).slice(0, 20);
      if (res?.ok && categories.length) {
        catsBox.innerHTML = categories.map(c => `
          <a class="catcard" href="search.html?cat=${encodeURIComponent(c.slug)}">
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
    }
  }

  // Öne çıkanlar (kartlar listingle aynı görsel yapısı: .media + object-fit:cover)
  if (featBox) {
    renderProductSkeleton(featBox, 10);
    try {
      const res = await window.API.search({ limit: 12 }); // GET /api/listings/search
      const items = res?.listings || [];
      if (res?.ok && items.length) {
        hFeat && (hFeat.style.display = 'block');
        featBox.innerHTML = items.map(x => {
          const cover = x.cover || 'assets/hero.jpg';
          const href  = `listing.html?slug=${encodeURIComponent(x.slug)}`;
          const isSponsor  = x.premium_level === 'sponsor'  && (!x.premium_until || new Date(x.premium_until) > new Date());
          const isFeatured = x.premium_level === 'featured' && (!x.premium_until || new Date(x.premium_until) > new Date());

          return `
            <article class="card">
              <div class="media">
                <a href="${href}">
                  <img src="${cover}" alt="${h(x.title)}" loading="lazy">
                </a>
              </div>
              <div class="pad">
                <div class="badges">
                  ${isSponsor  ? `<span class="badge badge--sponsor">SPONSORLU</span>` : ``}
                  ${isFeatured ? `<span class="badge badge--featured">ÖNE ÇIKARILDI</span>` : ``}
                </div>
                <h3 class="title"><a href="${href}">${h(x.title)}</a></h3>
                <div class="meta">${x.location_city ? h(x.location_city) : ''}</div>
                <div class="price">${fmtPrice(x.price_minor, x.currency||'TRY')}</div>
                <div class="card-actions">
                  <a class="btn" href="${href}">Görüntüle</a>
                </div>
              </div>
            </article>
          `;
        }).join('');
      } else {
        if (hFeat) hFeat.style.display = 'none';
        featBox.innerHTML = `<div class="muted center">İlan bulunamadı.</div>`;
      }
    } catch (e) {
      console.error(e);
      if (hFeat) hFeat.style.display = 'none';
      featBox.innerHTML = `<div class="muted center">İlanlar yüklenemedi.</div>`;
    } finally {
      clearSkeleton(featBox);
    }
  }
}
