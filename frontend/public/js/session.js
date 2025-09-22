// public/js/session.js — header kullanıcı menüsü (tam sürüm)
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s, r = document) => r.querySelector(s);

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
      ...opts
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function getMe() {
    try {
      const d = await fetchJSON(`${API_BASE}/api/auth/me`);
      return d.user || null;
    } catch (e) { return null; }
  }

  function renderLoggedOut(nav) {
    nav.innerHTML = `
      <a class="btn" href="/register.html">Kayıt Ol</a>
      <a class="btn" href="/login.html">Giriş</a>
      <a class="btn primary" href="/sell.html">+ İlan Ver</a>
      <a class="badge-verified" href="/kyc.html">KYC</a>
    `;
  }

  function renderLoggedIn(nav, user) {
    const displayName = (user.full_name || user.email || 'Hesabım').split(' ')[0];
    const isVerified = user.is_kyc_verified || user.kyc_status === 'verified';

    const kyc = isVerified
      ? `<span class="badge-verified" title="KYC doğrulandı">✔︎</span>`
      : `<a class="badge-verified" href="/kyc.html" title="KYC doğrulama">KYC</a>`;

    // ▼ caret içeren buton + tam menü
    nav.innerHTML = `
      <div class="dropdown">
        <button class="btn user-btn" id="userMenuBtn" aria-haspopup="menu" aria-expanded="false">
          ${kyc}
          <span class="user-name">${displayName}</span>
          <span class="caret" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" focusable="false">
              <path d="M7 10l5 5 5-5z"></path>
            </svg>
          </span>
        </button>
        <div class="menu" role="menu" hidden>
          <a href="/profile.html" role="menuitem">Profil</a>
          <a href="/profile.html#edit" role="menuitem">Profil Düzenle</a>
          <a href="/messages.html#edit" role="menuitem">Mesajlarım</a>
          <a href="/profile.html#orders" role="menuitem">Siparişlerim</a>
          <a href="/my-listings.html" role="menuitem">İlanlarım</a>
          <a href="/favorites.html" role="menuitem">Favorilerim</a>
          <button id="logoutBtn" role="menuitem">Çıkış</button>
        </div>
      </div>
      <a class="btn primary" href="/sell.html">+ İlan Ver</a>
    `;

    // dropdown davranışı
    const btn = nav.querySelector('#userMenuBtn');
    const menu = nav.querySelector('.menu');

    const closeMenu = () => {
      if (!menu.hasAttribute('hidden')) {
        menu.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
      }
    };

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hasAttribute('hidden');
      menu.toggleAttribute('hidden', !willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    // logout
    nav.querySelector('#logoutBtn')?.addEventListener('click', async () => {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch {}
      location.reload();
    });
  }

  async function mount() {
    const nav = document.querySelector('header .usernav');
    if (!nav) return;
    const me = await getMe();
    if (me) renderLoggedIn(nav, me); else renderLoggedOut(nav);
  }

  function init() {
    // header zaten yüklüyse hemen
    if (document.querySelector('header .usernav')) {
      mount();
    }
    // partial yüklendiğinde tekrar
    document.addEventListener('partials:loaded', mount);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
