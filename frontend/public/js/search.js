// frontend/public/js/search.js
(function(){
  const API = window.APP.API_BASE;
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
    try{
      const res = await fetch(`${API}/api/categories`, { headers:{'Accept':'application/json'} });
      if (!res.ok) return;
      const data = await res.json();
      const sel = $('#f_cat');
      (data.categories||[]).forEach(c=>{
        const opt = document.createElement('option');
        opt.value = c.slug; opt.textContent = c.name;
        sel.appendChild(opt);
      });
    }catch{}
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
      const { q, cat, min_price, max_price, sort, page:pg, size } = getParams();
      const next = b.dataset.act === 'next' ? pg+1 : Math.max(1, pg-1);
      setParams({ q, cat, min_price, max_price, sort, page: next, size });
      load();
    };
  }

  async function load(){
    const root = $('#list'); if(!root) return;
    const info = $('#resultInfo');
    const { q, cat, min_price, max_price, sort, page, size } = getParams();

    // Form alanlarını URL’yle senkronla
    $('#f_q').value   = q;
    $('#f_cat').value = cat;
    $('#f_min').value = min_price || '';
    $('#f_max').value = max_price || '';
    $('#f_sort').value= sort;

    const limit = size, offset = (page-1)*size;
    const url = new URL(`${API}/api/listings/search`);
    if (q)   url.searchParams.set('q', q);
    if (cat) url.searchParams.set('cat', cat);
    if (min_price) url.searchParams.set('min_price', String(Math.round(+min_price*100)));
    if (max_price) url.searchParams.set('max_price', String(Math.round(+max_price*100)));
    if (sort) url.searchParams.set('sort', sort);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    root.innerHTML = `<div class="pad">Yükleniyor…</div>`;
    info.textContent = 'Yükleniyor…';

    try{
      const res = await fetch(url, { headers:{'Accept':'application/json'}, credentials:'include' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const items = data.listings || [];

      if (!items.length) {
        root.innerHTML = `<div class="empty">Sonuç bulunamadı.</div>`;
        info.textContent = '0 sonuç';
      } else {
        root.innerHTML = items.map(cardHTML).join('');
        info.textContent = `${items.length} sonuç (sayfa ${page})`;
        if (window.FAV) await FAV.wireFavButtons(root);
      }
      renderPager(items.length, page, size);
    }catch(e){
      console.error(e);
      root.innerHTML = `<div class="pad error">Liste alınamadı.</div>`;
      info.textContent = 'Hata';
    }
  }

  // Sol panel “Uygula”
  document.addEventListener('DOMContentLoaded', ()=>{
    loadCategories();
    $('#apply').onclick = ()=>{
      const q   = $('#f_q').value.trim();
      const cat = $('#f_cat').value;
      const min = $('#f_min').value ? String(Math.max(0, parseInt($('#f_min').value,10))) : '';
      const max = $('#f_max').value ? String(Math.max(0, parseInt($('#f_max').value,10))) : '';
      const sort= $('#f_sort').value || 'newest';
      setParams({ q, cat, min_price:min, max_price:max, sort, page:1 });
      load();
    };
    $('#f_sort').onchange = ()=>{
      const p = getParams();
      setParam('sort', $('#f_sort').value || 'newest');
      setParam('page', 1);
      load();
    };
    load();
  });
})();
