// header.js — CSP uyumlu, partial yüklendikten sonra da çalışır
(function () {
  const MAX_WAIT_MS = 8000;

  function bindHeaderSearch(root = document) {
    const btn = root.getElementById ? root.getElementById('btnSearch') : document.getElementById('btnSearch');
    const inp = root.getElementById ? root.getElementById('q')         : document.getElementById('q');
    if (!inp) return false;

    const go = () => {
      const q = (inp.value || '').trim();
      const u = new URL('/category.html', location.origin);
      if (q) u.searchParams.set('q', q);
      location.href = u.toString();
    };

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
