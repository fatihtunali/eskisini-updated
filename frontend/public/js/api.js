const API = {
  async getMainCategories(){
    const r = await fetch(`${APP.API_BASE}/api/categories/main`); return r.json();
  },
  async getChildren(slug){
    const r = await fetch(`${APP.API_BASE}/api/categories/children/${encodeURIComponent(slug)}`); return r.json();
  },
  async search({q='',cat='',limit=24,offset=0}={}){
    const u = new URL(`${APP.API_BASE}/api/listings/search`);
    if(q) u.searchParams.set('q', q);
    if(cat) u.searchParams.set('cat', cat);
    u.searchParams.set('limit', limit); u.searchParams.set('offset', offset);
    const r = await fetch(u); return r.json();
  },
  async getListing(slug){
    const r = await fetch(`${APP.API_BASE}/api/listings/${encodeURIComponent(slug)}`); return r.json();
  },
  async addFavorite(user_id, listing_id){
    const r = await fetch(`${APP.API_BASE}/api/favorites`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id, listing_id})});
    return r.json();
  },
  async startMessage({listing_id,buyer_id,seller_id,body}){
    const r = await fetch(`${APP.API_BASE}/api/messages/start`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({listing_id,buyer_id,seller_id,body})});
    return r.json();
  },
  async makeTrade({listing_id,offerer_id,offered_text,cash_adjust_minor=0}){
    const r = await fetch(`${APP.API_BASE}/api/trade/offer`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({listing_id,offerer_id,offered_text,cash_adjust_minor})});
    return r.json();
  },
  async createOrder({buyer_id,listing_id,qty=1,shipping_minor=0}){
    const r = await fetch(`${APP.API_BASE}/api/orders`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({buyer_id,listing_id,qty,shipping_minor})});
    return r.json();
  },
  async createListing(payload){
    const r = await fetch(`${APP.API_BASE}/api/listings`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    return r.json();
  }
};
