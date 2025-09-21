// frontend/public/js/fav.js
(function(){
  const API = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);

  function redirectToLogin(){
    const u = new URL('/login.html', location.origin);
    u.searchParams.set('redirect', location.pathname + location.search);
    location.href = u.toString();
  }

  // Kullanıcının favori set'i (lazy load, cache)
  let favSet = null; // Set<listing_id>

  async function getMyFavoritesSet(){
    if (favSet) return favSet;
    try{
      const res = await fetch(`${API}/api/favorites/my?page=1&size=500`, {
        credentials:'include', headers:{'Accept':'application/json'}
      });
      if (res.status === 401) return (favSet = new Set());
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      favSet = new Set((data.items || []).map(x => x.listing_id));
      return favSet;
    }catch{
      favSet = new Set();
      return favSet;
    }
  }

  function heartSVG(){
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path class="heart" d="M12 21s-6.7-4.35-9.33-7C.34 11.64.63 8.39 3 6.67A5.09 5.09 0 0 1 12 8a5.09 5.09 0 0 1 9-1.33C23.37 8.39 23.66 11.64 21.33 14 18.7 16.65 12 21 12 21z"/>
      </svg>`;
  }

  async function apiAddFav(listingId){
    return fetch(`${API}/api/favorites`, {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ listing_id: listingId })
    });
  }

  async function apiDelFav(listingId){
    return fetch(`${API}/api/favorites/${listingId}`, {
      method:'DELETE',
      credentials:'include',
      headers:{'Accept':'application/json'}
    });
  }

  async function toggleFavButton(btn){
    const listingId = Number(btn?.dataset?.listingId || 0);
    if (!listingId) return;

    const active = btn.classList.contains('active');

    // optimistic UI
    btn.disabled = true;
    btn.classList.toggle('active', !active);

    const countEl = btn.closest('.card, .listing')?.querySelector('.fav-count');
    const curr = countEl ? parseInt(countEl.textContent || '0', 10) || 0 : 0;
    if (countEl) countEl.textContent = String(active ? Math.max(0, curr-1) : curr+1);

    try{
      const res = active ? await apiDelFav(listingId) : await apiAddFav(listingId);
      if (res.status === 401) { redirectToLogin(); return; }
      if (!res.ok) throw new Error('HTTP '+res.status);

      const set = await getMyFavoritesSet();
      if (active) set.delete(listingId); else set.add(listingId);
    }catch(e){
      // geri al
      btn.classList.toggle('active', active);
      if (countEl) countEl.textContent = String(curr);
      console.error('[fav] toggle failed', e);
      alert('Favori işlemi yapılamadı. Lütfen tekrar deneyin.');
    }finally{
      btn.disabled = false;
    }
  }

  // Buton HTML'i
  function favButtonHTML(listingId, isActive=false){
    return `
      <button class="fav-btn ${isActive?'active':''}" data-listing-id="${listingId}" aria-pressed="${isActive?'true':'false'}" aria-label="Favoriye ekle">
        ${heartSVG()}
      </button>
    `;
  }

  // Kartlar basıldıktan sonra butonları hydrate et
  async function wireFavButtons(root=document){
    const set = await getMyFavoritesSet();
    root.querySelectorAll('.fav-btn[data-listing-id]').forEach(btn=>{
      const id = Number(btn.dataset.listingId || 0);
      if (id && set.has(id)) btn.classList.add('active');
      btn.onclick = (e)=>{ e.preventDefault(); toggleFavButton(btn); };
    });
  }

  window.FAV = { favButtonHTML, wireFavButtons, getMyFavoritesSet };
})();
