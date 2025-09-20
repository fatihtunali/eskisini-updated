// Partials yükle
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  bootCategory();
});

// Helpers (CSP uyumlu)
function attachImgFallback(rootEl) {
  rootEl.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      img.src = 'assets/hero.png';
      img.removeAttribute('data-fallback');
    }, { once: true });
  });
}
function renderProductSkeleton(container, n){
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({length:n}).map(()=>`
    <div class="skel card">
      <div class="skel media"></div>
      <div class="skel line w80"></div>
      <div class="skel line w60"></div>
    </div>
  `).join('');
}
function renderCategorySkeleton(container, n){
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({length:n}).map(()=>`
    <div class="skel card">
      <div class="skel avatar"></div>
      <div class="skel line w70"></div>
      <div class="skel line w40"></div>
    </div>
  `).join('');
}
function clearSkeleton(el){ el.classList.remove('skeleton-on'); }

async function bootCategory(){
  const url = new URL(location.href);
  const slug = url.searchParams.get('slug') || '';
  const q    = url.searchParams.get('q') || '';

  const titleEl    = document.getElementById('title');
  const chipsEl    = document.getElementById('chips');
  const catsEl     = document.getElementById('cats');
  const listingsEl = document.getElementById('listings');
  const hListings  = document.getElementById('hListings');

  // Güvenli sınıflar (yanlışlıkla silinse bile)
  catsEl?.classList.add('grid','five');
  listingsEl?.classList.add('grid','five');

  if (slug) {
    // Alt kategori görünümü
    renderCategorySkeleton(catsEl, 10);
    renderProductSkeleton(listingsEl, 10);
    try {
      const data = await API.getChildren(slug);
      if (data?.ok) {
        titleEl.textContent = data.parent.name;

        // Çipler
        chipsEl.innerHTML = (data.children||[]).map(c => `
          <a class="btn-ghost tiny" style="margin:0 6px 10px 6px; display:inline-block"
             href="category.html?slug=${encodeURIComponent(c.slug)}">${c.name}</a>
        `).join('') || '';

        // Alt kategoriler grid
        clearSkeleton(catsEl);
        catsEl.innerHTML = (data.children||[]).map(c => `
          <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
            <div class="icon">▦</div>
            <div class="c-title">${c.name}</div>
            <div class="c-sub muted">Popüler</div>
          </a>
        `).join('') || `<div class="muted center" style="grid-column:1/-1">Alt kategori yok.</div>`;

        // İlanlar
        const res = await API.search({ cat: slug, q, limit: 20 });
        clearSkeleton(listingsEl);
        if (res?.ok && Array.isArray(res.listings) && res.listings.length){
          hListings.style.display = 'block';
          listingsEl.innerHTML = res.listings.map(x => {
            const cover = x.cover || 'assets/hero.jpg';
            return `
              <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
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
          attachImgFallback(listingsEl);
        } else {
          hListings.style.display = 'none';
          listingsEl.innerHTML = `<div class="muted center" style="grid-column:1/-1">Bu kategoride ilan yok.</div>`;
        }
      } else {
        // slug bozuksa ana görünüm
        await renderMainCategories(catsEl, listingsEl, hListings);
      }
    } catch(err){
      console.error(err);
      await renderMainCategories(catsEl, listingsEl, hListings);
    }
  } else {
    // Ana kategori + öne çıkan ilanlar
    await renderMainCategories(catsEl, listingsEl, hListings);
  }
}

async function renderMainCategories(catsEl, listingsEl, hListings){
  renderCategorySkeleton(catsEl, 10);
  renderProductSkeleton(listingsEl, 10);

  try {
    const mains = await API.getMainCategories();
    clearSkeleton(catsEl);
    catsEl.innerHTML = mains?.ok
      ? mains.categories.map(c=>`
          <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
            <div class="icon">▦</div>
            <div class="c-title">${c.name}</div>
            <div class="c-sub muted">Popüler</div>
          </a>`).join('')
      : `<div class="muted center" style="grid-column:1/-1">Kategoriler yüklenemedi.</div>`;
  } catch(e){
    console.error(e);
    clearSkeleton(catsEl);
    catsEl.innerHTML = `<div class="muted center" style="grid-column:1/-1">Kategoriler yüklenemedi.</div>`;
  }

  try {
    const res = await API.search({ cat: 'akilli-telefonlar', limit: 12 });
    clearSkeleton(listingsEl);
    if (res?.ok && res.listings?.length){
      hListings.style.display = 'block';
      listingsEl.innerHTML = res.listings.map(x=>{
        const cover = x.cover || 'assets/hero.jpg';
        return `
          <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
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
      attachImgFallback(listingsEl);
    } else {
      hListings.style.display = 'none';
      listingsEl.innerHTML = `<div class="muted center" style="grid-column:1/-1">İlan bulunamadı.</div>`;
    }
  } catch(e){
    console.error(e);
    clearSkeleton(listingsEl);
    listingsEl.innerHTML = `<div class="muted center" style="grid-column:1/-1">İlanlar yüklenemedi.</div>`;
  }
}
