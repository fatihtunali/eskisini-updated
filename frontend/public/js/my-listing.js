// public/js/my-listings.js
(function(){
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);
  let page=1, size=12, total=0;

  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, m =>
    m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' :
    m === '"' ? '&quot;' : m === "'" ? '&#39;' : '&#96;'
  );

  const fmt = (minorOrMajor, currency='TRY', isMinorGuess=true) => {
    let v = Number(minorOrMajor)||0;
    if (isMinorGuess) v = v/100; // kuruştan TL
    return `${v.toLocaleString('tr-TR',{maximumFractionDigits:2})} ${esc(currency)}`;
  };

  async function requireLogin(){
    try{
      const r=await fetch(`${API_BASE}/api/auth/me`, {credentials:'include', headers:{'Accept':'application/json'}});
      if(!r.ok) throw 0;
      const d=await r.json(); return d.user||d;
    }catch{
      const u=new URL('/login.html', location.origin);
      u.searchParams.set('redirect', location.pathname+location.search);
      location.href=u.toString();
      throw new Error('not-authenticated');
    }
  }

  function card(x){
    const img = x.thumb_url || x.cover || '/assets/placeholder.png';
    const priceDisplay = (typeof x.price_minor === 'number')
      ? fmt(x.price_minor, x.currency||'TRY', true)
      : fmt(x.price,       x.currency||'TRY', false);

    const viewHref = x.slug
      ? `/listing.html?slug=${encodeURIComponent(x.slug)}`
      : `/listing.html?id=${encodeURIComponent(x.id)}`;

    return `<article class="card">
      <img src="${img}" alt="" onerror="this.src='/assets/placeholder.png';this.onerror=null">
      <div class="pad">
        <h3>${esc(x.title||'')}</h3>
        <p class="muted">${esc(x.category_name||'')}</p>
        <div class="price">${priceDisplay}</div>
        <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="${viewHref}">Görüntüle</a>
          <a class="btn ghost" href="/sell.html?edit=${encodeURIComponent(x.id)}">Düzenle</a>
        </div>
      </div>
    </article>`;
  }

  async function load(){
    await requireLogin();

    const box = $('#listings');
    if (!box) return;
    box.innerHTML = `<div class="pad">Yükleniyor…</div>`;

    try{
      const url = new URL('/api/listings/my', API_BASE);
      url.searchParams.set('page', page);
      url.searchParams.set('size', size);

      const r = await fetch(url.toString(), { credentials:'include', headers:{'Accept':'application/json'} });
      const data = await r.json().catch(()=>({}));
      if(!r.ok){ box.innerHTML = `<div class="pad error">İlanlar alınamadı (HTTP ${r.status}).</div>`; return; }

      const rows = data.items || [];
      total = Number(data.total||0);

      box.innerHTML = rows.length
        ? rows.map(card).join('')
        : `<div class="empty">Henüz ilanınız yok.<div style="margin-top:8px"><a class="btn primary" href="/sell.html">+ Yeni İlan Ver</a></div></div>`;

      const pinfo=$('#pinfo'); if (pinfo) pinfo.textContent = `Sayfa ${page} — Toplam ${total}`;
      const prev=$('#prev');   if (prev)  prev.disabled = page<=1;
      const next=$('#next');   if (next)  next.disabled = (page*size)>=total;

    }catch(e){
      console.error(e);
      box.innerHTML = `<div class="pad error">Bir hata oluştu.</div>`;
    }
  }

  function wirePager(){
    const prev=$('#prev'), next=$('#next');
    if (prev && !prev.dataset.bound) {
      prev.dataset.bound='1';
      prev.addEventListener('click', ()=>{ if(page>1){ page--; load(); }});
    }
    if (next && !next.dataset.bound) {
      next.dataset.bound='1';
      next.addEventListener('click', ()=>{ if(page*size<total){ page++; load(); }});
    }
  }

  function boot(){
    if (!$('#listings')) return;
    wirePager();
    load();
  }

  // partials kullandığın için, partials:loaded’ı dinle
  document.addEventListener('partials:loaded', boot);
  // partials kullanılmasa da garanti için:
  window.addEventListener('DOMContentLoaded', boot);
})();
