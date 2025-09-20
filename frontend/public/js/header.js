// header.js — CSP uyumlu, partial yüklendikten sonra da çalışır
(function () {
  const MAX_WAIT_MS = 8000;

  function bindHeaderSearch(root = document) {
    const btn = root.getElementById ? root.getElementById('btnSearch') : document.getElementById('btnSearch');
    const inp = root.getElementById ? root.getElementById('q')         : document.getElementById('q');
    if (!inp) return false;

    const go = () => {
      const q = (inp.value || '').trim();
      // category.html’e git; q varsa parametreye ekle
      const u = new URL('category.html', location.href);
      u.search = ''; // eski parametreleri temizle
      if (q) u.searchParams.set('q', q);
      location.href = u.toString();
    };

    // Çift bağlamayı önle
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

  // 1) DOM hazır olduğunda dene
  document.addEventListener('DOMContentLoaded', () => {
    if (bindHeaderSearch()) return;

    // 2) Partials yüklenmesini bekle: includePartials() sonunda tetikleyeceğimiz olay
    const onLoaded = () => bindHeaderSearch();
    document.addEventListener('partials:loaded', onLoaded, { once: true });

    // 3) Emniyet: MutationObserver ile #btnSearch/#q görünene kadar bekle
    const obs = new MutationObserver(() => {
      if (bindHeaderSearch()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // 4) Zaman aşımı: sonsuza kadar bekleme
    setTimeout(() => obs.disconnect(), MAX_WAIT_MS);
  });
})();
