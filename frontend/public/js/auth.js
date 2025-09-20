/* auth.js — header’ı login durumuna göre günceller, login/logout akışını bağlar. */
(function () {
  'use strict';

  // ------- Config -------
  const API_BASE =
    (window.APP && window.APP.API_BASE) ||
    window.API_BASE ||
    '';

  // ------- Helpers -------
  function setErr(el, msg){ if(!el) return; el.textContent = msg||''; el.hidden = !msg; }
  const sanitize = (s='') => String(s).replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]));

  async function fetchMe(){
    try{
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if(res.status === 401 || res.status === 403) return null;
      if(!res.ok) return null;
      const data = await res.json().catch(()=>null);
      return data && (data.user || (data.ok && data)) ? (data.user || data) : null;
    }catch(_){ return null; }
  }

  function kycBadge(kyc){
    const st = (kyc||'').toString().toLowerCase();
    if (st === 'approved' || st === 'verified' || st === '1' || st === 'ok') return '<div class="badge-verified" title="KYC Doğrulandı">KYC✓</div>';
    if (st === 'pending') return '<div class="badge-verified" title="KYC Beklemede">KYC…</div>';
    return '<div class="badge-verified" title="KYC Gerekli">KYC</div>';
  }

  function initials(name, email){
    const n = (name||'').trim() || (email||'').split('@')[0] || 'U';
    return n.split(/\s+/).slice(0,2).map(p => p[0]?.toUpperCase()||'').join('') || 'U';
  }

  function renderUserNav(user){
    const displayName = user?.full_name || user?.name || user?.email || 'Hesabım';
    const inits = initials(user?.full_name||user?.name, user?.email);
    const safeName = sanitize(displayName);
    return `
      <a class="btn-ghost" href="/sell.html">+ İlan Ver / Takas</a>
      <div class="user-menu">
        <button class="user-chip" id="userChip" aria-haspopup="true" aria-expanded="false" data-bound="0">
          <span class="avatar" aria-hidden="true">${inits}</span>
          <span class="uname">${safeName}</span>
        </button>
        <ul class="dropdown" id="userDropdown" hidden>
          <li><a href="/profile.html">Profilim</a></li>
          <li><a href="/profile.html?tab=edit">Profil Düzenle</a></li>
          <li><a href="/my-listings.html">İlanlarım</a></li>
          <li><a href="/profile.html?tab=orders">Siparişlerim</a></li>
          <li><a href="/messages.html">Mesajlarım</a></li>
          <li><a href="/favorites.html">Favorilerim</a></li>
          <li><button type="button" id="btnLogout" class="as-link" data-bound="0">Çıkış Yap</button></li>
        </ul>
      </div>
      ${kycBadge(user?.kyc_status)}
    `;
  }

  function renderGuestNav(){
    return `
      <a class="btn-ghost" href="/sell.html">+ İlan Ver / Takas</a>
      <a class="btn-ghost" href="/login.html">Giriş</a>
      <a class="btn-ghost" href="/register.html">Kayıt Ol</a>
      <div class="badge-verified" title="KYC Durumu">KYC</div>
    `;
  }

  function bindUserMenu(root){
    const chip = root.querySelector('#userChip');
    const dd   = root.querySelector('#userDropdown');
    if(!chip || !dd) return;

    if(chip.dataset.bound === '1') return; // tekrar bağlama
    chip.dataset.bound = '1';

    const close = () => { dd.hidden = true; chip.setAttribute('aria-expanded','false'); };

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = dd.hidden;
      dd.hidden = !willOpen;
      chip.setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', (e) => {
      // dropdown dışına tıklama
      if(!root.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape') close();
    });
  }

  async function logout(){
    try {
      const res = await fetch(`${API_BASE}/api/auth/logout`, { method:'POST', credentials:'include' });
      if(!res.ok){
        // bazı proxy’lerde sadece GET açık olabilir
        await fetch(`${API_BASE}/api/auth/logout`, { method:'GET', credentials:'include' }).catch(()=>{});
      }
    } catch(_) {}
    try { localStorage.removeItem('authUser'); } catch(_){}
    document.dispatchEvent(new CustomEvent('auth:logout'));
    hydrateHeader(); // bulunduğun sayfada anında güncelle
  }

  async function ensureNav(maxWaitMs = 6000){
    const t0 = performance.now();
    while(performance.now() - t0 < maxWaitMs){
      const nav = document.querySelector('.usernav');
      if(nav) return nav;
      // partials henüz gelmemiş olabilir
      await new Promise(r => setTimeout(r, 60));
    }
    return null;
  }

  async function hydrateHeader(){
    const nav = await ensureNav();
    if(!nav) return; // header partial hiç yoksa sessiz çık

    const user = await fetchMe();
    if(user){
      nav.setAttribute('data-state','auth');
      nav.innerHTML = renderUserNav(user);
      bindUserMenu(nav);
      const btn = nav.querySelector('#btnLogout');
      if(btn && btn.dataset.bound !== '1'){
        btn.addEventListener('click', logout, { passive:true });
        btn.dataset.bound = '1';
      }
    } else {
      nav.setAttribute('data-state','guest');
      nav.innerHTML = renderGuestNav();
    }
  }

  // Global küçük API: başka yerden manüel refresh isteyebil
  window.Auth = Object.assign(window.Auth || {}, {
    refreshHeader: hydrateHeader,
    me: fetchMe,
    logout
  });

  // Header’ı tüm durumlarda güncel tut
  document.addEventListener('DOMContentLoaded', hydrateHeader);
  document.addEventListener('partials:loaded', hydrateHeader);
  document.addEventListener('auth:login', hydrateHeader);
  document.addEventListener('auth:logout', hydrateHeader);

  // ------------------------ Login form submit ------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('f');
    if(!form) return;

    let err = form.querySelector('.form-error');
    if(!err){
      err = document.createElement('div');
      err.className = 'form-error';
      err.setAttribute('role','alert');
      err.style.cssText = 'margin:8px 0;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;padding:8px;border-radius:8px;';
      err.hidden = true;
      form.insertBefore(err, form.firstChild.nextSibling);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr(err, '');

      const fd = new FormData(form);
      const email = (fd.get('email')||'').trim();
      const password = (fd.get('password')||'').trim();
      if(!email || !password){
        setErr(err, 'E-posta ve şifre gerekli.');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email, password }),
          credentials: 'include'
        });
        const data = await res.json().catch(()=>({}));

        if(!res.ok || data?.ok === false){
          setErr(err, data?.message || 'Giriş başarısız. Bilgileri kontrol edin.');
          return;
        }

        // Başarılı → header’ı şimdiden hydrate et (redirect öncesi de menü güncellensin)
        document.dispatchEvent(new CustomEvent('auth:login', { detail: { user: data.user } }));

        const u = new URL(location.href);
        const redirect = u.searchParams.get('redirect') || '/';
        location.href = redirect;
      } catch {
        setErr(err, 'Ağ hatası. Tekrar deneyin.');
      }
    });
  });
})();

