// /frontend/public/js/listing.js 
// İlan detay sayfası için
//

(function(){
  const API = window.APP.API_BASE; // örn: http://localhost:3000
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const money = (minor, cur='TRY') => new Intl.NumberFormat('tr-TR',{style:'currency',currency:cur}).format((minor||0)/100);

  function getParams(){
    const u = new URL(location.href);
    return {
      q: u.searchParams.get('q') || '',
      cat: u.searchParams.get('cat') || '',
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

  function cardHTML(x){
    const img = x.cover || '/assets/placeholder.png';
    const href = `/listing.html?slug=${encodeURIComponent(x.slug)}`;
    const isSponsor  = x.premium_level === 'sponsor'  && (!x.premium_until || new Date(x.premium_until) > new Date());
    const isFeatured = x.premium_level === 'featured' && (!x.premium_until || new Date(x.premium_until) > new Date());
    const highlight  = !!x.highlight;

    return `
      <article class="card ${highlight?'highlight':''}">
        <div class="media">
          <a href="${href}"><img loading="lazy" src="${img}" alt="${esc(x.title)}"></a>
        </div>
        <div class="pad">
          <div class="badges">
            ${isSponsor  ? `<span class="badge badge--sponsor">SPONSORLU</span>` : ``}
            ${isFeatured ? `<span class="badge badge--featured">ÖNE ÇIKARILDI</span>` : ``}
          </div>
          <h3 class="title"><a href="${href}">${esc(x.title)}</a></h3>
          <div class="meta">
            ${x.location_city ? `<span class="city">${esc(x.location_city)}</span>`:''}
          </div>
          <div class="price">${money(x.price_minor, x.currency||'TRY')}</div>
          <a class="btn" href="${href}">Görüntüle</a>
        </div>
      </article>
    `;
  }

  async function load(){
    const root = document.getElementById('list');
    if (!root) {
      // sayfaya <div id="list" class="grid"></div> eklemeyi unutma
      return;
    }

    const { q, cat, page, size } = getParams();
    const limit = size;
    const offset = (page - 1) * size;

    root.innerHTML = `<div class="pad">Yükleniyor…</div>`;

    const url = new URL(`${API}/api/listings/search`);
    if (q)   url.searchParams.set('q', q);
    if (cat) url.searchParams.set('cat', cat);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    try{
      const res = await fetch(url, { credentials:'include', headers:{'Accept':'application/json'} });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const items = data.listings || [];

      if (!items.length) {
        root.innerHTML = `<div class="empty">Sonuç bulunamadı.</div>`;
      } else {
        root.innerHTML = items.map(cardHTML).join('');
      }

      renderPager(items.length, page, size);
    }catch(err){
      console.error(err);
      root.innerHTML = `<div class="pad error">Liste alınamadı.</div>`;
    }
  }

  function renderPager(count, page, size){
    const el = document.getElementById('pager');
    if (!el) return;
    // basit "ileri/geri" — sayfa başına veri varsa ileri göster
    const hasPrev = page > 1;
    const hasNext = count >= size;

    el.innerHTML = `
      <div class="pager">
        <button class="btn" data-act="prev" ${hasPrev?'':'disabled'}>‹ Önceki</button>
        <span class="page">Sayfa ${page}</span>
        <button class="btn" data-act="next" ${hasNext?'':'disabled'}>Sonraki ›</button>
      </div>
    `;

    el.onclick = (e)=>{
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      const { size } = getParams();
      if (act==='prev') setParam('page', Math.max(1, (parseInt(getParams().page)+ -1)));
      if (act==='next') setParam('page', (parseInt(getParams().page)+ 1));
      load();
    };
  }

  // ilk yükleme
  window.addEventListener('DOMContentLoaded', load);
  // arama kutun varsa, submit’te setParam('q', ...) yapıp load() çağır
})();
