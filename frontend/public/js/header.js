// header.js (daha toleranslı)
(function () {
  const MAX_WAIT_MS = 8000;

  function bindHeaderSearch(root = document) {
    const qEl = root.getElementById('q') 
             || root.querySelector('.hdr .search input[type="search"], header .search input[type="search"]');

    const btnEl = root.getElementById('btnSearch') 
               || root.querySelector('.hdr .search button, header .search button');

    if (!qEl) return false;

    const go = () => {
      const q = (qEl.value || '').trim();
      const u = new URL('category.html', location.href);
      const curr = new URL(location.href);
      curr.searchParams.forEach((v, k) => { if (k !== 'q') u.searchParams.set(k, v); });
      if (q) u.searchParams.set('q', q);

      if (location.pathname.endsWith('/category.html') && location.search !== u.search) {
        location.search = u.search;
      } else {
        location.href = u.toString();
      }
    };

    const form = qEl.closest('form');
    if (form && !form.dataset.bound) {
      form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      form.dataset.bound = '1';
    }

    if (btnEl && !btnEl.dataset.bound) {
      btnEl.addEventListener('click', go);
      btnEl.dataset.bound = '1';
    }
    if (!qEl.dataset.bound) {
      qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      qEl.dataset.bound = '1';
    }

    if (!document.body.dataset.searchHotkey) {
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey && document.activeElement !== qEl) {
          e.preventDefault();
          qEl.focus();
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
