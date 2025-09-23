// public/js/home.js - Sadece Liste Modu
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  boot();
});

// Helpers
const h = s => String(s ?? '').replace(/[&<>"'`]/g, m =>
  m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' :
  m === '"' ? '&quot;' : m === "'" ? '&#39;' : '&#96;'
);
const fmtPrice = (price, cur='TRY') => {
  // Artık price zaten TL cinsinden geliyor, 100'e bölmeye gerek yok
  const amount = Number(price) || 0;
  
  return `${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${h(cur)}`;
};
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

function renderSkeleton(container, type='product', count=12) {
  if (!container) return;
  container.classList.add('skeleton-on');
  const tpl = type === 'cat'
    ? `<div class="skel card"><div class="skel avatar"></div><div class="skel line w70"></div><div class="skel line w40"></div></div>`
    : `<div class="skel card"><div class="skel media"></div><div class="skel line w80"></div><div class="skel line w60"></div></div>`;
  container.innerHTML = Array.from({ length: count }).map(() => tpl).join('');
}
function clearSkeleton(container){ container?.classList.remove('skeleton-on'); }

// URL paramları
function getParams(){
  const u = new URL(location.href);
  return {
    q: u.searchParams.get('q') || '',
    cat: u.searchParams.get('cat') || '',
    min_price: u.searchParams.get('min_price') || '',
    max_price: u.searchParams.get('max_price') || '',
    city: u.searchParams.get('city') || '',
    sort: u.searchParams.get('sort') || 'newest',
    page: Math.max(1, parseInt(u.searchParams.get('page')||'1',10)),
    size: Math.min(50, Math.max(1, parseInt(u.searchParams.get('size')||'24',10)))
  };
}
function setParam(name, value){
  const u = new URL(location.href);
  if (value == null || value==='') u.searchParams.delete(name);
  else u.searchParams.set(name, String(value));
  history.replaceState(null,'',u.toString());
}
function setParams(obj){
  const u = new URL(location.href);
  Object.entries(obj).forEach(([k,v])=>{
    if (v==null || v==='') u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  });
  history.replaceState(null,'',u.toString());
}

// 🆕 Liste format kart şablonu (ana kart template)
function productCard(x){
  const price = x.price || 0;
  const currency = x.currency || 'TRY';
  
  const cover = x.cover || 'assets/hero.jpg';
  const href  = `listing.html?slug=${encodeURIComponent(x.slug)}`;

  return `
    <div class="card-list" data-listing-id="${x.id}">
      <div class="media">
        <a href="${href}">
          <img src="${cover}" alt="${h(x.title)}" data-fallback loading="lazy">
        </a>
      </div>
      <div class="content">
        <div class="p-title">
          <a href="${href}">${h(x.title)}</a>
        </div>
        <div class="p-subtitle">${h(x.location_city || '')}</div>
        <div class="meta-row">
          <div class="p-price-full">${fmtPrice(price, currency)}</div>
          <div class="p-views">👁 ${Math.floor(50 + Math.random()*250)} görüntülenme</div>
        </div>
      </div>
      <div class="actions">
        <a href="${href}" class="btn btn-detail">Detay</a>
        <button class="btn btn-buy" type="button">Satın Al</button>
      </div>
    </div>
  `;
}

function populateCitySelect(selected){
  const sel = document.getElementById('f_city');
  if (!sel) return;

  if (sel.dataset.bound === '1') {
    if (selected != null) sel.value = selected;
    return;
  }

  const cities = Array.isArray(window.CITIES_TR) ? window.CITIES_TR : [];
  sel.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Tüm şehirler';
  sel.appendChild(defaultOpt);

  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    sel.appendChild(opt);
  });

  sel.value = selected || '';
  sel.dataset.bound = '1';
}

function categoryListItem(c){
  return `<li><a href="index.html?cat=${encodeURIComponent(c.slug)}" data-cat-link="${h(c.slug)}">${h(c.name)}</a></li>`;
}

// Sol panel: filtre "Uygula"
function wireFiltersApply(){
  const apply = document.getElementById('apply');
  if (!apply) return;
  apply.addEventListener('click', ()=>{
    const p = getParams();
    const q   = (document.getElementById('f_q')?.value || '').trim();
    const cat = (document.getElementById('f_cat')?.value || p.cat || '');
    const min = document.getElementById('f_min')?.value || '';
    const max = document.getElementById('f_max')?.value || '';
    const city = (document.getElementById('f_city')?.value || p.city || '').trim();
    const sort= document.getElementById('f_sort')?.value || 'newest';
    setParams({ q, cat, city, min_price:min, max_price:max, sort, page:1, size:p.size });
    loadFeatured();
  });
}
function wireSort(){
  const sel = document.getElementById('f_sort');
  if (!sel) return;
  sel.addEventListener('change', ()=>{
    setParam('sort', sel.value || 'newest');
    setParam('page', 1);
    loadFeatured();
  });
}
// Kategori tıklamaları (soldaki liste)
function wireCategoryClicks(){
  const catList = document.getElementById('catList');
  if (!catList) return;
  catList.addEventListener('click', (e)=>{
    const a = e.target.closest('a[data-cat-link]');
    if (!a) return;
    e.preventDefault();
    const slug = a.getAttribute('data-cat-link');
    const p = getParams();
    setParams({ ...p, cat: slug, page: 1 });
    const sel = document.getElementById('f_cat');
    if (sel) sel.value = slug;
    loadFeatured();
  });
}

// Kategorileri hem select'e hem listeye doldur
async function loadCategories(){
  const listEl = document.getElementById('catList');
  const selEl  = document.getElementById('f_cat');

  if (listEl) renderSkeleton(listEl, 'cat', 8);

  try{
    const res = await (window.API && window.API.categories 
      ? window.API.categories.getMain() 
      : window.API.getMainCategories() // fallback
    ); 
    const categories = res?.categories || [];
    if (categories.length){
      if (listEl) listEl.innerHTML = categories.map(categoryListItem).join('');
      if (selEl){
        categories.forEach(c=>{
          const opt = document.createElement('option');
          opt.value = c.slug; opt.textContent = c.name;
          selEl.appendChild(opt);
        });
      }
    }else{
      if (listEl) listEl.innerHTML = `<li class="muted" style="padding:8px 0">Kategori bulunamadı.</li>`;
    }
  }catch(e){
    console.error('[home] categories error', e);
    if (listEl) listEl.innerHTML = `<li class="muted" style="padding:8px 0">Kategoriler yüklenemedi.</li>`;
  }finally{
    clearSkeleton(listEl);
  }
}

// Ürünleri getir (öne çıkanlar/sonuç) - Sadece Liste Modu
async function loadFeatured(){
  const box = document.getElementById('featured');
  const title = document.getElementById('hFeatured');
  if (!box) return;

  const p = getParams();
  // Sol panel alanlarını URL ile senkronla (varsa)
  const f = {
    qEl: document.getElementById('f_q'),
    catEl: document.getElementById('f_cat'),
    minEl: document.getElementById('f_min'),
    maxEl: document.getElementById('f_max'),
    sortEl: document.getElementById('f_sort'),
    cityEl: document.getElementById('f_city')
  };
  if (f.qEl)   f.qEl.value = p.q;
  if (f.catEl) f.catEl.value = p.cat;
  if (f.minEl) f.minEl.value = p.min_price || '';
  if (f.maxEl) f.maxEl.value = p.max_price || '';
  if (f.sortEl)f.sortEl.value= p.sort;
  if (f.cityEl) f.cityEl.value = p.city;

  // Sadece liste modu - container sınıfını ayarla
  box.className = 'featured-list';

  renderSkeleton(box, 'product', 12);

  try{
    const params = {
      q: p.q,
      cat: p.cat,
      sort: p.sort,
      limit: p.size,
      offset: (p.page - 1) * p.size
    };
    if (p.city) params.city = p.city;
    if (p.min_price) params.min_price = String(Math.round(+p.min_price * 100));
    if (p.max_price) params.max_price = String(Math.round(+p.max_price * 100));

    const res = await (window.API && window.API.listings
      ? window.API.listings.search(params)
      : window.API.search(params) // fallback
    );
    const items = res?.listings || [];

    if (items.length){
      if (title) title.style.display = 'block';
      
      // Sadece liste format
      box.innerHTML = items.map(productCard).join('');
      
      attachImgFallback(box);
      if (window.FAV) await FAV.wireFavButtons(box);
    }else{
      if (title) title.style.display = 'none';
      box.innerHTML = `<div class="empty">İlan bulunamadı.</div>`;
    }
  }catch(e){
    console.error('[home] listings error', e);
    if (title) title.style.display = 'none';
    box.innerHTML = `<div class="empty">İlanlar yüklenemedi.</div>`;
  }finally{
    clearSkeleton(box);
  }
}

// Başlat
async function boot(){
  const initial = getParams();
  populateCitySelect(initial.city);
  wireFiltersApply();
  wireSort();
  wireCategoryClicks();
  await loadCategories();
  await loadFeatured();
}