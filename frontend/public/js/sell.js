window.addEventListener('DOMContentLoaded', () => {
  if (typeof includePartials === 'function') includePartials();
});

document.getElementById('f').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const image_urls = (fd.get('image_urls')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const payload = Object.fromEntries(fd.entries());
  payload.price_minor = Number(payload.price_minor);
  payload.seller_id = Number(payload.seller_id);
  payload.image_urls = image_urls;
  const r = await API.createListing(payload);
  alert(r.ok? 'İlan oluşturuldu #' + r.id : r.error);
});
