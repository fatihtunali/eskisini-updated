// public/js/home.js

// Partials (header/footer)
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  boot(); // içerik yüklemeyi DOM hazır olduğunda başlat
});

// === Helpers (CSP uyumlu) ===
function attachImgFallback(rootEl) {
  const imgs = rootEl.querySelectorAll('img[data-fallback]');
  imgs.forEach(img => {
    img.addEventListener('error', () => {
      img.src = 'assets/hero.png';
      img.removeAttribute('data-fallback');
    }, { once: true });
  });
}
function renderProductSkeleton(container, count) {
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
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skel card">
      <div class="skel avatar"></div>
      <div class="skel line w70"></div>
      <div class="skel line w40"></div>
    </div>
  `).join('');
}
function clearSkeleton(container) {
  container.classList.remove('skeleton-on');
}

// === Güvenli başlatma ===
async function boot(){
  // Hedef kapları al ve gerekli sınıfları garanti et
  const catsBox = document.getElementById('cats');
  const featBox = document.getElementById('featured');
  if (catsBox) catsBox.classList.add('grid','five');
  if (featBox) featBox.classList.add('grid','five');

  // Kategoriler
  if (catsBox) {
    renderCategorySkeleton(catsBox, 10);
    try {
      const { ok, categories } = await API.getMainCategories();
      if (ok && Array.isArray(categories)) {
        catsBox.innerHTML = categories.slice(0, 10).map(c => `
          <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
            <div class="icon">▦</div>
            <div class="c-title">${c.name}</div>
            <div class="c-sub muted">Popüler</div>
          </a>
        `).join('');
        attachImgFallback(catsBox);
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

  // Öne çıkanlar
  if (featBox) {
    renderProductSkeleton(featBox, 10);
    try {
      const res = await API.search({ cat: 'akilli-telefonlar', limit: 10 });
      if (res?.ok && Array.isArray(res.listings)) {
        featBox.innerHTML = res.listings.map(x => {
          const cover = x.cover || 'assets/hero.jpg';
          return `
            <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
              <div class="flag">Öne Çıkan</div>
              <img src="${cover}" alt="${x.title}" data-fallback>
              <div class="p-meta">
                <div class="p-price">${(x.price_minor/100).toLocaleString('tr-TR')} ${x.currency}</div>
                <div class="p-views">👁 ${Math.floor(50+Math.random()*250)}</div>
              </div>
              <div class="p-title">${x.title}</div>
              <div class="p-sub muted">${x.location_city || ''}</div>
            </a>
          `;
        }).join('');
        attachImgFallback(featBox);
      } else {
        featBox.innerHTML = `<div class="muted center">İlan bulunamadı.</div>`;
      }
    } catch (e) {
      console.error(e);
      featBox.innerHTML = `<div class="muted center">İlanlar yüklenemedi.</div>`;
    } finally {
      clearSkeleton(featBox);
    }
  }
}
