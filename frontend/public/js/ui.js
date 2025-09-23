// public/js/ui.js — küçük ama kullanışlı UI yardımcıları (geliştirilmiş tam sürüm)
(function () {
  'use strict';

  /* =========================
   *  Mini util & DOM helpers
   * ========================= */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const on  = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const off = (el, ev, fn, opt) => el && el.removeEventListener(ev, fn, opt);

  const domReady = (fn) => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      queueMicrotask(fn);
    } else {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    }
  };

  const html = (s = '') =>
    (s ?? '').toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
  const once  = (fn) => { let done = false; return (...a) => { if (done) return; done = true; return fn(...a); }; };

  // throttle & debounce (lightweight)
  const debounce = (fn, ms = 200) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };
  const throttle = (fn, ms = 200) => {
    let last = 0, timer = null, lastArgs = null;
    return (...args) => {
      const now = Date.now();
      const remain = ms - (now - last);
      lastArgs = args;
      if (remain <= 0) {
        last = now; fn(...lastArgs); lastArgs = null;
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now(); timer = null;
          if (lastArgs) { fn(...lastArgs); lastArgs = null; }
        }, remain);
      }
    };
  };

  // class helpers
  const addCls = (el, ...c) => el && el.classList.add(...c.filter(Boolean));
  const rmCls  = (el, ...c) => el && el.classList.remove(...c.filter(Boolean));
  const hasCls = (el, c)    => !!(el && el.classList.contains(c));
  const tgCls  = (el, c, on) => el && (on == null ? el.classList.toggle(c) : el.classList.toggle(c, !!on));

  // currency / price helpers
  const fmtPrice = (minorOrMajor, currency = 'TRY', isMinor = true) => {
    let v = Number(minorOrMajor) || 0;
    if (isMinor) v = v / 100;
    try { return v.toLocaleString('tr-TR', { style: 'currency', currency }); }
    catch { return `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}`; }
  };
  const toMinor = (txt) => {
    if (txt == null) return null;
    const s = String(txt).trim().replace(/\./g, '').replace(',', '.'); // "1.234,56" → "1234.56"
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  };
  const fromMinor = (minor) => (Number(minor) || 0) / 100;

  // slugify (TR karakter dönüşümleri dahil)
  const slugify = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // image fallback (lazy bind)
  function attachImgFallback(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('img[data-fallback]').forEach(img => {
      if (img.dataset.bound) return;
      img.dataset.bound = '1';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.src = 'assets/hero.jpg';
        img.removeAttribute('data-fallback');
      }, { once: true });
    });
  }

  /* =========================
   *  Toast & Modal
   * ========================= */
  function ensureToastHost() {
    let host = $('#toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.setAttribute('role', 'region');
      host.setAttribute('aria-live', 'polite');
      host.style.cssText = 'position:fixed;right:14px;bottom:14px;display:grid;gap:8px;z-index:1000';
      document.body.appendChild(host);
    }
    return host;
  }
  function toast(message, type = 'info', ms = 2500) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.style.cssText = 'background:#111827;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12)';
    el.innerHTML = html(message);
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.transition = 'opacity .2s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  function confirmBox(message, { okText = 'Tamam', cancelText = 'Vazgeç' } = {}) {
    return new Promise(resolve => {
      // Minimal custom modal
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.35);z-index:1000';
      const card = document.createElement('div');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
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

      const done = once((val) => { wrap.remove(); resolve(val); });
      on($('#cCancel', card), 'click', () => done(false));
      on($('#cOk', card), 'click', () => done(true));
      on(wrap, 'click', (e) => { if (e.target === wrap) done(false); });
      on(window, 'keydown', function esc(e) { if (e.key === 'Escape') { off(window, 'keydown', esc); done(false); } });
    });
  }

  /* =========================
   *  Network helpers
   * ========================= */
  function redirectToLogin() {
    const u = new URL('/login.html', location.origin);
    u.searchParams.set('redirect', location.pathname + location.search + location.hash);
    location.href = u.toString();
  }

  async function tryJSON(resp) {
    try { return await resp.json(); } catch { return {}; }
  }

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    if (r.status === 401) { redirectToLogin(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return tryJSON(r);
  }

  // Timeout sarmalayıcı (fetch veya herhangi bir promise)
  async function withTimeout(promise, ms = 10000, err = new Error('timeout')) {
    let to;
    const t = new Promise((_, rej) => { to = setTimeout(() => rej(err), ms); });
    try { return await Promise.race([promise, t]); }
    finally { clearTimeout(to); }
  }

  /* =========================
   *  Forms & skeletons
   * ========================= */
  function serializeForm(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((v, k) => {
      if (obj[k] !== undefined) {
        if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
        obj[k].push(v);
      } else {
        obj[k] = v;
      }
    });
    return obj;
  }

  function renderSkeleton(container, type = 'product', count = 12) {
    if (!container) return;
    container.classList.add('skeleton-on');
    const tpl = type === 'cat'
      ? `<div class="skel card"><div class="skel avatar"></div><div class="skel line w70"></div><div class="skel line w40"></div></div>`
      : `<div class="skel card"><div class="skel media"></div><div class="skel line w80"></div><div class="skel line w60"></div></div>`;
    container.innerHTML = Array.from({ length: count }).map(() => tpl).join('');
  }
  const clearSkeleton = (el) => el && el.classList.remove('skeleton-on');

  /* =========================
   *  Clipboard & misc
   * ========================= */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Kopyalandı ✓', 'success', 1500);
      return true;
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      if (ok) toast('Kopyalandı ✓', 'success', 1500);
      else toast('Kopyalanamadı', 'error');
      return ok;
    }
  }

  /* =========================
   *  Event bus
   * ========================= */
  const bus = {
    on:  (ev, fn) => document.addEventListener(ev, fn),
    off: (ev, fn) => document.removeEventListener(ev, fn),
    emit:(ev, detail) => document.dispatchEvent(new CustomEvent(ev, { detail }))
  };

  /* =========================
   *  Public API
   * ========================= */
  window.UI = {
    // DOM
    $, $$, on, off, domReady,
    addCls, rmCls, hasCls, tgCls,

    // text/number
    html, clamp, sleep, debounce, throttle, once,

    // prices & strings
    fmtPrice, toMinor, fromMinor, slugify,

    // images/skeleton
    attachImgFallback, renderSkeleton, clearSkeleton,

    // dialogs
    toast, confirmBox,

    // net
    fetchJSON, withTimeout, tryJSON, redirectToLogin,

    // forms/misc
    serializeForm, copy,

    // bus
    bus
  };
})();
