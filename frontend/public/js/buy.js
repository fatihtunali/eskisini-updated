// public/js/buy.js — her yerde 'Satın Al' için tek handler (delegation)
(function(){
  const API = (window.APP && APP.API_BASE) || '';

  function toast(msg){ try{ console.log('[toast]', msg); alert(msg); }catch{} }

  async function createOrder(listingId, qty=1){
    const r = await fetch(`${API}/api/orders`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ listing_id: Number(listingId), qty: Number(qty)||1 })
    });
    if (r.status === 401) {
      const next = location.pathname + location.search + location.hash;
      location.href = `/login.html?redirect=${encodeURIComponent(next)}`;
      return null;
    }
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'ORDER_FAIL');
    return d;
  }

  function nearestListingId(el){
    // 1) en yakın data-listing-id
    const host = el.closest('[data-listing-id]');
    if (host?.dataset?.listingId) return host.dataset.listingId;

    // 2) butonun kendi data'sı
    if (el.dataset?.listingId) return el.dataset.listingId;
    if (el.dataset?.id) return el.dataset.id;

    // 3) kart içindeki linkten ?id= yakala (slug yoksa)
    const a = el.closest('article, .card, li, div')?.querySelector('a[href*="listing.html?id="]')
            || el.closest('a[href*="listing.html?id="]');
    if (a) {
      try { return new URL(a.getAttribute('href'), location.origin).searchParams.get('id'); }
      catch {}
    }

    // 4) detay sayfası ise URL'den
    const idFromUrl = new URL(location.href).searchParams.get('id');
    return idFromUrl || null;
  }

  // Delegated click: .btn-buy veya [data-buy]
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.btn-buy, [data-buy]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const listingId = nearestListingId(btn);
    if (!listingId) { toast('Ürün ID bulunamadı.'); return; }

    btn.disabled = true;
    try{
      const qty = btn.dataset.qty || 1;
      const res = await createOrder(listingId, qty);
      if (!res) return; // login'e yönlendirildi
      location.href = '/profile.html#orders';
    }catch(err){
      console.error(err);
      toast('Sipariş oluşturulamadı.');
    }finally{
      btn.disabled = false;
    }
  });

  // Detay sayfası butonunda eski inline onclick kalmışsa temizle
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('btnBuy');
    if (btn) btn.removeAttribute('onclick');
  });
})();
