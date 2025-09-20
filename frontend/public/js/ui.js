// public/js/ui.js
(function () {
  'use strict';

  // ---- küçük utils
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const off= (el, ev, fn, opt) => el && el.removeEventListener(ev, fn, opt);

  const html = (s='') => (s??'').toString()
    .replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const fmtPrice = (minorOrMajor, currency='TRY', isMinor=true) => {
    let v = Number(minorOrMajor)||0;
    if (isMinor) v = v/100;
    return `${v.toLocaleString('tr-TR',{maximumFractionDigits:2})} ${currency}`;
  };

  // ---- toast (çok hafif)
  function ensureToastHost(){
    let host = $('#toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.style.cssText = 'position:fixed;right:14px;bottom:14px;display:grid;gap:8px;z-index:1000';
      document.body.appendChild(host);
    }
    return host;
  }
  function toast(msg, type='info', ms=2500){
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.style.cssText = 'background:#111827;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12)';
    el.innerHTML = html(msg);
    host.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .2s'; setTimeout(()=>el.remove(), 220); }, ms);
  }

  // ---- confirm modal (native confirm’u güzelleştirme opsiyonlu)
  function confirmBox(message, {okText='Tamam', cancelText='Vazgeç'} = {}){
    return new Promise(resolve => {
      // basit: natif confirm
      const simple = false; // true yaparsan window.confirm kullanır
      if (simple) return resolve(window.confirm(message));

      // mini modal
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.35);z-index:1000';
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff;border:1px solid #e5e7eb;border-radius:14px;max-width:360px;width:calc(100% - 32px);padding:14px;box-shadow:0 8px 30px rgba(2,6,23,.12)';
      card.innerHTML = `
        <div style="margin-bottom:10px;font-weight:700">Onay</div>
        <div style="color:#374151;margin-bottom:12px">${html(message)}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="cCancel" class="btn">${html(cancelText)}</button>
          <button id="cOk" class="btn primary">${html(okText)}</button>
        </div>
      `;
      wrap.appendChild(card);
      document.body.appendChild(wrap);

      const done = (val)=>{ wrap.remove(); resolve(val); };
      on($('#cCancel', card),'click', ()=>done(false));
      on($('#cOk', card),'click',     ()=>done(true));
      on(wrap,'click', (e)=>{ if(e.target===wrap) done(false); });
      on(window,'keydown', function esc(e){ if(e.key==='Escape'){ off(window,'keydown',esc); done(false); }});
    });
  }

  // ---- fetchJSON (401 → login’e atar)
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

  // ---- basit event bus
  const bus = {
    on:(ev,fn)=>document.addEventListener(ev,fn),
    off:(ev,fn)=>document.removeEventListener(ev,fn),
    emit:(ev,detail)=>document.dispatchEvent(new CustomEvent(ev,{detail}))
  };

  // tek global
  window.UI = { $, $$, on, off, html, fmtPrice, toast, confirmBox, fetchJSON, bus };
})();
