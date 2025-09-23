// public/js/listing.js
(function () {
  const API = (window.APP && window.APP.API_BASE) || '';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---- utils
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => (
    m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : m === '"' ? '&quot;' : m
  ));
  const money = (minor, cur = 'TRY') =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur }).format((Number(minor) || 0) / 100);

  function getParams() {
    const u = new URL(location.href);
    return {
      slug: u.searchParams.get('slug') || '',
      q:    u.searchParams.get('q') || '',
      cat:  u.searchParams.get('cat') || '',
      page: Math.max(1, parseInt(u.searchParams.get('page') || '1', 10)),
      size: Math.min(50, Math.max(1, parseInt(u.searchParams.get('size') || '24', 10)))
    };
  }
  function setParam(name, value) {
    const u = new URL(location.href);
    if (value == null || value === '') u.searchParams.delete(name);
    else u.searchParams.set(name, String(value));
    history.replaceState(null, '', u.toString());
  }

  // ---- ortak: favori butonu kablolama (varsa)
  async function hydrateFavButtons(root = document) {
    if (window.FAV?.wireFavButtons) await FAV.wireFavButtons(root);
  }

  // =========================================================
  // =                     LISTE MODU                        =
  // =========================================================
  function cardHTML(x) {
    const href = `listing.html?slug=${encodeURIComponent(x.slug)}`;
    const img  = x.cover || '/assets/placeholder.png';

    const isSponsor  = x.premium_level === 'sponsor'  && (!x.premium_until || new Date(x.premium_until) > new Date());
    const isFeatured = x.premium_level === 'featured' && (!x.premium_until || new Date(x.premium_until) > new Date());
    const highlight  = !!x.highlight;

    const favBtn   = window.FAV ? FAV.favButtonHTML(x.id, false) : '';
    const favCount = Number.isFinite(x.favorites_count) ? x.favorites_count : 0;

    return `
      <article class="card product-card ${highlight ? 'highlight' : ''}" data-listing-id="${x.id}">
        <div class="media">
          <a class="thumb" href="${href}">
            <img loading="lazy" src="${img}" alt="${esc(x.title)}">
          </a>
        </div>
        <div class="pad">
          <div class="badges">
            ${isSponsor  ? `<span class="badge badge--sponsor">SPONSORLU</span>`   : ``}
            ${isFeatured ? `<span class="badge badge--featured">ÖNE ÇIKARILDI</span>` : ``}
          </div>
          <h3 class="title"><a href="${href}">${esc(x.title)}</a></h3>
          <div class="meta">${x.location_city ? `<span class="city">${esc(x.location_city)}</span>` : ''}</div>
          <div class="price">${money(x.price_minor, x.currency || 'TRY')}</div>
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

  function renderPager(count, page, size) {
    const el = $('#pager');
    if (!el) return;
    const hasPrev = page > 1;
    const hasNext = count >= size;

    el.innerHTML = `
      <div class="pager">
        <button class="btn" data-act="prev" ${hasPrev ? '' : 'disabled'}>‹ Önceki</button>
        <span class="page">Sayfa ${page}</span>
        <button class="btn" data-act="next" ${hasNext ? '' : 'disabled'}>Sonraki ›</button>
      </div>
    `;

    el.onclick = (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'prev') setParam('page', Math.max(1, page - 1));
      if (act === 'next') setParam('page', page + 1);
      loadList(); // yeniden yükle
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
        location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
        return null;
      }
      throw e;
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
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
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

  async function loadDetail() {
    const { slug } = getParams();
    const detailRoot = $('#detail');
    if (!slug || !detailRoot) return;

    try {
      const data = await (window.API && window.API.listings
        ? window.API.listings.detail(slug)
        : (async () => {
            const res = await fetch(`${API}/api/listings/${encodeURIComponent(slug)}`, {
              headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })()
      );
      
      if (!data?.ok) throw new Error('not_ok');

      const L    = data.listing;
      const imgs = data.images || [];

      $('#title') && ($('#title').textContent = L.title || '');
      $('#meta')  && ($('#meta').textContent  = [L.category_name, L.location_city].filter(Boolean).join(' • '));
      $('#price') && ($('#price').textContent = money(L.price_minor, L.currency || 'TRY'));
      $('#desc')  && ($('#desc').innerHTML    = `<pre style="white-space:pre-wrap">${esc(L.description_md || '')}</pre>`);
      $('#img')   && ($('#img').src           = (imgs[0]?.file_url) || '/assets/placeholder.png');

      // Favori hydrate
      const favBtn   = $('#favBtn');
      const favCount = $('#favCount');
      if (favBtn) favBtn.dataset.listingId = L.id;
      if (favCount) favCount.textContent = String(L.favorites_count ?? 0);
      await hydrateFavButtons(document);

      // Mesaj
      const msgBtn = $('#msgBtn');
      if (msgBtn) {
        msgBtn.addEventListener('click', async () => {
          msgBtn.disabled = true;
          try {
            const convId = await startConversation(L.id /*, opsiyonel to_user_id */);
            if (!convId) return; // login'e yönlendirildi
            openThread(convId);
          } catch (e) {
            console.error(e);
            alert('Mesaj başlatılamadı.');
          } finally {
            msgBtn.disabled = false;
          }
        });
      }

      // Detay sayfasındaki "Satın Al" (buy.js delegation da yakalar; yine de koruma)
      const buyBtn = $('#btnBuy');
      if (buyBtn) {
        buyBtn.removeAttribute('onclick'); // inline varsa temizle
        // listing id querystring'le gelmiyor olabilir; buy.js getiremeyebilir
        // bu sayfada doğrudan slug var, buy.js getiremeyebilir; bu yüzden data-listing-id ekleyelim:
        detailRoot.setAttribute('data-listing-id', String(L.id));
      }
    } catch (e) {
      console.error(e);
      detailRoot.innerHTML = `<div class="pad error">İlan bulunamadı.</div>`;
    }
  }

  // =========================================================
  // =                       BOOT                            =
  // =========================================================
  async function boot() {
    // Partials varsa önce yükleyelim
    if (typeof includePartials === 'function') includePartials();

    const { slug } = getParams();

    if (slug) {
      await loadDetail();
    } else {
      await loadList();
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();