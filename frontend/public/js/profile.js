// public/js/profile.js
(function(){
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);

  // --- helpers
  const esc = (s)=> (s??'').toString().replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
  const toTL = (minor, cur='TRY') => {
    const v = (Number(minor)||0) / 100;
    try { return v.toLocaleString('tr-TR',{style:'currency',currency:cur||'TRY'}); }
    catch { return `${v.toLocaleString('tr-TR')} ${esc(cur||'TRY')}`; }
  };
  const noStoreHeaders = { 'Accept':'application/json', 'Cache-Control':'no-cache' };

  function getTab(){
    const u = new URL(location.href);
    const qTab = u.searchParams.get('tab');
    if (qTab) return qTab;
    const h = (u.hash || '').replace('#','').trim();
    if (['orders','edit','mylistings','overview'].includes(h)) return h || 'overview';
    return 'overview';
  }
  function setActive(tab){
    document.querySelectorAll('#tabs a')
      .forEach(a=>a.classList.toggle('active', a?.dataset?.tab===tab));
  }
  function redirectToLogin(){
    const u = new URL('/login.html', location.origin);
    u.searchParams.set('redirect', location.pathname + location.search + location.hash);
    location.href = u.toString();
  }
  async function fetchJSON(url, opts = {}){
    const r = await fetch(url, {
      credentials:'include',
      cache: 'no-store',
      headers: noStoreHeaders,
      ...opts
    });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function requireLogin(){
    try{
      const r = await fetch(`${API_BASE}/api/auth/me`, {
        credentials:'include',
        cache:'no-store',
        headers: noStoreHeaders
      });
      if(!r.ok) throw 0;
      const d = await r.json();
      return d.user || d;
    }catch{
      redirectToLogin();
      throw new Error('not-authenticated');
    }
  }

  // ---- cancel API
  async function cancelOrder(id){
    const url = new URL(`${API_BASE}/api/orders/${id}/cancel`);
    url.searchParams.set('_ts', Date.now());
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Accept':'application/json', 'Cache-Control':'no-cache' }
    });
    let d = {};
    try { d = await r.json(); } catch {}
    if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP_${r.status}`);
    return d;
  }

  // ---- OVERVIEW

async function renderOverview(root){
  if (!root) return;
  root.innerHTML = `<div class="pad">Yükleniyor…</div>`;
  try{
    const me = await fetchJSON(`${API_BASE}/api/auth/me?_ts=${Date.now()}`);
    const u = me.user || me;

    root.innerHTML = `
      <div class="grid two section-gap">
        <!-- SOL: Profil özeti (sadece bilgiler) -->
        <div class="card">
          <div class="pad">
            <h3>Profil</h3>
            <div class="muted small">Hızlı özet</div>
          </div>
          <div class="pad">
            <div><b>Ad Soyad:</b> ${esc(u.full_name || '-')}</div>
            <div><b>E-posta:</b> ${esc(u.email || '-')}</div>
            <div><b>Telefon:</b> ${esc(u.phone_e164 || '-')}</div>
            <div><b>KYC:</b> ${esc(u.kyc_status || 'none')}</div>
          </div>
        </div>

        <!-- SAĞ: Hızlı İşlemler (tüm butonlar burada) -->
        <div class="card">
          <div class="pad"><h3>Hızlı İşlemler</h3></div>
          <div class="pad quick-actions">
            <a class="btn block ghost" href="?tab=edit">Profili Düzenle</a>
            <a class="btn block" href="/sell.html">+ Yeni İlan</a>
            <a class="btn block ghost" href="?tab=mylistings">İlanlarım</a>
            <a class="btn block" href="/favorites.html">Favorilerim</a>
            <a class="btn block" href="/messages.html">Mesajlarım</a>
            <a class="btn block ghost" href="?tab=orders">Siparişlerim</a>
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
      const me = await fetchJSON(`${API_BASE}/api/auth/me?_ts=${Date.now()}`);
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
        const r = await fetch(`${API_BASE}/api/users/profile?_ts=${Date.now()}`, {
          method:'POST',
          credentials:'include',
          cache:'no-store',
          headers:{'Content-Type':'application/json', ...noStoreHeaders},
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

  // ---- ORDERS (buyer)
  async function fetchOrders(){
    const url = new URL(`${API_BASE}/api/orders/mine`);
    url.searchParams.set('_ts', Date.now()); // cache-buster
    const r = await fetch(url, {
      credentials:'include',
      cache:'no-store',
      headers: noStoreHeaders
    });
    if (r.status === 401) { redirectToLogin(); return []; }
    const d = await r.json().catch(()=>({}));
    return d && d.ok ? (d.orders || []) : [];
  }

  function pickThumb(o){
    const t = o.thumb_url || o.thumb || '';
    if (!t) return '/assets/placeholder.png'; // gerekirse /assets/products/p1.svg dosyası varsa onu kullan
    if (/^https?:\/\//i.test(t) || t.startsWith('/')) return t;
    return `/uploads/${t}`;
  }
  function buildListingHref(o){
    if (o.slug) return `/listing.html?slug=${encodeURIComponent(o.slug)}`;
    return `/listing.html?id=${o.listing_id || o.id}`;
  }

  async function renderOrders(root){
    if (!root) return;
    root.innerHTML = `<div class="pad">Yükleniyor…</div>`;
    try{
      const rows = await fetchOrders();

      const table = `
        <div id="ordersEmpty" ${rows.length ? 'hidden' : ''}>Henüz siparişin yok.</div>
        <table id="ordersTable" class="table" style="${rows.length ? '' : 'display:none'};width:100%">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Fiyat</th>
              <th>Durum</th>
              <th>Tarih</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>`;
      root.innerHTML = table;

      if (!rows.length) return;
      const tbody = root.querySelector('#ordersTable tbody');

      for (const o of rows){
        const tr = document.createElement('tr');

        const tdProd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='10px';
        const img = document.createElement('img');
        img.src = pickThumb(o);
        img.alt = '';
        img.style.width='56px'; img.style.height='56px';
        img.style.objectFit='cover'; img.style.borderRadius='8px';
        const a = document.createElement('a');
        a.href = buildListingHref(o);
        a.textContent = esc(o.title || `#${o.listing_id}`);
        wrap.append(img,a); tdProd.append(wrap);

        const tdPrice = document.createElement('td');
        const totalMinor = (o.total_minor != null) ? o.total_minor : (Number(o.unit_price_minor||0) * (o.qty || 1));
        tdPrice.textContent = toTL(totalMinor, o.currency);

        const tdStatus = document.createElement('td'); tdStatus.textContent = o.status;
        const tdDate   = document.createElement('td'); tdDate.textContent   = new Date(o.created_at).toLocaleString('tr-TR');

        // Aksiyon kolonu
        const tdAct = document.createElement('td');
        if (o.status === 'pending') {
          const btn = document.createElement('button');
          btn.className = 'btn';
          btn.textContent = 'İptal';
          btn.addEventListener('click', async () => {
            if (!confirm('Bu siparişi iptal etmek istediğine emin misin?')) return;
            btn.disabled = true;
            try{
              await cancelOrder(o.id);

              // Satırı kaldır
              tr.remove();

              // Tabloda başka satır kalmadıysa boş mesajını aç
              const tbodyEl = root.querySelector('#ordersTable tbody');
              if (!tbodyEl || tbodyEl.children.length === 0) {
                const tbl = root.querySelector('#ordersTable');
                if (tbl) tbl.style.display = 'none';
                const empty = root.querySelector('#ordersEmpty');
                if (empty) empty.hidden = false;
              }
            }catch(e){
              console.error(e);
              alert('İptal edilemedi: ' + (e.message || 'Bilinmeyen hata'));
              btn.disabled = false;
            }
          });
          tdAct.append(btn);
        } else {
          tdAct.textContent = '';
        }

        tr.append(tdProd, tdPrice, tdStatus, tdDate, tdAct);
        tbody.append(tr);
      }
    }catch(e){
      console.error(e);
      root.innerHTML = `<div class="pad error">Siparişler alınamadı.</div>`;
    }
  }

  // ---- MY LISTINGS (seller)
  async function fetchMyListings(page=1, size=24){
    const url = new URL('/api/listings/my', API_BASE);
    url.searchParams.set('page', page);
    url.searchParams.set('size', size);
    url.searchParams.set('_ts', Date.now());

    const r = await fetch(url.toString(), {
      credentials:'include',
      cache:'no-store',
      headers: noStoreHeaders
    });
    if (r.status === 401) { redirectToLogin(); return { items:[], total:0 }; }

    const d = await r.json().catch(()=>({}));
    if (!r.ok) return { items:[], total:0 };

    const items = d.items || d.listings || [];
    const total = Number(d.total != null ? d.total : (d.count != null ? d.count : items.length));
    return { items, total };
  }

  function listingCard(x){
    const img = x.thumb_url || x.cover || '/assets/placeholder.png';
    const href = x.slug ? `/listing.html?slug=${encodeURIComponent(x.slug)}`
                        : `/listing.html?id=${encodeURIComponent(x.id)}`;

    let priceStr = '';
    if (typeof x.price_minor === 'number') {
      priceStr = toTL(x.price_minor, x.currency || 'TRY');
    } else if (x.price != null) {
      priceStr = `${(Number(x.price)||0).toLocaleString('tr-TR')} ${esc(x.currency||'TRY')}`;
    }

    return `
      <article class="card">
        <img src="${img}" alt="" onerror="this.src='/assets/placeholder.png';this.onerror=null">
        <div class="pad">
          <h3>${esc(x.title || '')}</h3>
          <p class="muted">${esc(x.category_name || '')}</p>
          <div class="price">${priceStr}</div>
          <div class="row" style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn" href="${href}">Görüntüle</a>
            <a class="btn ghost" href="/sell.html?edit=${encodeURIComponent(x.id)}">Düzenle</a>
          </div>
        </div>
      </article>
    `;
  }

  async function renderMyListings(root){
    if (!root) return;
    root.innerHTML = `<div class="pad">Yükleniyor…</div>`;
    try{
      const { items, total } = await fetchMyListings(1, 24);
      if (!items.length){
        root.innerHTML = `
          <div class="empty">
            Henüz ilanınız yok.
            <div style="margin-top:8px"><a class="btn primary" href="/sell.html">+ Yeni İlan Ver</a></div>
          </div>`;
        return;
      }
      root.innerHTML = `
        <div class="grid three" id="myListGrid"></div>
        <div class="muted" style="margin-top:8px">Toplam: ${total}</div>
      `;
      const grid = $('#myListGrid', root);
      if (grid) grid.innerHTML = items.map(listingCard).join('');
    }catch(e){
      console.error(e);
      root.innerHTML = `<div class="pad error">İlanlar alınamadı.</div>`;
    }
  }

  // ---- Router
  async function route(){
    await requireLogin();
    const tab = getTab();
    setActive(tab);
    document.title =
      tab==='edit'       ? 'Profil Düzenle | Hesabım' :
      tab==='orders'     ? 'Siparişlerim | Hesabım' :
      tab==='mylistings' ? 'İlanlarım | Hesabım' :
                           'Hesabım';

    const content = $('#tab_content');
    if (!content) return;

    if (tab === 'edit')       return renderEdit(content);
    if (tab === 'orders')     return renderOrders(content);
    if (tab === 'mylistings') return renderMyListings(content);
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
        history.pushState({tab}, '', u.toString().split('#')[0]);
        route();
      });
    });
  }

  document.addEventListener('partials:loaded', ()=>{ wireTabs(); route(); });
  window.addEventListener('popstate', route);
  window.addEventListener('DOMContentLoaded', ()=>{ wireTabs(); route(); });
})();
