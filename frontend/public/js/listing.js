// public/js/listing.js
(function(){
  const API = window.APP.API_BASE;
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

  // 🔧 Kart şablonu: data-listing-id + .btn-buy eklendi (overlay sorunlarını da azaltır)
  function cardHTML(x){
    const img = x.cover || '/assets/placeholder.png';
    const href = `/listing.html?slug=${encodeURIComponent(x.slug)}`;
    const isSponsor  = x.premium_level === 'sponsor'  && (!x.premium_until || new Date(x.premium_until) > new Date());
    const isFeatured = x.premium_level === 'featured' && (!x.premium_until || new Date(x.premium_until) > new Date());
    const highlight  = !!x.highlight;

    const favBtn = window.FAV ? FAV.favButtonHTML(x.id, false) : '';
    const favCount = Number.isFinite(x.favorites_count) ? x.favorites_count : 0;

    return `
      <article class="card product-card ${highlight?'highlight':''}" data-listing-id="${x.id}">
        <div class="media">
          <a class="thumb" href="${href}">
            <img loading="lazy" src="${img}" alt="${esc(x.title)}">
          </a>
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
          <div class="card-actions actions">
            <a class="btn" href="${href}">Görüntüle</a>
            <button class="btn btn-buy" type="button">Satın Al</button>
            <span class="fav-count">${favCount}</span>
            ${favBtn}
          </div>
        </div>
      </article>
    `;
  }

  async function load(){
    const root = document.getElementById('list');
    if (!root) return;

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
        if (window.FAV) await FAV.wireFavButtons(root);
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
      if (act==='prev') setParam('page', Math.max(1, page - 1));
      if (act==='next') setParam('page', page + 1);
      load();
    };
  }

  // Detay sayfasındaki #btnBuy için mevcut koruma (buy.js delegation zaten yakalıyor)
  (function(){
    const API = (window.APP && APP.API_BASE) || '';
    function toast(msg){ alert(msg); }
    async function createOrder(listingId){
      const r = await fetch(`${API}/api/orders`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({ listing_id: listingId })
      });
      if (r.status === 401) {
        location.href = `/login.html?redirect=${encodeURIComponent(location.pathname + location.search)}`;
        return null;
      }
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'ORDER_FAIL');
      return d;
    }
    document.addEventListener('DOMContentLoaded', ()=>{
      const btn = document.getElementById('btnBuy');
      const listingId = Number(new URL(location.href).searchParams.get('id')); // slug kullanıyorsak data-listing-id yoluna güveniyoruz
      if (!btn) return;
      btn.removeAttribute('onclick'); // inline onclick varsa kaldır
      if (!listingId) return;
      btn.addEventListener('click', async ()=>{
        btn.disabled = true;
        try{
          const res = await createOrder(listingId);
          if (!res) return;
          toast('Sipariş oluşturuldu.');
          location.href = '/profile.html#orders';
        }catch(e){
          console.error(e);
          toast('Sipariş oluşturulamadı.');
        }finally{
          btn.disabled = false;
        }
      });
    });
  })();


(async function(){
  if (typeof includePartials === 'function') includePartials();

  const API = window.APP.API_BASE;
  const $  = (s,r=document)=>r.querySelector(s);
  const esc= s => String(s??'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const money = (minor, cur='TRY') => new Intl.NumberFormat('tr-TR',{style:'currency',currency:cur}).format((minor||0)/100);

  const u = new URL(location.href);
  const slug = u.searchParams.get('slug');
  if (!slug) { location.href = '/'; return; }

  function toLogin() {
    location.href = `/login.html?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  }

  async function startConversation(listingId){
    const r = await fetch(`${API}/api/messages/start`, {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ listing_id: listingId }) // to_user_id gerekmiyor
    });
    if (r.status === 401) { toLogin(); return null; }
    const d = await r.json().catch(()=>({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'START_FAIL');
    return d.conversation_id;
  }

  function openThread(convId){
    // ayrı thread sayfan varsa:
    location.href = `/thread.html?id=${encodeURIComponent(convId)}`;
  }

  try{
    const res = await fetch(`${API}/api/listings/${encodeURIComponent(slug)}`, { headers:{'Accept':'application/json'} });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if (!data?.ok) throw new Error('not_ok');

    const L = data.listing;
    const imgs = data.images || [];
    $('#title').textContent = L.title || '';
    $('#meta').textContent  = [L.category_name, L.location_city].filter(Boolean).join(' • ');
    $('#price').textContent = money(L.price_minor, L.currency || 'TRY');
    $('#desc').innerHTML    = `<pre style="white-space:pre-wrap">${esc(L.description_md||'')}</pre>`;
    $('#img').src           = (imgs[0]?.file_url) || '/assets/placeholder.png';

    // Favori hydrate
    const favBtn = $('#favBtn');
    const favCount = $('#favCount');
    favBtn.dataset.listingId = L.id;
    favCount.textContent = String(L.favorites_count ?? 0);
    if (window.FAV) await FAV.wireFavButtons(document);

    // Satıcıya Mesaj
    const msgBtn = $('#msgBtn');
    if (msgBtn) {
      msgBtn.addEventListener('click', async ()=>{
        msgBtn.disabled = true;
        try{
          const convId = await startConversation(L.id);
          if (!convId) return; // login yönlendirmesi
          openThread(convId);
        }catch(e){
          console.error(e);
          alert('Mesaj başlatılamadı.');
        }finally{
          msgBtn.disabled = false;
        }
      });
    }
  }catch(e){
    console.error(e);
    $('#detail').innerHTML = `<div class="pad error">İlan bulunamadı.</div>`;
  }
})();



  window.addEventListener('DOMContentLoaded', load);
})();
console.log('[LISTING] script loaded');
