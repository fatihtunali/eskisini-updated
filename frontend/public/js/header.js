// header.js — CSP uyumlu, partial yüklendikten sonra da çalışır
(function () {
  const MAX_WAIT_MS = 8000;

  function bindHeaderSearch(root = document) {
    const get = root.getElementById ? root.getElementById.bind(root) : document.getElementById.bind(document);
    const btn = get('btnSearch');
    const inp = get('q');

    if (!inp) return false;

    // ARIA / rol ipucu
    try {
      const searchWrap = inp.closest('.search');
      if (searchWrap && !searchWrap.getAttribute('role')) searchWrap.setAttribute('role', 'search');
      if (!inp.getAttribute('aria-label') && !inp.getAttribute('placeholder')) {
        inp.setAttribute('aria-label', 'Ara');
      }
    } catch(_) {}

    const go = () => {
      const q = (inp.value || '').trim();
      // Alt dizinlerde de çalışsın:
      const u = new URL('category.html', location.href);

      // Mevcut parametreleri (utm, lang, vs.) taşıyalım:
      const curr = new URL(location.href);
      curr.searchParams.forEach((v, k) => {
        if (!['q'].includes(k)) u.searchParams.set(k, v);
      });

      if (q) u.searchParams.set('q', q);
      // Aynı sayfadaysak sadece parametreyi güncelle:
      if (location.pathname.endsWith('/category.html') && location.search !== u.search) {
        location.search = u.search;
      } else {
        location.href = u.toString();
      }
    };

    // Form submit desteği (ileride <form> olursa)
    const form = inp.closest('form');
    if (form && !form.dataset.bound) {
      form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      form.dataset.bound = '1';
    }

    if (btn && !btn.dataset.bound) {
      btn.addEventListener('click', go);
      btn.dataset.bound = '1';
    }
    if (!inp.dataset.bound) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        }
      });
      inp.dataset.bound = '1';
    }

    // Küçük UX: "/" ile aramaya odaklan
    if (!document.body.dataset.searchHotkey) {
      document.addEventListener('keydown', (e) => {
        if (
          e.key === '/' &&
          !e.altKey && !e.ctrlKey && !e.metaKey &&
          document.activeElement !== inp
        ) {
          e.preventDefault();
          inp.focus();
        }
      });
      document.body.dataset.searchHotkey = '1';
    }

    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (bindHeaderSearch()) return;

    const onLoaded = () => bindHeaderSearch();
    document.addEventListener('partials:loaded', onLoaded, { once: true });

    const obs = new MutationObserver(() => { if (bindHeaderSearch()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), MAX_WAIT_MS);
  });
})();
