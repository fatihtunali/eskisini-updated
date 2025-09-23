// public/js/buy.js — her yerde 'Satın Al' için tek handler (delegation)
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  function toast(msg) {
    try { console.log('[toast]', msg); alert(msg); } catch {}
  }

  // Sunucu hata kodlarını kullanıcı dostu mesaja çevir
  function mapOrderError(codeOrMsg) {
    const c = String(codeOrMsg || '').toUpperCase();

    const TABLE = {
      // backend/routes/orders.js’te dönebilenler
      MISSING_LISTING_ID: 'Ürün bulunamadı.',
      LISTING_NOT_FOUND:  'İlan bulunamadı veya kaldırılmış.',
      INVALID_PRICE:      'İlan fiyatı geçersiz.',
      SELF_BUY_FORBIDDEN: 'Kendi ilanınızı satın alamazsınız.',
      UNAUTHORIZED:       'Oturum gerekli, lütfen giriş yapın.',
      SERVER_ERROR:       'Sunucu hatası. Lütfen tekrar deneyin.'
    };

    if (TABLE[c]) return TABLE[c];
    if (/^HTTP\s*401/.test(c)) return TABLE.UNAUTHORIZED;
    if (/^HTTP\s*4/.test(c))   return 'İstek hatalı görünüyor.';
    if (/^HTTP\s*5/.test(c))   return TABLE.SERVER_ERROR;
    return 'Sipariş oluşturulamadı.';
  }

  async function createOrder(listingId, qty = 1) {
    const r = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ listing_id: Number(listingId), qty: Number(qty) || 1 })
    });

    if (r.status === 401) {
      const next = location.pathname + location.search + location.hash;
      location.href = `/login.html?next=${encodeURIComponent(next)}`;
      return null;
    }

    let d = null;
    try { d = await r.json(); } catch { d = null; }

    if (!r.ok || !d || d.ok === false) {
      const code = d?.error || `HTTP ${r.status}`;
      throw new Error(code);
    }
    return d; // { ok:true, order_id, status:'pending', duplicate?:true }
  }

  function nearestListingId(el) {
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
      try {
        return new URL(a.getAttribute('href'), location.origin)
          .searchParams.get('id');
      } catch {}
    }

    // 4) detay sayfası ise URL'den
    const idFromUrl = new URL(location.href).searchParams.get('id');
    return idFromUrl || null;
  }

  // Delegated click: .btn-buy veya [data-buy]
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-buy, [data-buy]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const listingId = nearestListingId(btn);
    if (!listingId) { toast('Ürün ID bulunamadı.'); return; }

    btn.disabled = true;
    try {
      const qty = btn.dataset.qty || 1;
      const res = await createOrder(listingId, qty);
      if (!res) return; // login yönlendirmesi oldu

      // Not: backend duplicate pending sipariş varsa { duplicate:true } döndürebilir;
      // burada akışı değiştirmiyoruz—siparişler sayfasına gidelim.
      location.href = '/profile.html#orders';
    } catch (err) {
      console.error('[buy] createOrder error:', err);
      toast(mapOrderError(err.message || err));
    } finally {
      btn.disabled = false;
    }
  });

  // Detay sayfası butonunda eski inline onclick kalmışsa temizle
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnBuy');
    if (btn) btn.removeAttribute('onclick');
  });
})();
