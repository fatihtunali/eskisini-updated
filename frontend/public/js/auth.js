// frontend/public/js/auth.js
const API_BASE = (window.API_BASE || 'http://localhost:3000');

function saveToken(t){ localStorage.setItem('token', t); }
function getToken(){ return localStorage.getItem('token'); }
function clearToken(){ localStorage.removeItem('token'); }

async function api(path, opts={}){
  const headers = opts.headers || {};
  if(opts.json !== false) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if(token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body && opts.json !== false ? JSON.stringify(opts.body) : opts.body
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw data;
  return data;
}

// sayfa bazlı init
document.addEventListener('DOMContentLoaded', ()=>{
  const isLogin = location.pathname.endsWith('/login.html') || location.pathname.endsWith('login.html');
  const isRegister = location.pathname.endsWith('/register.html') || location.pathname.endsWith('register.html');
  const isKyc = location.pathname.endsWith('/kyc.html') || location.pathname.endsWith('kyc.html');

  // HEADER kullanıcı nav'ını güncelle
  const initHeader = async ()=>{
    const nav = document.querySelector('.usernav');
    if(!nav) return;
    nav.innerHTML = '';
    const token = getToken();
    if(!token){
      nav.innerHTML = `
        <a class="btn-ghost" href="/login.html">Giriş</a>
        <a class="btn-ghost" href="/register.html">Kayıt</a>
      `;
      return;
    }
    try{
      const me = await api('/api/auth/me');
      const kyc = me.user.kyc_status || 'none';
      nav.innerHTML = `
        <a class="btn-ghost" href="/kyc.html">KYC</a>
        <div class="badge-verified">${kyc==='verified'?'KYC ✓': kyc==='pending'?'KYC (Bekliyor)':'KYC Yok'}</div>
        <button class="btn-ghost" id="btnLogout">Çıkış</button>
      `;
      document.getElementById('btnLogout')?.addEventListener('click', ()=>{ clearToken(); location.reload(); });
    }catch{
      clearToken();
      nav.innerHTML = `<a class="btn-ghost" href="/login.html">Giriş</a>`;
    }
  };

  // partials yüklendiyse çalıştır
  if(window.__partials_loaded) initHeader();
  else document.addEventListener('partials:loaded', ()=>{ window.__partials_loaded = true; initHeader(); }, { once:true });

  // LOGIN
  if(isLogin){
    document.getElementById('f')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      try{
        const r = await api('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') }});
        saveToken(r.token);
        alert('Giriş başarılı');
        location.href = '/';
      }catch(err){ alert(err?.error || 'Giriş başarısız'); }
    });
  }

  // REGISTER
  if(isRegister){
    document.getElementById('f')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      try{
        const body = { email: fd.get('email'), password: fd.get('password'), full_name: fd.get('full_name') };
        const r = await api('/api/auth/register', { method:'POST', body });
        saveToken(r.token);
        alert('Kayıt başarılı, giriş yapıldı');
        location.href = '/';
      }catch(err){ alert(err?.error || 'Kayıt başarısız'); }
    });
  }

  // KYC
  if(isKyc){
    (async ()=>{
      try{
        const me = await api('/api/auth/me');
        document.getElementById('status').textContent = 'Durum: ' + (me.user.kyc_status || 'none');
      }catch{
        document.getElementById('status').textContent = 'Durum: (giriş yapmanız gerekiyor)';
      }
    })();

    document.getElementById('f')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const tc = (fd.get('tc_no') || '').toString().replace(/\D/g,'');
      if(tc.length !== 11) return alert('TC 11 hane olmalı');
      try{
        const r = await api('/api/auth/kyc', { method:'POST', body:{ tc_no: tc }});
        alert('KYC gönderildi: ' + r.kyc_status);
        location.reload();
      }catch(err){ alert(err?.error || 'KYC hatası'); }
    });
  }
});
