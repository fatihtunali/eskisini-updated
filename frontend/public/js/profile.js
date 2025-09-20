// frontend/public/js/profile.js
(function(){
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);

  const htmlEscape = (s)=> (s??'').toString()
    .replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));

  function getTab(){
    const p = new URLSearchParams(location.search);
    return p.get('tab') || 'overview';
  }
  function setActive(tab){
    document.querySelectorAll('#tabs a')
      .forEach(a=>a.classList.toggle('active', a?.dataset?.tab===tab));
  }

  function redirectToLogin(){
    const u = new URL('/login.html', location.origin);
    u.searchParams.set('redirect', location.pathname + location.search);
    location.href = u.toString();
  }

  async function fetchJSON(url, opts={}){
    const r = await fetch(url, { credentials:'include', headers:{'Accept':'application/json'}, ...opts });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }

  async function requireLogin(){
    try{
      const r = await fetch(`${API_BASE}/api/auth/me`, {
        credentials:'include', headers:{'Accept':'application/json'}
      });
      if(!r.ok) throw 0;
      const d = await r.json();
      return d.user || d;
    }catch{
      redirectToLogin();
      throw new Error('not-authenticated');
    }
  }

  // ---- OVERVIEW
  async function renderOverview(root){
    if (!root) return;
    root.innerHTML = `<div class="pad">Yükleniyor…</div>`;
    try{
      const me = await fetchJSON(`${API_BASE}/api/auth/me`);
      const u = me.user || me;
      root.innerHTML = `
        <div class="grid two section-gap">
          <div class="card">
            <div class="pad">
              <h3>Profil</h3>
              <div class="muted small">Hızlı özet</div>
            </div>
            <div class="pad">
              <div><b>Ad Soyad:</b> ${htmlEscape(u.full_name || '-')}</div>
              <div><b>E-posta:</b> ${htmlEscape(u.email || '-')}</div>
              <div><b>Telefon:</b> ${htmlEscape(u.phone_e164 || '-')}</div>
              <div><b>KYC:</b> ${htmlEscape(u.kyc_status || 'none')}</div>
            </div>
            <div class="pad" style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn" href="?tab=edit">Profili Düzenle</a>
              <a class="btn ghost" href="/my-listings.html">İlanlarım</a>
            </div>
          </div>

          <div class="card">
            <div class="pad"><h3>Hızlı İşlemler</h3></div>
            <div class="pad" style="display:flex;gap:8px;flex-wrap:wrap">
              <a class="btn" href="/sell.html">+ Yeni İlan</a>
              <a class="btn" href="/favorites.html">Favorilerim</a>
              <a class="btn" href="?tab=orders">Siparişlerim</a>
              <a class="btn" href="/messages.html">Mesajlarım</a>
            </div>
          </div>
        </div>
      `;
    }catch{
      root.innerHTML = `<div class="pad error">Bilgiler alınamadı.</div>`;
    }
  }

  // ---- EDIT
  async function renderEdit(root){
    if (!root) return;
    root.innerHTML = `
      <form id="pf" class="card pad form" novalidate>
        <h3>Profil Düzenle</h3>

        <label class="field">
          <span>Ad Soyad</span>
          <input name="full_name" required>
          <small class="hint">Profilinizde görünecek ad</small>
        </label>

        <label class="field">
          <span>Telefon (E.164)</span>
          <input name="phone_e164" placeholder="+90555...">
          <small class="hint">Örn: +905551112233</small>
        </label>

        <div style="display:flex; gap:8px; align-items:center">
          <button id="btnSave" class="btn primary" type="submit">Kaydet</button>
          <span id="msg" class="muted"></span>
        </div>
      </form>
    `;

    try{
      const me = await fetchJSON(`${API_BASE}/api/auth/me`);
      const u = me.user || me;
      $('#pf [name="full_name"]').value  = u.full_name  || '';
      $('#pf [name="phone_e164"]').value = u.phone_e164 || '';
    }catch{}

    let busy = false;
    $('#pf')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (busy) return;
      busy = true;
      const btn = $('#btnSave'); if (btn) btn.disabled = true;
      const msg = $('#msg');     if (msg) msg.textContent = 'Kaydediliyor…';

      const fd = new FormData(e.currentTarget);
      const full_name = (fd.get('full_name')||'').toString().trim();
      let phone_e164  = (fd.get('phone_e164')||'').toString().trim();
      phone_e164 = phone_e164 ? phone_e164.replace(/[\s\-()]/g,'') : null;

      if (!full_name) {
        if (msg) msg.textContent = 'Ad Soyad zorunlu.';
        if (btn) btn.disabled = false;
        busy = false; return;
      }

      try{
        const r = await fetch(`${API_BASE}/api/users/profile`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify({ full_name, phone_e164 })
        });
        const data = await r.json().catch(()=>({}));
        if (!r.ok || data.ok===false) throw new Error(data.message||'Kaydedilemedi');

        if (msg) msg.textContent = 'Kaydedildi ✓';
        document.dispatchEvent(new Event('auth:login')); // header güncellensin
      }catch{
        if (msg) msg.textContent = 'Kaydedilemedi';
      } finally {
        if (btn) btn.disabled = false;
        busy = false;
      }
    });
  }

  // ---- ORDERS
  async function renderOrders(root){
    if (!root) return;
    root.innerHTML = `<div class="pad">Siparişler yükleniyor…</div>`;
    try{
      const data = await fetchJSON(`${API_BASE}/api/orders/my`);
      const list = data.orders || [];
      if(!list.length){
        root.innerHTML = `<div class="empty">Henüz siparişiniz yok.</div>`;
        return;
      }
      const rows = list.map(o=>{
        const created = o.created_at ? new Date(o.created_at).toLocaleString('tr-TR') : '-';
        const hasMinor = typeof o.total_minor === 'number';
        const tl = hasMinor ? (o.total_minor/100) : Number(o.total_amount||0);
        const priceStr = `${tl.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
        return `
          <div class="t-row">
            <div>${htmlEscape(o.id)}</div>
            <div>${htmlEscape(created)}</div>
            <div>${priceStr}</div>
            <div>${htmlEscape(o.status || '-')}</div>
          </div>`;
      }).join('');
      root.innerHTML = `
        <div class="table">
          <div class="t-head"><div>#</div><div>Tarih</div><div>Tutar</div><div>Durum</div></div>
          ${rows}
        </div>`;
    }catch{
      root.innerHTML = `<div class="pad error">Siparişler alınamadı.</div>`;
    }
  }

  // ---- Router (TEK sürüm)
  async function route(){
    await requireLogin(); // giriş değilse login’e yollar
    const tab = getTab();
    setActive(tab);
    document.title =
      tab==='edit'   ? 'Profil Düzenle | Hesabım' :
      tab==='orders' ? 'Siparişlerim | Hesabım' :
                       'Hesabım';
    const content = $('#tab_content');
    if (tab === 'edit')   return renderEdit(content);
    if (tab === 'orders') return renderOrders(content);
    return renderOverview(content);
  }

  function wireTabs(){
    document.querySelectorAll('#tabs a').forEach(a=>{
      if (a.dataset.bound === '1') return;
      a.dataset.bound = '1';
      a.addEventListener('click', (e)=>{
        const tab = a.dataset.tab;
        if (!tab) return;
        e.preventDefault();
        const u = new URL(location.href);
        u.searchParams.set('tab', tab);
        history.pushState({tab}, '', u.toString());
        route();
      });
    });
  }

  document.addEventListener('partials:loaded', ()=>{ wireTabs(); route(); });
  window.addEventListener('popstate', route);
  window.addEventListener('DOMContentLoaded', ()=>{ wireTabs(); route(); });
})();
