(function(){
  const API = (window.APP && APP.API_BASE) || '';
  const $   = (s,r=document)=>r.querySelector(s);

  const headersNoStore = { 'Accept':'application/json', 'Cache-Control':'no-cache' };

  function escapeHTML(s){ return (s??'').toString().replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])); }
  function toLogin(){
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
  }
  async function whoami(){
    try{
      const r = await fetch(`${API}/api/auth/me`, { credentials:'include', headers: headersNoStore, cache:'no-store' });
      if (!r.ok) return null;
      const d = await r.json(); return d.user || d;
    }catch{ return null; }
  }

  /* ------------------ THREADS (messages.html) ------------------ */
  async function loadThreads(){
    const root = $('#threads');
    if (!root) return; // bu sayfa değil

    // Kimlik kontrolü
    const me = await whoami();
    if (!me) { toLogin(); return; }

    root.innerHTML = '<div class="pad">Yükleniyor…</div>';
    try{
      const r = await fetch(`${API}/api/messages/threads?_ts=${Date.now()}`, {
        credentials:'include',
        headers: headersNoStore,
        cache: 'no-store'
      });
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      const list = data.threads || [];

      if (!list.length){
        root.innerHTML = '<div class="empty">Henüz mesajınız yok.</div>';
        return;
      }

      root.innerHTML = list.map(t=>{
        const prev = escapeHTML(t.last_message_preview || '—');
        const when = t.updated_at ? new Date(t.updated_at).toLocaleString('tr-TR') : '';
        const other = escapeHTML(t.other_user_name || 'Kullanıcı');
        const title = escapeHTML(t.listing_title || '');
        return `
          <a class="item" href="/thread.html?id=${encodeURIComponent(t.id)}">
            <div><b>${other}</b>${title ? ` • <span class="muted">${title}</span>` : ''}</div>
            <div class="muted">${prev}</div>
            <div class="muted small">${when}</div>
          </a>`;
      }).join('');
    }catch(e){
      console.error('[messages] threads error', e);
      root.innerHTML = '<div class="pad error">Mesajlar alınamadı.</div>';
    }
  }

  /* ------------------ SINGLE THREAD (thread.html) ------------------ */
  let pollTimer = null;
  let currentThreadId = null;

  async function ensureConversationFromQuery(qs){
    // id yoksa listing(+seller) ile konuyu başlat/geri getir
    const listing = Number(qs.get('listing') || 0);
    const seller  = Number(qs.get('seller') || 0);
    if (!listing) return null;

    const payload = { listing_id: listing };
    if (Number.isInteger(seller) && seller > 0) payload.to_user_id = seller;

    const r = await fetch(`${API}/api/messages/start`, {
      method:'POST',
      credentials:'include',
      headers:{ 'Content-Type':'application/json', ...headersNoStore },
      cache:'no-store',
      body: JSON.stringify(payload)
    });
    if (r.status === 401) { toLogin(); return null; }
    const d = await r.json().catch(()=>({}));
    if (!r.ok || d.ok === false) return null;
    return d.conversation_id;
  }

  async function loadThreadMessages(){
    const box  = $('#msgs');
    if (!box || !currentThreadId) return;

    try{
      const r = await fetch(`${API}/api/messages/thread/${encodeURIComponent(currentThreadId)}?_ts=${Date.now()}`, {
        credentials:'include',
        headers: headersNoStore,
        cache: 'no-store'
      });
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      const me = await whoami();

      box.innerHTML = (data.messages || []).map(m=>{
        const mine = (m.sender_id === me?.id);
        const time = m.created_at ? new Date(m.created_at).toLocaleString('tr-TR') : '';
        return `
          <div class="bubble ${mine ? 'me' : ''}">
            ${escapeHTML(m.body || '')}
            <span class="time">${time}</span>
          </div>`;
      }).join('') || '<div class="pad muted">Henüz mesaj yok.</div>';

      box.scrollTop = box.scrollHeight;
    }catch(e){
      console.error('[messages] load thread error', e);
      const box = $('#msgs');
      if (box) box.innerHTML = '<div class="pad error">Mesajlar yüklenemedi.</div>';
    }
  }

  function wireSendForm(){
    const form = $('#send');
    if (!form) return;
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (!currentThreadId) return;

      const fd = new FormData(form);
      const body = String(fd.get('body') || '').trim();
      if (!body) return;

      try{
        const r = await fetch(`${API}/api/messages/thread/${encodeURIComponent(currentThreadId)}`, {
          method:'POST',
          credentials:'include',
          headers:{ 'Content-Type':'application/json', ...headersNoStore },
          cache:'no-store',
          body: JSON.stringify({ body })
        });
        if (r.status === 401) { toLogin(); return; }
        if (!r.ok) throw new Error('HTTP '+r.status);
        form.reset();
        await loadThreadMessages();
      }catch(e){
        console.error('[messages] send error', e);
      }
    });
  }

  async function bootThread(){
    const box = $('#msgs');
    if (!box) return; // bu sayfa değil

    // Kimlik kontrolü
    const me = await whoami();
    if (!me) { toLogin(); return; }

    const qs = new URLSearchParams(location.search);
    let id   = qs.get('id');

    if (!id){
      // Eski/yanlış bağlantı: ?listing=…(&seller=…)
      const convId = await ensureConversationFromQuery(qs);
      if (!convId){
        box.innerHTML = '<div class="pad error">Konuşma açılamadı.</div>';
        return;
      }
      // URL’i temizle & id parametresiyle değiştir
      const u = new URL(location.href);
      u.searchParams.delete('listing');
      u.searchParams.delete('seller');
      u.searchParams.set('id', convId);
      history.replaceState(null, '', u.toString());
      id = String(convId);
    }

    currentThreadId = id;
    wireSendForm();
    await loadThreadMessages();

    // Basit auto-refresh (5 sn)
    clearInterval(pollTimer);
    pollTimer = setInterval(loadThreadMessages, 5000);
    // Sayfadan çıkınca kapat
    window.addEventListener('beforeunload', ()=>clearInterval(pollTimer));
  }

  /* ------------------ BOOT ------------------ */
  function boot(){
    loadThreads();
    bootThread();
  }
  document.addEventListener('partials:loaded', boot);
  window.addEventListener('DOMContentLoaded', boot);
})();
