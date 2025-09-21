(function(){
  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  const SafeAPI = window.API || {
    async search(params){
      const url = new URL(`${API_BASE}/api/listings/search`);
      if (params.q) url.searchParams.set('q', params.q);
      if (params.cat) url.searchParams.set('cat', params.cat);
      if (params.min_price) url.searchParams.set('min_price', String(params.min_price));
      if (params.max_price) url.searchParams.set('max_price', String(params.max_price));
      if (params.city) url.searchParams.set('city', params.city);
      if (params.lat != null && params.lng != null) {
        url.searchParams.set('lat', String(params.lat));
        url.searchParams.set('lng', String(params.lng));
      }
      if (params.radius_km) url.searchParams.set('radius_km', String(params.radius_km));
      if (params.sort) url.searchParams.set('sort', params.sort);
      if (params.limit) url.searchParams.set('limit', String(params.limit));
      if (params.offset) url.searchParams.set('offset', String(params.offset));
      const res = await fetch(url, { headers:{'Accept':'application/json'}, credentials:'include' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      return res.json();
    },
    async getCategories(){
      const res = await fetch(`${API_BASE}/api/categories/main`, { headers:{'Accept':'application/json'} });
      if(!res.ok) throw new Error('HTTP '+res.status);
      return res.json();
    }
  };

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const TRYfmt = v => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format((v||0)/100);

  function getParams(){
    const u = new URL(location.href);
    return {
      q: u.searchParams.get('q') || '',
      cat: u.searchParams.get('cat') || '',
      min_price: u.searchParams.get('min_price'),
      max_price: u.searchParams.get('max_price'),
      city: u.searchParams.get('city') || '',
      lat: u.searchParams.get('lat') ? Number(u.searchParams.get('lat')) : null,
      lng: u.searchParams.get('lng') ? Number(u.searchParams.get('lng')) : null,
      radius_km: u.searchParams.get('radius_km') ? Number(u.searchParams.get('radius_km')) : null,
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

  function cardHTML(x){
    const img = x.cover || '/assets/placeholder.png';
    const href = `/listing.html?slug=${encodeURIComponent(x.slug)}`;
    const isSponsor  = x.premium_level === 'sponsor'  && (!x.premium_until || new Date(x.premium_until) > new Date());
    const isFeatured = x.premium_level === 'featured' && (!x.premium_until || new Date(x.premium_until) > new Date());
    const favBtn = window.FAV ? FAV.favButtonHTML(x.id, false) : '';
    return `
      <article class="card ${x.highlight?'highlight':''}">
        <div class="media">
          <a href="${href}"><img loading="lazy" src="${img}" alt="${esc(x.title)}"></a>
        </div>
        <div class="pad">
          <div class="badges">
            ${isSponsor? `<span class="badge badge--sponsor">SPONSORLU</span>`:''}
            ${isFeatured?`<span class="badge badge--featured">ÖNE ÇIKARILDI</span>`:''}
          </div>
          <h3 class="title"><a href="${href}">${esc(x.title)}</a></h3>
          <div class="meta">${x.location_city? esc(x.location_city):''}</div>
          <div class="price">${TRYfmt(x.price_minor)}</div>
          <div class="card-actions">
            <a class="btn" href="${href}">Görüntüle</a>
            <span class="fav-count">${x.favorites_count || 0}</span>
            ${favBtn}
          </div>
        </div>
      </article>
    `;
  }

  async function loadCategories(){
    const sel = $('#f_cat');
    if (!sel) return;
    try{
      const data = await SafeAPI.getCategories();
      (data.categories||[]).forEach(c=>{
        const opt = document.createElement('option');
        opt.value = c.slug; opt.textContent = c.name;
        sel.appendChild(opt);
      });
    }catch(e){
      console.warn('[search] kategoriler alınamadı', e);
    }
  }

  // <<< YENİ: şehir select’ini doldur
  function loadCitySelect(){
    const sel = $('#f_city');
    if (!sel) return;               // input bırakıldıysa atla
    if (!Array.isArray(window.CITIES_TR)) return;
    // Tümü seçeneği kalsın, diğerlerini ekle
    window.CITIES_TR.forEach(name=>{
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function renderPager(count, page, size){
    const el = $('#pager'); if (!el) return;
    const hasPrev = page > 1;
    const hasNext = count >= size;
    el.innerHTML = `
      <div class="pager">
        <button class="btn" data-act="prev" ${hasPrev?'':'disabled'}>‹ Önceki</button>
        <span class="page">Sayfa ${page}</span>
        <button class="btn" data-act="next" ${hasNext?'':'disabled'}>Sonraki ›</button>
      </div>`;
    el.onclick = (e)=>{
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const p = getParams();
      const next = b.dataset.act === 'next' ? p.page+1 : Math.max(1, p.page-1);
      setParams({ ...p, page: next });
      load();
    };
  }

  async function load(){
    const root = $('#list'); if(!root){ console.warn('[search] #list yok'); return; }
    const info = $('#resultInfo');
    const p = getParams();

    // Form senkronizasyonu
    const qEl = $('#f_q');     if (qEl)   qEl.value = p.q;
    const cEl = $('#f_cat');   if (cEl)   cEl.value = p.cat;
    const minEl = $('#f_min'); if (minEl) minEl.value = p.min_price || '';
    const maxEl = $('#f_max'); if (maxEl) maxEl.value = p.max_price || '';
    const cityEl = $('#f_city'); if (cityEl) cityEl.value = p.city || '';
    const rEl = $('#f_radius'); if (rEl) rEl.value = p.radius_km || '';
    const sortEl = $('#f_sort'); if (sortEl) sortEl.value = p.sort;

    const limit = p.size, offset = (p.page-1)*p.size;

    root.innerHTML = `<div class="pad">Yükleniyor…</div>`;
    if (info) info.textContent = 'Yükleniyor…';

    try{
      const res = await SafeAPI.search({
        q: p.q,
        cat: p.cat,
        min_price: p.min_price,
        max_price: p.max_price,
        city: p.city,                // sabit listeden
        lat: p.lat,
        lng: p.lng,
        radius_km: p.radius_km,
        sort: p.sort,
        limit, offset
      });

      const items = res?.listings || [];
      if (!items.length) {
        root.innerHTML = `<div class="empty">Sonuç bulunamadı.</div>`;
        if (info) info.textContent = '0 sonuç';
      } else {
        root.innerHTML = items.map(cardHTML).join('');
        if (info) info.textContent = `${items.length} sonuç (sayfa ${p.page})`;
        if (window.FAV) await FAV.wireFavButtons(root);
      }
      renderPager(items.length, p.page, p.size);
    }catch(e){
      console.error(e);
      root.innerHTML = `<div class="pad error">Liste alınamadı.</div>`;
      if (info) info.textContent = 'Hata';
    }
  }

  function wireUseMyLocation(){
    const btn = $('#btnUseMyLoc'); if (!btn) return;
    btn.onclick = ()=>{
      if (!navigator.geolocation) { alert('Tarayıcı konumu desteklemiyor.'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos)=>{
          const { latitude, longitude } = pos.coords || {};
          const latEl = $('#f_lat'), lngEl = $('#f_lng');
          if (latEl) latEl.value = String(latitude);
          if (lngEl) lngEl.value = String(longitude);
          const rEl = $('#f_radius'); if (rEl && !rEl.value) rEl.value = '50';
        },
        (err)=>{ console.warn('Geolocation hata', err); alert('Konum alınamadı.'); },
        { enableHighAccuracy:false, timeout:8000, maximumAge:60000 }
      );
    };
  }

  function wireApply(){
    const btn = $('#apply'); if (!btn) return;
    btn.onclick = ()=>{
      const p = getParams();
      const q   = ($('#f_q')||{}).value?.trim() || '';
      const cat = ($('#f_cat')||{}).value || '';
      const min = ($('#f_min')||{}).value ? String(Math.max(0, parseInt($('#f_min').value,10))) : '';
      const max = ($('#f_max')||{}).value ? String(Math.max(0, parseInt($('#f_max').value,10))) : '';
      const city= ($('#f_city')||{}).value || '';               // select’ten garantili değer
      const rad = ($('#f_radius')||{}).value ? String(Math.max(1, parseInt($('#f_radius').value,10))) : '';
      const lat = ($('#f_lat')||{}).value || '';
      const lng = ($('#f_lng')||{}).value || '';
      const sort= ($('#f_sort')||{}).value || 'newest';

      setParams({
        q, cat, min_price:min, max_price:max,
        city, radius_km: rad,
        lat: lat || '', lng: lng || '',
        sort, page:1, size: p.size
      });
      load();
    };
  }

  function wireSort(){
    const sel = $('#f_sort'); if (!sel) return;
    sel.onchange = ()=>{
      setParam('sort', sel.value || 'newest');
      setParam('page', 1);
      load();
    };
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    loadCategories();
    loadCitySelect();     // <<< yeni
    wireUseMyLocation();
    wireApply();
    wireSort();
    load();
  });
})();
