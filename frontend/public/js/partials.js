// frontend/public/js/partials.js
(function(){
  let running = false;

  const isRelative = (url) =>
    url && !/^(?:[a-z]+:)?\/\//i.test(url) && !url.startsWith('/') &&
    !url.startsWith('#') && !url.startsWith('mailto:') && !url.startsWith('tel:');

  function absolutizeAttrs(root, baseUrl){
    const base = new URL(baseUrl, location.href);
    const ATTRS = ['src','href','poster'];

    // srcset (virgüllü)
    root.querySelectorAll('[srcset]').forEach(el=>{
      const v = el.getAttribute('srcset'); if(!v) return;
      const parts = v.split(',').map(s=>s.trim()).map(item=>{
        const [u, d] = item.split(/\s+/,2);
        if (isRelative(u)) return new URL(u, base).toString() + (d ? ' '+d : '');
        return item;
      });
      el.setAttribute('srcset', parts.join(', '));
    });

    // src, href, poster
    ATTRS.forEach(attr=>{
      root.querySelectorAll('['+attr+']').forEach(el=>{
        const v = el.getAttribute(attr);
        if (isRelative(v)) el.setAttribute(attr, new URL(v, base).toString());
      });
    });
  }

  // İsteğe bağlı: sadece data-exec="true" olan harici script’leri yükle
  async function executeOptInScripts(fragment){
    const scripts = [...fragment.querySelectorAll('script[data-exec="true"][src]')];
    for (const s of scripts) {
      const src = s.getAttribute('src');
      if (!src) continue;
      await new Promise((resolve, reject)=>{
        const n = document.createElement('script');
        n.src = src;
        n.async = false; // sıra korunsun
        n.onload = resolve;
        n.onerror = reject;
        document.head.appendChild(n);
      }).catch(err=>console.warn('Partial script failed:', src, err));
    }
  }

  async function fetchOne(url){
    const res = await fetch(url, { cache: 'no-cache' });
    if(!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const html = await res.text();
    const range = document.createRange();
    // dummy node: createContextualFragment kök bağlam ister
    range.selectNode(document.body);
    const frag = range.createContextualFragment(html);
    absolutizeAttrs(frag, url);
    return frag;
  }

  async function includePass(){
    const nodes = [...document.querySelectorAll('[data-include]')];
    if (!nodes.length) return { loaded: [], count: 0 };

    // Paralel indir
    const jobs = nodes.map(async el => {
      const url = el.getAttribute('data-include');
      try{
        const frag = await fetchOne(url);
        if (el.isConnected && el.parentNode) {
          el.replaceWith(frag);
          await executeOptInScripts(frag); // opt-in script
          return { ok:true, url };
        }
      }catch(e){
        if (el.isConnected && el.parentNode) {
          el.replaceWith(document.createComment(`include failed: ${url}`));
        }
        console.warn('Partial include failed:', url, e);
      }
      return { ok:false, url };
    });

    const results = await Promise.all(jobs);
    const loaded = results.filter(x=>x?.ok).map(x=>x.url);
    return { loaded, count: results.length };
  }

  async function includePartials(){
    if (running) return;
    running = true;

    const allLoaded = [];
    // Nested partial’lar için en fazla 3 pas
    for (let pass=0; pass<3; pass++){
      const { loaded, count } = await includePass();
      if (count === 0) break;      // işlenecek yok
      if (loaded.length === 0) {   // hepsi hata/yorum oldu
        break;
      }
      allLoaded.push(...loaded);
      // Bir sonraki passta yeni eklenenlerin içinde data-include varsa yakalarız
      if (!document.querySelector('[data-include]')) break;
    }

    document.dispatchEvent(new CustomEvent('partials:loaded', { detail: { loaded: allLoaded }}));
    running = false;
  }

  window.includePartials = includePartials;
})();
