// public/js/home.js

// Partials (header/footer)
window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
  boot();
});

// === Helpers ===
const h = s => String(s ?? '').replace(/[&<>"'`]/g, m =>
  m === '&' ? '&amp;' :
  m === '<' ? '&lt;'  :
  m === '>' ? '&gt;'  :
  m === '"' ? '&quot;':
  m === "'" ? '&#39;' :
  '&#96;'
);

const fmtPrice = (minor, cur='TRY') =>
  `${((Number(minor) || 0) / 100).toLocaleString('tr-TR')} ${h(cur)}`;

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

function renderProductSkeleton(container, count) {
  if (!container) return;
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skel card">
      <div class="skel media"></div>
      <div class="skel line w80"></div>
      <div class="skel line w60"></div>
    </div>
  `).join('');
}

function renderCategorySkeleton(container, count) {
  if (!container) return;
  container.classList.add('skeleton-on');
  container.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skel card">
      <div class="skel avatar"></div>
      <div class="skel line w70"></div>
      <div class="skel line w40"></div>
    </div>
  `).join('');
}

function clearSkeleton(container) { container?.classList.remove('skeleton-on'); }

// perks’ü güvenle diziye çevir (frontend koruması)
function toPerksArray(perks, fallbackArr) {
  if (Array.isArray(perks)) return perks;
  if (!perks) return fallbackArr;
  if (typeof perks === 'string') {
    const s = perks.trim();
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('"') && s.endsWith('"'))) {
      try {
        const j = JSON.parse(s);
        if (Array.isArray(j)) return j;
        if (typeof j === 'string') {
          return j.split(/\r?\n|;|,/).map(x => x.trim()).filter(Boolean);
        }
      } catch {}
    }
    return s.split(/\r?\n|;|,/).map(x => x.trim()).filter(Boolean);
  }
  return fallbackArr;
}

// === Pricing render ===
async function renderPricing(){
  const box = document.getElementById('pricing');
  if (!box) return;

  // skeleton
  box.innerHTML = `
    <article class="pricecard"><div class="chip">Yükleniyor…</div><h3>Paketler</h3></article>
    <article class="pricecard"><div class="chip">Yükleniyor…</div><h3>Paketler</h3></article>
    <article class="pricecard"><div class="chip">Yükleniyor…</div><h3>Paketler</h3></article>
  `;

  try{
    // window.API globalini kullandığımızdan api.js’in önce yüklenmiş olması gerekir
    const { plans } = await window.API.getPlans();

    if (!plans || !plans.length) {
      box.innerHTML = `<div class="empty">Paket bulunamadı.</div>`;
      return;
    }

    let myPlanCode = null;
    try {
      const me = await window.API.getMySubscription();
      myPlanCode = me?.subscription?.code || null;
    } catch {}

    box.innerHTML = plans.map(p => {
      const periodLabel = p.period === 'yearly' ? '/yıllık' : '/aylık';
      const chip =
        (myPlanCode && myPlanCode === p.code)
          ? `<div class="chip success">Mevcut Paket</div>`
          : (p.code !== 'free' ? `<div class="chip info">Popüler</div>` : `<div class="chip">Ücretsiz</div>`);

      const fallbackPerks = [
        `Aylık ilan hakkı: ${p.listing_quota_month}`,
        `Yükseltme kredisi: ${p.bump_credits_month}`,
        `Öne çıkarma kredisi: ${p.featured_credits_month}`,
        `Destek: ${p.support_level === 'priority' ? 'Öncelikli' : (p.support_level==='standard'?'Standart':'Temel')}`
      ];
      const perksList = toPerksArray(p.perks, fallbackPerks);

      return `
        <article class="pricecard">
          ${chip}
          <h3>${h(p.name)}</h3>
          <div class="price">
            ${fmtPrice(p.price_minor, p.currency)}
            <span class="period">${periodLabel}</span>
          </div>
          <ul class="plist">
            ${perksList.map(it => `<li>${h(it)}</li>`).join('')}
          </ul>
          <button class="btn ${p.code==='free' ? '' : 'primary'}" data-plan="${h(p.code)}">
            ${myPlanCode === p.code ? 'Mevcut' : 'Paketi Seç'}
          </button>
        </article>
      `;
    }).join('');

    box.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-plan]');
      if (!btn) return;
      const code = btn.getAttribute('data-plan');
      alert(`Seçilen paket: ${code}`);
      // TODO: /pricing.html veya /account/billing.html akışına yönlendir
    });

  } catch (e){
    console.error('pricing load error', e);
    box.innerHTML = `<div class="empty">Paketler yüklenemedi.</div>`;
  }
}

// === Güvenli başlatma ===
async function boot(){
  const url   = new URL(location.href);
  const q     = url.searchParams.get('q') || '';

  const catsBox = document.getElementById('cats');
  const featBox = document.getElementById('featured');
  const hFeat   = document.getElementById('hFeatured');

  catsBox?.classList.add('grid','five');
  featBox?.classList.add('grid','five');

  // Kategoriler
  if (catsBox) {
    renderCategorySkeleton(catsBox, 10);
    try {
      const res = await window.API.getMainCategories();
      const categories = res?.categories || [];
      if (res?.ok && categories.length) {
        catsBox.innerHTML = categories.slice(0, 10).map(c => `
          <a class="catcard" href="category.html?slug=${encodeURIComponent(c.slug)}">
            <div class="icon">▦</div>
            <div class="c-title">${h(c.name)}</div>
            <div class="c-sub muted">Popüler</div>
          </a>
        `).join('');
      } else {
        catsBox.innerHTML = `<div class="muted center">Kategoriler yüklenemedi.</div>`;
      }
    } catch (e) {
      console.error(e);
      catsBox.innerHTML = `<div class="muted center">Kategoriler yüklenemedi.</div>`;
    } finally {
      clearSkeleton(catsBox);
      attachImgFallback(catsBox);
    }
  }

  // Öne çıkanlar / Arama sonuçları
  if (featBox) {
    renderProductSkeleton(featBox, 10);
    try {
      const params = q ? { q, limit: 12 } : { cat: 'akilli-telefonlar', limit: 12 };
      const res = await window.API.search(params);
      const items = res?.listings || [];
      if (res?.ok && items.length) {
        if (hFeat) hFeat.style.display = 'block';
        featBox.innerHTML = items.map(x => {
          const cover = x.cover || 'assets/hero.jpg';
          return `
            <a class="product" href="listing.html?slug=${encodeURIComponent(x.slug)}">
              ${q ? '' : '<div class="flag">Öne Çıkan</div>'}
              <img src="${cover}" alt="${h(x.title)}" data-fallback>
              <div class="p-meta">
                <div class="p-price">${fmtPrice(x.price_minor, x.currency)}</div>
                <div class="p-views" aria-label="Görüntülenme">👁 ${Math.floor(50 + Math.random()*250)}</div>
              </div>
              <div class="p-title">${h(x.title)}</div>
              <div class="p-sub muted">${h(x.location_city || '')}</div>
            </a>
          `;
        }).join('');
      } else {
        if (hFeat) hFeat.style.display = 'none';
        featBox.innerHTML = `<div class="muted center">${q ? 'Arama sonucu bulunamadı.' : 'İlan bulunamadı.'}</div>`;
      }
    } catch (e) {
      console.error(e);
      if (hFeat) hFeat.style.display = 'none';
      featBox.innerHTML = `<div class="muted center">İlanlar yüklenemedi.</div>`;
    } finally {
      clearSkeleton(featBox);
      attachImgFallback(featBox);
    }
  }

  // Pricing
  await renderPricing();
}
