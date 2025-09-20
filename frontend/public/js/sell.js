(function(){
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);

  // … mevcut yardımcılar ve me(), toMinor(), slugify(), parseImageUrls() burada …

  async function loadCategories(){
    const $main  = $('#catMain');
    const $child = $('#catChild');

    try{
      const m = await API.getMainCategories();
      if (m?.ok && Array.isArray(m.categories)){
        // Diğer’i en alta korumak için geçici dizi
        const otherOpt = $main.querySelector('option[value="__other"]');
        $main.innerHTML = '<option value="">Seçiniz…</option>';
        m.categories.forEach(c=>{
          const opt = document.createElement('option');
          opt.value = c.slug; opt.textContent = c.name;
          $main.appendChild(opt);
        });
        if (otherOpt) $main.appendChild(otherOpt); // Diğer/Elle gir en sonda
      }
    }catch(e){
      console.warn('Ana kategoriler alınamadı', e);
      // Hata durumunda manuel slug alanını gösterelim
      $('#customSlugWrap').style.display = 'block';
      $main.disabled = true;
      $child.disabled = true;
    }

    $main.addEventListener('change', async ()=>{
      const v = $main.value;
      const custom = $('#customSlugWrap');
      const child  = $('#catChild');

      if (v === '__other'){
        // Elle gir moduna geç
        custom.style.display = 'block';
        child.innerHTML = '<option value="">Elle slug kullanılıyor</option>';
        child.disabled = true;
        return;
      } else {
        custom.style.display = 'none';
      }

      if (!v){
        child.innerHTML = '<option value="">Önce ana kategoriyi seçin</option>';
        child.disabled = true;
        return;
      }

      // Alt kategorileri çek
      child.innerHTML = '<option value="">Yükleniyor…</option>';
      child.disabled = true;
      try{
        const res = await API.getChildren(v);
        const kids = res?.children || [];
        if (kids.length){
          child.innerHTML = '<option value="">(Opsiyonel) Alt kategori seçin…</option>';
          kids.forEach(k=>{
            const o = document.createElement('option');
            o.value = k.slug; o.textContent = k.name;
            child.appendChild(o);
          });
          child.disabled = false;
        } else {
          child.innerHTML = '<option value="">Alt kategori yok</option>';
          child.disabled = true;
        }
      }catch(e){
        console.warn('Alt kategoriler alınamadı', e);
        child.innerHTML = '<option value="">Yüklenemedi</option>';
        child.disabled = true;
      }
    });
  }

  // submit içinde category_slug’i belirle
  async function bind(){
    const form = $('#f');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    const msg = $('#msg'); // opsiyonel
    const submitBtn = form.querySelector('[type="submit"]');

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      msg && (msg.textContent = '');
      if (submitBtn?.dataset.busy === '1') return;
      if (submitBtn) { submitBtn.dataset.busy = '1'; submitBtn.disabled = true; }

      try {
        const user = await me();
        if (!user) {
          const u = new URL('/login.html', location.origin);
          u.searchParams.set('redirect', location.pathname + location.search);
          location.href = u.toString();
          return;
        }

        const fd = new FormData(form);

        // === KATEGORİ SLUG KARARI ===
        const catMain  = $('#catMain')?.value || '';
        const catChild = $('#catChild')?.value || '';
        const custom   = $('#customSlug')?.value?.trim() || '';

        let category_slug = '';
        if (catMain === '__other') {
          // Elle gir
          category_slug = custom;
        } else if (catChild) {
          category_slug = catChild;
        } else {
          category_slug = catMain; // alt seçilmediyse ana slug
        }

        if (!category_slug) {
          alert('Lütfen bir kategori seçin veya slugu elle girin.');
          return;
        }

        // === FİYAT ===
        let price_minor = null;
        if (fd.has('price_minor') && String(fd.get('price_minor')).trim() !== '') {
          const pm = Number(String(fd.get('price_minor')).trim());
          price_minor = Number.isFinite(pm) ? pm : null;
        } else if (fd.has('price')) {
          price_minor = toMinor(fd.get('price'));
        }
        if (!Number.isFinite(price_minor) || price_minor <= 0) {
          alert('Lütfen geçerli bir fiyat girin.');
          return;
        }

        // === ZORUNLU ALANLAR ===
        const title = String(fd.get('title')||'').trim();
        if (!title) { alert('Başlık zorunludur.'); return; }

        // === SLUG ===
        let slug = String(fd.get('slug')||'').trim();
        if (!slug) slug = slugify(title);

        // === GÖRSELLER ===
        const image_urls = (String(fd.get('image_urls')||'')
          .split(/[\n,]/).map(s=>s.trim()).filter(Boolean));

        // === PAYLOAD ===
        const payload = {
          // seller_id backend’den (token)
          category_slug,
          title,
          slug,
          description_md: String(fd.get('description_md')||''),
          price_minor,
          currency: (fd.get('currency')||'TRY').toString().trim().toUpperCase() || 'TRY',
          condition_grade: String(fd.get('condition_grade')||'good'),
          location_city: String(fd.get('location_city')||''),
          image_urls
        };

        // === İSTEK ===
        const r = await fetch(`${API_BASE}/api/listings`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Accept':'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await r.json().catch(()=>({}));
        if (!r.ok || data.ok === false) {
          throw new Error(data.error || data.message || `HTTP ${r.status}`);
        }

        alert('İlan oluşturuldu #' + data.id);
        const detailUrl = payload.slug
          ? `/listing.html?slug=${encodeURIComponent(payload.slug)}`
          : `/listing.html?id=${encodeURIComponent(data.id)}`;
        location.href = detailUrl;

      } catch (err) {
        console.error(err);
        alert('İlan oluşturulamadı: ' + (err.message || 'Hata'));
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.dataset.busy = '0'; }
      }
    });
  }

  function boot(){
    loadCategories();
    bind();
  }

  document.addEventListener('partials:loaded', boot);
  window.addEventListener('DOMContentLoaded', ()=>{
    if (typeof includePartials === 'function') includePartials();
    boot();
  });
})();
