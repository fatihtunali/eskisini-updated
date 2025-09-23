// public/js/messages.js
(function () {
  const API = (window.APP && APP.API_BASE) || '';
  const $   = (s, r = document) => r.querySelector(s);
  const headersNoStore = { 'Accept': 'application/json', 'Cache-Control': 'no-store' };

  // guard: tek sefer
  if (window.__MSG_BOOTED__) return;
  window.__MSG_BOOTED__ = true;

  let currentUser = null;
  let currentThreadId = null;
  let pollTimer = null;
  let lastFetchController = null; // Bu da içeride olmalı

  function escapeHTML(s){ return (s??'').toString().replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])); }
  function toLogin(){ location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); }

  async function whoami() {
    try {
      const r = await fetch(`${API}/api/auth/me`, {
        credentials: 'include',
        headers: headersNoStore,
        cache: 'no-store'
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d.user || d;
    } catch { return null; }
  }

  async function loadThreads() {
    const root = $('#threads'); 
    if (!root) return;
    
    root.innerHTML = '<div class="pad">Yükleniyor…</div>';

    try {
      const r = await fetch(`${API}/api/messages/threads?_ts=${Date.now()}`, {
        credentials: 'include', headers: headersNoStore, cache: 'no-store'
      });
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);

      const data = await r.json();
      const list = data.threads || [];
      if (!list.length) {
        root.innerHTML = '<div class="empty">Henüz mesajınız yok.</div>';
        return;
      }

      root.innerHTML = list.map(t => {
        const prev  = escapeHTML(t.last_message_preview || '—');
        const when  = t.updated_at ? new Date(t.updated_at).toLocaleString('tr-TR') : '';
        const other = escapeHTML(t.other_user_name || 'Kullanıcı');
        const title = escapeHTML(t.listing_title || '');
        return `
          <a class="item" href="/thread.html?id=${encodeURIComponent(t.id)}">
            <div><b>${other}</b>${title ? ` • <span class="muted">${title}</span>` : ''}</div>
            <div class="muted">${prev}</div>
            <div class="muted small">${when}</div>
          </a>`;
      }).join('');
    } catch (e) {
      console.error('[threads] list error', e);
      root.innerHTML = '<div class="pad error">Mesajlar alınamadı.</div>';
    }
  }

  async function loadThreadMessages() {
    const box = $('#msgs');
    if (!box || !currentThreadId) return;

    console.log('Loading messages for thread:', currentThreadId); // Debug

    try { lastFetchController?.abort(); } catch {}
    lastFetchController = new AbortController();

    try {
      const r = await fetch(
        `${API}/api/messages/thread/${encodeURIComponent(currentThreadId)}?_ts=${Date.now()}`,
        {
          credentials: 'include',
          headers: headersNoStore,
          cache: 'no-store',
          signal: lastFetchController.signal
        }
      );
      
      console.log('Thread response:', r.status); // Debug
      
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);

      const data = await r.json();
      console.log('Thread data:', data); // Debug

      box.innerHTML = (data.messages || []).map(m=>{
        const mine = !!(currentUser && m.sender_id === currentUser.id);
        const time = m.created_at ? new Date(m.created_at).toLocaleString('tr-TR') : '';
        return `<div class="bubble ${mine?'me':''}">
          ${escapeHTML(m.body || '')}
          <span class="time">${time}</span>
        </div>`;
      }).join('') || '<div class="pad muted">Henüz mesaj yok.</div>';

      box.scrollTop = box.scrollHeight;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[thread] load error', e);
      box.innerHTML = '<div class="pad error">Mesajlar yüklenemedi.</div>';
    }
  }

  function wireSendForm() {
    const form = $('#send'); 
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentThreadId) return;
      const fd = new FormData(form);
      const body = String(fd.get('body') || '').trim();
      if (!body) return;

      const r = await fetch(`${API}/api/messages/thread/${encodeURIComponent(currentThreadId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...headersNoStore },
        cache: 'no-store',
        body: JSON.stringify({ body })
      });
      if (r.status === 401) { toLogin(); return; }
      if (!r.ok) return;
      form.reset();
      await loadThreadMessages();
    });
  }

  async function bootThread() {
    const box = $('#msgs'); 
    if (!box) {
      console.log('No #msgs element found'); // Debug
      return;
    }

    console.log('Booting thread...'); // Debug

    currentUser = await whoami();
    if (!currentUser) { toLogin(); return; }

    const qs = new URLSearchParams(location.search);
    let id = qs.get('id');
    
    console.log('Thread ID from URL:', id); // Debug

    if (!id) {
      box.innerHTML = '<div class="pad error">Konuşma ID bulunamadı.</div>';
      return;
    }

    currentThreadId = id;
    wireSendForm();
    await loadThreadMessages();

    // Polling setup...
    function startPolling() {
      clearInterval(pollTimer);
      pollTimer = setInterval(loadThreadMessages, 5000);
    }
    function stopPolling() {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    startPolling();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPolling();
      else startPolling();
    });

    window.addEventListener('beforeunload', () => stopPolling(), { once: true });
  }

  // Boot fonksiyonu artık IIFE içinde
  function boot() {
    console.log('Messages boot called'); // Debug
    
    // Sadece messages.html'deyse thread listesini yükle
    if (document.getElementById('threads')) {
      console.log('Loading threads...');
      loadThreads();
    }
    
    // Sadece thread.html'deyse veya ?id parametresi varsa thread'i yükle
    if (document.getElementById('msgs')) {
      const hasId = new URLSearchParams(location.search).get('id');
      const isThreadPage = location.pathname.includes('thread');
      
      console.log('Has ID:', hasId, 'Is thread page:', isThreadPage);
      
      if (hasId || isThreadPage) {
        console.log('Booting thread...');
        bootThread();
      }
    }
  }

  if (window.includePartials) {
    document.addEventListener('partials:loaded', boot, { once: true });
  } else {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();