// public/js/messages.js
(function(){
  const API = (window.APP && APP.API_BASE) || '';
  const $   = (s,r=document)=>r.querySelector(s);
  const headersNoStore = { 'Accept':'application/json', 'Cache-Control':'no-store' };

  // guard: tek sefer
  if (window.__MSG_BOOTED__) return;
  window.__MSG_BOOTED__ = true;

  let currentUser = null;
  let currentThreadId = null;
  let pollTimer = null;

  function escapeHTML(s){ return (s??'').toString().replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])); }
  function toLogin(){ location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); }

  async function whoami(){
    try{
      const r = await fetch(`${API}/api/auth/me`, { credentials:'include', headers: headersNoStore, cache:'no-store' });
      if (!r.ok) return null;
      const d = await r.json(); return d.user || d;
    }catch{ return null; }
  }

  async function loadThreads(){
    const root = $('#threads'); if (!root) return;
    root.innerHTML = '<div class="pad">Yükleniyor…</div>';

    const r = await fetch(`${API}/api/messages/threads?_ts=${Date.now()}`, {
      credentials:'include', headers: headersNoStore, cache:'no-store'
    });
    if (r.status === 401) { toLogin(); return; }
    if (!r.ok){ root.innerHTML = '<div class="pad error">Mesajlar alınamadı.</div>'; return; }

    const data = await r.json();
    const list = data.threads || [];
    if (!list.length){ root.innerHTML = '<div class="empty">Henüz mesajınız yok.</div>'; return; }

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
  }

  async function ensureConversationFromQuery(qs){
    const listing = Number(qs.get('listing') || 0);
    const seller  = Number(qs.get('seller') || 0);
    if (!listing) return null;

    const payload = { listing_id: listing };
    if (seller > 0) payload.to_user_id = seller;

    const r = await fetch(`${API}/api/messages/start`, {
      method:'POST', credentials:'include',
      headers:{ 'Content-Type':'application/json', ...headersNoStore },
      cache:'no-store', body: JSON.stringify(payload)
    });
    if (r.status === 401) { toLogin(); return null; }
    const d = await r.json().catch(()=>({}));
    if (!r.ok || d.ok === false) return null;
    return d.conversation_id;
  }

  async function loadThreadMessages(){
    const box = $('#msgs');
    if (!box || !currentThreadId) return;

    try{
      const r = await fetch(`${API}/api/messages/thread/${encodeURIComponent(currentThreadId)}?_ts=${Date.now()}`, {
        credentials:'include', headers: headersNoStore, cache:'no-store'
      });
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) throw 0;
      const data = await r.json();

      box.innerHTML = (data.messages || []).map(m=>{
        const mine = !!(currentUser && m.sender_id === currentUser.id);
        const time = m.created_at ? new Date(m.created_at).toLocaleString('tr-TR') : '';
        return `<div class="bubble ${mine?'me':''}">
          ${escapeHTML(m.body || '')}
          <span class="time">${time}</span>
        </div>`;
      }).join('') || '<div class="pad muted">Henüz mesaj yok.</div>';

      box.scrollTop = box.scrollHeight;
    }catch{
      box.innerHTML = '<div class="pad error">Mesajlar yüklenemedi.</div>';
    }
  }

  function wireSendForm(){
    const form = $('#send'); if (!form) return;
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if (!currentThreadId) return;
      const fd = new FormData(form);
      const body = String(fd.get('body')||'').trim();
      if (!body) return;
      const r = await fetch(`${API}/api/messages/thread/${encodeURIComponent(currentThreadId)}`, {
        method:'POST', credentials:'include',
        headers:{ 'Content-Type':'application/json', ...headersNoStore },
        cache:'no-store', body: JSON.stringify({ body })
      });
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) return;
      form.reset();
      await loadThreadMessages();
    });
  }

  async function bootThread(){
    const box = $('#msgs'); if (!box) return;

    // kullanıcıyı YALNIZCA bir kere getir
    currentUser = await whoami();
    if (!currentUser) { toLogin(); return; }

    const qs = new URLSearchParams(location.search);
    let id = qs.get('id');

    if (!id){
      const convId = await ensureConversationFromQuery(qs);
      if (!convId){ box.innerHTML = '<div class="pad error">Konuşma açılamadı.</div>'; return; }
      const u = new URL(location.href);
      u.searchParams.delete('listing'); u.searchParams.delete('seller');
      u.searchParams.set('id', convId);
      history.replaceState(null,'',u.toString());
      id = String(convId);
    }

    currentThreadId = id;
    wireSendForm();
    await loadThreadMessages();

    clearInterval(pollTimer);
    pollTimer = setInterval(loadThreadMessages, 5000);
    window.addEventListener('beforeunload', ()=>clearInterval(pollTimer), { once:true });
  }

  function boot(){
    loadThreads();
    bootThread();
  }

  if (window.includePartials) {
    document.addEventListener('partials:loaded', boot, { once:true });
  } else {
    window.addEventListener('DOMContentLoaded', boot, { once:true });
  }
})();
