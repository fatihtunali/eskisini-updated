// public/js/session.js — header kullanıcı menüsü (geliştirilmiş tam sürüm)
(function () {
  'use strict';

  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $  = (s, r = document) => r.querySelector(s);

  // Küçük bir “me” cache’i: 10 sn
  let meCache = { t: 0, v: null };
  const NO_STORE = { 'Accept': 'application/json', 'Cache-Control': 'no-store' };

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { ...NO_STORE, ...(opts.headers || {}) },
      ...opts
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    try { return await r.json(); } catch { return {}; }
  }

  async function getMe(force = false) {
    const now = Date.now();
    if (!force && now - meCache.t < 10_000) return meCache.v;
    try {
      const d = await fetchJSON(`${API_BASE}/api/auth/me?_ts=${now}`);
      const user = d?.user || d || null;
      meCache = { t: now, v: user && user.id ? user : null };
      return meCache.v;
    } catch {
      meCache = { t: now, v: null };
      return null;
    }
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
    const isVerified  = !!(user.is_kyc_verified || user.kyc_status === 'verified');

    const kyc = isVerified
      ? `<span class="badge-verified" title="KYC doğrulandı">✔︎</span>`
      : `<a class="badge-verified" href="/kyc.html" title="KYC doğrulama">KYC</a>`;

    nav.innerHTML = `
      <div class="dropdown">
        <button class="btn user-btn" id="userMenuBtn" aria-haspopup="menu" aria-expanded="false">
          ${kyc}
          <span class="user-name">${displayName}</span>
          <span class="caret" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M7 10l5 5 5-5z"></path>
            </svg>
          </span>
        </button>
        <div class="menu" role="menu" hidden>
          <a href="/profile.html" role="menuitem">Profil</a>
          <a href="/profile.html?tab=edit" role="menuitem">Profil Düzenle</a>
          <a href="/messages.html" role="menuitem">Mesajlarım</a>
          <a href="/profile.html?tab=orders" role="menuitem">Siparişlerim</a>
          <a href="/my-listings.html" role="menuitem">İlanlarım</a>
          <a href="/favorites.html" role="menuitem">Favorilerim</a>
          <button id="logoutBtn" role="menuitem" type="button">Çıkış</button>
        </div>
      </div>
      <a class="btn primary" href="/sell.html">+ İlan Ver</a>
    `;

    // Dropdown davranışı
    const btn  = nav.querySelector('#userMenuBtn');
    const menu = nav.querySelector('.menu');

    const closeMenu = () => {
      if (!menu.hasAttribute('hidden')) {
        menu.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
      }
    };
    const openMenu = () => {
      menu.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
    };

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hasAttribute('hidden') ? openMenu() : closeMenu();
    });

    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    // Logout
    nav.querySelector('#logoutBtn')?.addEventListener('click', async () => {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch {}
      meCache = { t: 0, v: null };
      location.reload();
    });
  }

  async function mount(force = false) {
    const nav = document.querySelector('header .usernav');
    if (!nav) return;
    // Yükleniyor durumu (görsel sıçrama azaltma)
    nav.innerHTML = `<span class="muted small">Yükleniyor…</span>`;
    const me = await getMe(force);
    if (me) renderLoggedIn(nav, me); else renderLoggedOut(nav);
  }

  function init() {
    // Tekrar yüklenmeye karşı koruma
    if (window.__SESSION_BOOTED__) return;
    window.__SESSION_BOOTED__ = true;

    // Header zaten DOM'da ise
    if (document.querySelector('header .usernav')) {
      mount();
    }

    // Partials sonrası tekrar
    document.addEventListener('partials:loaded', () => mount());

    // Oturum değişimi olaylarıyla senkron
    document.addEventListener('auth:login', () => mount(true));
    document.addEventListener('auth:logout', () => mount(true));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
