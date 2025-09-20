// Partials yükle
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  bootCategory();
});

// ---------- Helpers ----------
const h = (s) => String(s ?? '').replace(/[&<>"'`]/g, m => (
  m === '&' ? '&amp;' :
  m === '<' ? '&lt;'  :
  m === '>' ? '&gt;'  :
  m === '"' ? '&quot;':
  m === "'" ? '&#39;' :
  '&#96;'
));
const fmtPrice = (minor, cur) =>
  `${((Number(minor)||0)/100).toLocaleString('tr-TR')} ${h(cur||'TRY')}`;

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

function renderProductSkeleton(container, n){
  if (!container) return;
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
  if (!container) return;
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({length:n}).map(()=>`
    <div class="skel card">
      <div class="skel avatar"></div>
      <div class="skel line w70"></div>
      <div class="skel line w40"></div>
    </div>
  `).join('');
}
function clearSkeleton(el){ el?.classList.remove('skeleton-on'); }

function setHTML(el, html){ if (el) el.innerHTML = html; }
function setText(el, text){ if (el) el.textContent = text; }
function show(el, on=true){ if (el) el.style.display = on ? 'block' : 'none'; }

// ---------- Main ----------
async function bootCategory(){
  const url = new URL(location.href);
  const slug = url.searchParams.get('slug') || '';
  const q    = url.searchParams.get('q')    || '';

  const titleEl    = document.getElementById('title');
  const chipsEl    = document.getElementById('chips');
  const catsEl     = document.getElementById('cats');
  const listingsEl = document.getElementById('listings');
  const hListings  = document.getElementById('hListings');

  // Güvenli sınıflar
  catsEl?.classList.add('grid','five');
  listingsEl?.classList.add('grid','five');

  try {
    if (slug) {
      await renderChildrenView({ slug, q, titleEl, chipsEl, catsEl, listingsEl, hListings });
    } else {
      await renderMainCategories(catsEl, listingsEl, hListings, q);
    }
  } catch (err) {
    console.error('bootCategory error:', err);
    await renderMainCategories(catsEl, listingsEl, hListings, q);
  }
}

async function renderChildrenView({ slug, q, titleEl, chipsEl, catsEl, listingsEl, hListings }){
  renderCategorySkeleton(catsEl, 10);
  renderProductSkeleton(listingsEl, 10);

  const data = await API.getChildren(slug).catch(()=>null);
  if (data?.ok) {
    setText(titleEl, data.parent?.name ?? 'Kategori');

    // Çipler
    setHTML(chipsEl, (data.children||[]).map(c => `
      <a class="btn-ghost tiny" style="margin:0 6px 10px 6px; display:inline-block"
         href="category.html?slug=${encodeURIComponent(c.slug)}">${h(c.name)}</a>
    `).join(''));

    // Alt kategoriler
    clearSkeleton(catsEl);
    setHTML(catsEl, (data.children||[]).length ? (data.children||[]).map(c => `
      <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
        <div class="icon">▦</div>
        <div class="c-title">${h(c.name)}</div>
        <div class="c-sub muted">Popüler</div>
      </a>
    `).join('') : `<div class="muted center" style="grid-column:1/-1">Alt kategori yok.</div>`);

    // İlanlar
    const res = await API.search({ cat: slug, q, limit: 20 }).catch(()=>null);
    clearSkeleton(listingsEl);
    if (res?.ok && Array.isArray(res.listings) && res.listings.length){
      show(hListings, true);
      setHTML(listingsEl, res.listings.map(x => {
        const cover = x.cover || 'assets/hero.jpg';
        return `
          <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
            <img src="${cover}" alt="${h(x.title)}" data-fallback>
            <div class="p-meta">
              <div class="p-price">${fmtPrice(x.price_minor, x.currency)}</div>
              <div class="p-views" aria-label="Görüntülenme">👁 ${Math.floor(50+Math.random()*250)}</div>
            </div>
            <div class="p-title">${h(x.title)}</div>
            <div class="p-sub muted">${h(x.location_city || '')}</div>
          </a>
        `;
      }).join(''));
      attachImgFallback(listingsEl);
    } else {
      show(hListings, false);
      setHTML(listingsEl, `<div class="muted center" style="grid-column:1/-1">Bu kategoride ilan yok.</div>`);
    }
  } else {
    // slug bozuksa ana görünüm
    await renderMainCategories(catsEl, listingsEl, hListings, q);
  }
}

async function renderMainCategories(catsEl, listingsEl, hListings, q=''){
  renderCategorySkeleton(catsEl, 10);
  renderProductSkeleton(listingsEl, 10);

  // Kategoriler
  try {
    const mains = await API.getMainCategories();
    clearSkeleton(catsEl);
    setHTML(catsEl, mains?.ok && mains.categories?.length
      ? mains.categories.map(c=>`
          <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
            <div class="icon">▦</div>
            <div class="c-title">${h(c.name)}</div>
            <div class="c-sub muted">Popüler</div>
          </a>`).join('')
      : `<div class="muted center" style="grid-column:1/-1">Kategoriler yüklenemedi.</div>`);
  } catch(e){
    console.error(e);
    clearSkeleton(catsEl);
    setHTML(catsEl, `<div class="muted center" style="grid-column:1/-1">Kategoriler yüklenemedi.</div>`);
  }

  // Öne çıkan / arama
  try {
    const params = q ? { q, limit: 12 } : { cat: 'akilli-telefonlar', limit: 12 };
    const res = await API.search(params);
    clearSkeleton(listingsEl);

    if (res?.ok && res.listings?.length){
      show(hListings, true);
      setHTML(listingsEl, res.listings.map(x=>{
        const cover = x.cover || 'assets/hero.jpg';
        return `
          <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
            <img src="${cover}" alt="${h(x.title)}" data-fallback>
            <div class="p-meta">
              <div class="p-price">${fmtPrice(x.price_minor, x.currency)}</div>
              <div class="p-views" aria-label="Görüntülenme">👁 ${Math.floor(50+Math.random()*250)}</div>
            </div>
            <div class="p-title">${h(x.title)}</div>
            <div class="p-sub muted">${h(x.location_city || '')}</div>
          </a>
        `;
      }).join(''));
      attachImgFallback(listingsEl);
    } else {
      show(hListings, false);
      setHTML(listingsEl, `<div class="muted center" style="grid-column:1/-1">${q ? 'Arama sonucu bulunamadı.' : 'İlan bulunamadı.'}</div>`);
    }
  } catch(e){
    console.error(e);
    clearSkeleton(listingsEl);
    setHTML(listingsEl, `<div class="muted center" style="grid-column:1/-1">İlanlar yüklenemedi.</div>`);
  }
}
