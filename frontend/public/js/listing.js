// Partials
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  bootListing();
});

// Helpers
function attachImgFallback(rootEl) {
  rootEl.querySelectorAll('img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      img.src = 'assets/hero.png';
      img.removeAttribute('data-fallback');
    }, { once: true });
  });
}

const DEMO_USER_ID = 1; // login gelene kadar

async function bootListing(){
  const slug = new URLSearchParams(location.search).get('slug') || '';
  if (!slug) return;

  try {
    const { ok, listing, images } = await API.getListing(slug);
    if (!ok) return;

    // Başlık
    const h = document.getElementById('hTitle');
    if (h) h.textContent = listing.title;

    // Görsel
    const cover = images?.[0]?.file_url || 'assets/hero.jpg';

    // İçerik
    const detail = document.getElementById('detail');
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
    const fav   = document.getElementById('btnFav');
    const msg   = document.getElementById('btnMsg');
    const trade = document.getElementById('btnTrade');
    const buy   = document.getElementById('btnBuy');

    fav?.addEventListener('click', async () => {
      const r = await API.addFavorite(DEMO_USER_ID, listing.id);
      alert(r.ok ? 'Favorilere eklendi' : (r.error || 'Hata'));
    });
    msg?.addEventListener('click', async () => {
      const r = await API.startMessage({
        listing_id: listing.id, buyer_id: DEMO_USER_ID,
        seller_id: listing.seller_id, body: 'Merhaba, ilanla ilgileniyorum.'
      });
      alert(r.ok ? 'Mesaj başlatıldı' : (r.error || 'Hata'));
    });
    trade?.addEventListener('click', async () => {
      const t = prompt('Takas teklifin (kısa not):','Kendi eski ürünümü teklif ediyorum');
      if (t === null) return;
      const r = await API.makeTrade({
        listing_id: listing.id, offerer_id: DEMO_USER_ID,
        offered_text: t, cash_adjust_minor: 0
      });
      alert(r.ok ? 'Takas teklifi gönderildi' : (r.error || 'Hata'));
    });
    buy?.addEventListener('click', async () => {
      const r = await API.createOrder({ buyer_id: DEMO_USER_ID, listing_id: listing.id, qty: 1, shipping_minor: 0 });
      alert(r.ok ? ('Sipariş oluşturuldu #' + r.order_id) : (r.error || 'Hata'));
    });
  } catch (e){
    console.error(e);
  }
}
