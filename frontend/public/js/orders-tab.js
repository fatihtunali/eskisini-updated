// public/js/orders-tab.js
(function(){
  const API = (window.APP && APP.API_BASE) || '';

  const toTL = (minor, cur='TRY') => {
    const v = (Number(minor)||0) / 100;
    try { return v.toLocaleString('tr-TR', { style:'currency', currency: cur || 'TRY' }); }
    catch { return `${v.toLocaleString('tr-TR')} ${cur||'TRY'}`; }
  };

  const pickThumb = (o) => {
    const t = o.thumb_url || o.thumb || '';
    if (!t) return '/assets/products/p1.svg';
    if (/^https?:\/\//i.test(t) || t.startsWith('/')) return t;
    return `/uploads/${t}`;
  };

  function buildLink(o){
    if (o.slug) return `/listing.html?slug=${encodeURIComponent(o.slug)}`;
    return `/listing.html?id=${o.listing_id}`;
  }

  async function fetchMine(){
    const r = await fetch(`${API}/api/orders/mine`, {
      credentials:'include', headers:{'Accept':'application/json'}
    });
    if (r.status === 401) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
      return [];
    }
    const d = await r.json().catch(()=>({ok:false,orders:[]}));
    return d.ok ? (d.orders || []) : [];
  }

  function render(rows){
    const table = document.getElementById('ordersTable');
    const tbody = table ? table.querySelector('tbody') : null;
    const empty = document.getElementById('ordersEmpty');
    if (!table || !tbody) return;

    tbody.innerHTML = '';

    if (!rows.length){
      if (empty) empty.hidden = false;
      table.style.display = 'none';
      return;
    }

    if (empty) empty.hidden = true;
    table.style.display = '';

    for (const o of rows){
      const tr = document.createElement('tr');

      // Ürün
      const tdProd = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='10px';
      const img = document.createElement('img');
      img.src = pickThumb(o);
      img.alt = '';
      img.style.width='56px'; img.style.height='56px';
      img.style.objectFit='cover'; img.style.borderRadius='8px';
      const a = document.createElement('a');
      a.href = buildLink(o);
      a.textContent = o.title || `#${o.listing_id}`;
      wrap.append(img,a); tdProd.append(wrap);

      // Fiyat (toplam)
      const tdPrice = document.createElement('td');
      tdPrice.textContent = toTL(o.total_minor ?? (o.unit_price_minor * (o.qty || 1)), o.currency);

      // Durum
      const tdStatus = document.createElement('td');
      tdStatus.textContent = o.status;

      // Tarih
      const tdDate = document.createElement('td');
      tdDate.textContent = new Date(o.created_at).toLocaleString('tr-TR');

      tr.append(tdProd, tdPrice, tdStatus, tdDate);
      tbody.append(tr);
    }
  }

  async function boot(){
    // “Satın Al” akışından #orders ile geliyoruz; yine de mount varsa çalıştır.
    if (!document.getElementById('ordersMount')) return;
    const rows = await fetchMine();
    render(rows);
  }

  window.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('hashchange', ()=>{
    if ((location.hash || '#orders') === '#orders') boot();
  });
})();
