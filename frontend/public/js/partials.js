
// Sayfadaki [data-include] elemanlarını fetch ederek HTML'e göm
async function includePartials() {
  const nodes = Array.from(document.querySelectorAll('[data-include]'));
  await Promise.all(nodes.map(async (el) => {
    const url = el.getAttribute('data-include');
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const html = await res.text();
      // outerHTML ile yerinde değiştir
      el.outerHTML = html;
    } catch (e) {
      el.outerHTML = `<!-- include failed: ${url} -->`;
      console.warn('Partial include failed:', url, e);
    }
  }));
}
// Kullanım: body içinde <div data-include="partials/header.html"></div> gibi

// includePartials() tamamlandığında:
document.dispatchEvent(new Event('partials:loaded'));
