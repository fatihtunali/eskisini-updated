// public/js/listing.js
// Partials bittikten sonra çalış
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
});

document.addEventListener('partials:loaded', bootListing);

// Helpers
const API_BASE = (window.APP && window.APP.API_BASE) || '';
const $ = (s,r=document)=>r.querySelector(s);

async function me(){
  try{
    const r = await fetch(`${API_BASE}/api/auth/me`, { credentials:'include', headers:{'Accept':'application/json'} });
    if (r.status === 401) return null;
    if (!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    return data.user || data;
  }catch{ return null; }
}
function redirectToLogin(){
  const u = new URL('/login.html', location.origin);
  u.searchParams.set('redirect', location.pathname + location.search);
  location.href = u.toString();
}
function attachImgFallback(rootEl) {
  rootEl.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      img.src = 'assets/hero.png';
      img.removeAttribute('data-fallback');
    }, { once: true });
  });
}

async function bootListing(){
  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (!slug) return;

  // İlanı getir
  let listing, images;
  try {
    const res = await API.getListing(slug);
    if (!res?.ok) return;
    listing = res.listing; images = res.images || [];
  } catch(e){ console.error(e); return; }

  // Başlık & içerik
  const h = $('#hTitle'); if (h) h.textContent = listing.title;
  const detail = $('#detail');
  const cover = images?.[0]?.file_url || 'assets/hero.jpg';
  detail.innerHTML = `
    <h2>${listing.title}</h2>
    <img class="cover" src="${cover}" alt="${listing.title}" data-fallback style="width:100%;max-width:800px;border-radius:12px">
    <p style="margin-top:12px">${listing.description_md || ''}</p>
    <div class="meta muted">
      <span><strong>${(listing.price_minor/100).toLocaleString('tr-TR')} ${listing.currency}</strong></span>
      <span> · ${listing.location_city || ''}</span>
    </div>
  `;
  attachImgFallback(detail);

  // Butonlar
  const btnBuy   = $('#btnBuy');
  const btnMsg   = $('#btnMsg');
  const btnTrade = $('#btnTrade');
  const btnFav   = $('#btnFav');

  // Kullanıcı durumu
  const user = await me();

  // Sahiplik kontrolü: ilan sahibiyse aksiyonları kilitle
  const isOwner = user && (user.id === listing.seller_id);
  if (isOwner) {
    btnBuy?.setAttribute('disabled','');
    btnMsg?.setAttribute('disabled','');
    btnTrade?.setAttribute('disabled','');
    btnFav?.removeAttribute('disabled'); // Favori bırakılabilir ama genelde anlamsız; istersen disable et
  }

  // Giriş yoksa: butonlar login’e götürsün
  function requireAuthOr(fn){
    return () => { if (!user) { redirectToLogin(); return; } fn(); };
  }

  // Favori
  btnFav?.addEventListener('click', requireAuthOr(async () => {
    try{
      // Backend /api/favorites POST user_id gerektiriyor → me.id gönder
      const r = await fetch(`${API_BASE}/api/favorites`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({ user_id: user.id, listing_id: listing.id })
      });
      const data = await r.json().catch(()=>({}));
      alert(data.ok ? 'Favorilere eklendi' : (data.error || 'Hata'));
    }catch(e){ alert('Hata'); }
  }));

  // Mesaj
  btnMsg?.addEventListener('click', requireAuthOr(async () => {
    if (isOwner) return;
    try{
      const r = await fetch(`${API_BASE}/api/messages/start`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({
          listing_id: listing.id,
          buyer_id: user.id,
          seller_id: listing.seller_id,
          body: 'Merhaba, ilanla ilgileniyorum.'
        })
      });
      const data = await r.json().catch(()=>({}));
      alert(data.ok ? 'Mesaj başlatıldı' : (data.error || 'Hata'));
    }catch(e){ alert('Hata'); }
  }));

  // Takas
  btnTrade?.addEventListener('click', requireAuthOr(async () => {
    if (isOwner) return;
    const note = prompt('Takas teklifin (kısa not):','Kendi eski ürünümü teklif ediyorum');
    if (note == null) return;
    try{
      const r = await fetch(`${API_BASE}/api/trade/offer`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({
          listing_id: listing.id,
          offerer_id: user.id,
          offered_text: note,
          cash_adjust_minor: 0
        })
      });
      const data = await r.json().catch(()=>({}));
      alert(data.ok ? 'Takas teklifi gönderildi' : (data.error || 'Hata'));
    }catch(e){ alert('Hata'); }
  }));

  // Satın Al
  btnBuy?.addEventListener('click', requireAuthOr(async () => {
    if (isOwner) return;
    try{
      const r = await fetch(`${API_BASE}/api/orders`, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({ buyer_id: user.id, listing_id: listing.id, qty: 1, shipping_minor: 0 })
      });
      const data = await r.json().catch(()=>({}));
      alert(data.ok ? ('Sipariş oluşturuldu #' + data.order_id) : (data.error || 'Hata'));
      // istersen sipariş sayfasına yönlendirebilirsin
      // location.href = '/profile.html?tab=orders';
    }catch(e){ alert('Hata'); }
  }));
}
