// public/js/header.js
(function(){
  const API = (window.APP && APP.API_BASE) || '';
  const noStore = { 'Accept':'application/json', 'Cache-Control':'no-store' };

  // Global guard: dosya iki kez yüklenirse
  if (window.__HDR_BOOTED__) return;
  window.__HDR_BOOTED__ = true;

  // 10 sn kimlik cache
  let meCache = { t: 0, v: null };
  async function whoami(){
    const now = Date.now();
    if (now - meCache.t < 10_000) return meCache.v;
    try{
      const r = await fetch(`${API}/api/auth/me`, { credentials:'include', headers:noStore, cache:'no-store' });
      if (!r.ok) { meCache = { t: now, v: null }; return null; }
      const d = await r.json();
      meCache = { t: now, v: d.user || d || null };
      return meCache.v;
    }catch{
      meCache = { t: now, v: null };
      return null;
    }
  }

  function wireSearch(){
    const form = document.getElementById('searchForm');
    if (!form) return;
    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const q = (document.getElementById('q')?.value || '').trim();
      const u = new URL('/index.html', location.origin);
      if (q) u.searchParams.set('q', q);
      location.href = u.toString();
    }, { once:true });
  }

  function show(el){ if (el) el.hidden = false; }
  function hide(el){ if (el) el.hidden = true; }

  async function bootHeader(){
    // Sayfa içinde ikinci kez çağrılırsa
    if (window.__HDR_INIT_DONE__) return;
    window.__HDR_INIT_DONE__ = true;

    wireSearch();

    const guestNav = document.getElementById('guestNav');
    const userNav  = document.getElementById('userNav');
    const navName  = document.getElementById('navName');
    const navKyc   = document.getElementById('navKyc');
    const btnLogout= document.getElementById('btnLogout');

    const bar = document.querySelector('.topbar');
    const me = await whoami();

    if (!me){
      bar?.classList.remove('auth');
      // misafir
      show(guestNav);
      hide(userNav);
      return;
    }

    // oturum açık
    bar?.classList.add('auth');
    hide(guestNav);
    show(userNav);

    if (navName) navName.textContent = me.full_name || me.email || 'Hesabım';
    if (navKyc){
      const ks = String(me.kyc_status || 'none').toLowerCase();
      navKyc.classList.remove('pending','verified','rejected','none');
      navKyc.classList.add(ks);
      navKyc.title = `KYC: ${ks}`;
    }

    // dropdown toggle
    const toggle = document.getElementById('userToggle');
    const userNavEl = document.getElementById('userNav');
    if (toggle && userNavEl){
      function closeMenu(){
        userNavEl.classList.remove('open');
        toggle.setAttribute('aria-expanded','false');
      }
      function openMenu(){
        userNavEl.classList.add('open');
        toggle.setAttribute('aria-expanded','true');
      }
      toggle.addEventListener('click', (e)=>{
        e.stopPropagation();
        const isOpen = userNavEl.classList.contains('open');
        isOpen ? closeMenu() : openMenu();
      });
      // dışarı tık / ESC kapat
      document.addEventListener('click', (e)=>{
        if (!userNavEl.contains(e.target) && e.target !== toggle) closeMenu();
      });
      document.addEventListener('keydown', (e)=>{
        if (e.key === 'Escape') closeMenu();
      });
    }

    // logout
    if (btnLogout){
      btnLogout.addEventListener('click', async (e)=>{
        e.preventDefault();
        try{
          await fetch(`${API}/api/auth/logout`, {
            method:'POST',
            credentials:'include',
            headers:{ 'Accept':'application/json' }
          });
        }catch{}
        // cookie siliniyor, ana sayfaya dön
        location.href = '/';
      }, { once:true });
    }
  }

  // Yalnız bir tetikleyici: partials varsa onu, yoksa DOMContentLoaded
  if (window.includePartials) {
    document.addEventListener('partials:loaded', bootHeader, { once:true });
  } else {
    window.addEventListener('DOMContentLoaded', bootHeader, { once:true });
  }
})();
