// public/js/listing.js
(function () {
  const API = (window.APP && window.APP.API_BASE) || '';
  const $  = (s, r = document) => r.querySelector(s);

  // ---- utils (sadece bir kez tanımla)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => (
    m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : m === '"' ? '&quot;' : m
  ));
  
  const money = (minor, cur = 'TRY') => {
    try {
      return new Intl.NumberFormat('tr-TR', { 
        style: 'currency', 
        currency: cur 
      }).format((Number(minor) || 0) / 100);
    } catch (e) {
      // Fallback eğer currency desteklenmiyor ise
      const amount = ((Number(minor) || 0) / 100).toLocaleString('tr-TR', { 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2 
      });
      return `${amount} ${cur}`;
    }
  };

  function getParams() {
    const u = new URL(location.href);
    return {
      slug: u.searchParams.get('slug') || '',
      id: u.searchParams.get('id') || '',
      q: u.searchParams.get('q') || '',
      cat: u.searchParams.get('cat') || '',
      page: Math.max(1, parseInt(u.searchParams.get('page') || '1', 10)),
      size: Math.min(50, Math.max(1, parseInt(u.searchParams.get('size') || '24', 10)))
    };
  }

  function toLogin() {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
  }

  async function hydrateFavButtons(root = document) {
    if (window.FAV?.wireFavButtons) await FAV.wireFavButtons(root);
  }

  async function startConversation(listingId) {
    const r = await fetch(`${API}/api/messages/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ listing_id: listingId })
    });
    if (r.status === 401) { toLogin(); return null; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'START_FAIL');
    return d.conversation_id;
  }

  function openThread(convId) {
    location.href = `/thread.html?id=${encodeURIComponent(convId)}`;
  }

  async function loadDetail() {
    const { slug } = getParams();
    const detailRoot = $('#detail');
    if (!slug || !detailRoot) {
      console.error('No slug or detail root element found');
      return;
    }

    try {
      console.log('Loading detail for slug:', slug); // Debug

      const response = await fetch(`${API}/api/listings/${encodeURIComponent(slug)}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);
      
      const data = await response.json();
      console.log('Listing data:', data); // Debug

      if (!data?.ok && !data?.listing) throw new Error('Invalid response format');

      const L = data.listing || data;
      const imgs = data.images || [];

      // Update page elements
      const title = $('#title');
      const meta = $('#meta');  
      const price = $('#price');
      const desc = $('#desc');
      const img = $('#img');

      if (title) title.textContent = L.title || 'Başlıksız İlan';
      if (meta) meta.textContent = [L.category_name, L.location_city].filter(Boolean).join(' • ');
      if (price) {
        console.log('Price data:', L.price_minor, L.currency); // Debug
        price.textContent = money(L.price_minor, L.currency || 'TRY');
      }
      if (desc) desc.innerHTML = `<pre style="white-space:pre-wrap">${esc(L.description_md || 'Açıklama bulunmuyor.')}</pre>`;
      if (img) img.src = (imgs[0]?.file_url) || L.cover || '/assets/placeholder.png';

      // Update page title
      document.title = `${L.title || 'İlan'} | Eskisini Ver Yenisini Al`;

      // Favori hydrate
      const favBtn = $('#favBtn');
      const favCount = $('#favCount');
      if (favBtn) favBtn.dataset.listingId = L.id;
      if (favCount) favCount.textContent = String(L.favorites_count ?? 0);
      await hydrateFavButtons(document);

      // Mesaj butonu
      const msgBtn = $('#msgBtn');
      if (msgBtn) {
        msgBtn.addEventListener('click', async () => {
          msgBtn.disabled = true;
          try {
            const convId = await startConversation(L.id);
            if (!convId) return;
            openThread(convId);
          } catch (e) {
            console.error(e);
            alert('Mesaj başlatılamadı: ' + (e.message || 'Bilinmeyen hata'));
          } finally {
            msgBtn.disabled = false;
          }
        });
      }

      // Satın Al butonu
      const buyBtn = $('#btnBuy');
      if (buyBtn) {
        buyBtn.removeAttribute('onclick');
        detailRoot.setAttribute('data-listing-id', String(L.id));
      }

    } catch (e) {
      console.error('loadDetail error:', e);
      detailRoot.innerHTML = `<div class="pad error">İlan yüklenemedi: ${e.message}</div>`;
    }
  }

  // Sayfa başlatma
  async function boot() {
    if (typeof includePartials === 'function') includePartials();

    const { slug } = getParams();

    if (slug) {
      await loadDetail();
    } else {
      console.error('No slug provided, redirecting to home');
      location.href = '/';
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();