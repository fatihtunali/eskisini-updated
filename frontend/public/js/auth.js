// public/js/auth.js
(function () {
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s, r=document)=>r.querySelector(s);

  // mesaj yardımcıları
  function showMsg(box, text, type='error'){
    if (!box) return;
    box.textContent = text;
    box.className = 'msg ' + type;
    box.hidden = false;
  }
  function clearMsg(box){ if(box){ box.hidden=true; box.textContent=''; } }

  // şifre görünürlüğü
  function bindToggle(btnId, inputId){
    const btn = $(btnId), inp = $(inputId);
    if(!btn || !inp) return;
    btn.addEventListener('click', ()=>{
      const t = inp.type === 'password' ? 'text' : 'password';
      inp.type = t;
    });
  }

  // LOGIN
  const loginForm = $('#loginForm');
  if (loginForm){
    const msg = $('#loginMsg');
    bindToggle('#toggleLoginPass', '#loginPass');

    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      clearMsg(msg);
      const btn = loginForm.querySelector('[type="submit"]');
      btn.disabled = true;

      const fd = new FormData(loginForm);
      const payload = {
        email: String(fd.get('email')||'').trim(),
        password: String(fd.get('password')||'')
      };

      try{
        const r = await fetch(`${API_BASE}/api/auth/login`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await r.json().catch(()=>({}));
        if(!r.ok || data.ok===false) throw new Error(data.error||data.message||`HTTP ${r.status}`);

        showMsg(msg, 'Giriş başarılı, yönlendiriliyorsunuz…', 'success');
        const redirect = new URLSearchParams(location.search).get('redirect') || '/';
        location.href = redirect;

      }catch(err){
        showMsg(msg, err.message || 'Giriş yapılamadı');
      }finally{
        btn.disabled = false;
      }
    });
  }

  // REGISTER
  const regForm = $('#regForm');
  if (regForm){
    const msg = $('#regMsg');
    bindToggle('#toggleRegPass', '#regPass');

    regForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      clearMsg(msg);
      const btn = regForm.querySelector('[type="submit"]');
      btn.disabled = true;

      const fd = new FormData(regForm);
      const pass = String(fd.get('password')||'');
      const pass2 = String(fd.get('password2')||'');
      const accepted = document.querySelector('#terms')?.checked;

      if (pass.length < 6) { showMsg(msg,'Şifre en az 6 karakter olmalı'); btn.disabled=false; return; }
      if (pass !== pass2) { showMsg(msg,'Şifreler eşleşmiyor'); btn.disabled=false; return; }
      if (!accepted)      { showMsg(msg,'Şartları kabul etmelisiniz'); btn.disabled=false; return; }

      const payload = {
        full_name: String(fd.get('full_name')||'').trim(),
        username:  String(fd.get('username')||'').trim(),
        email:     String(fd.get('email')||'').trim(),
        phone_e164:String(fd.get('phone_e164')||'').trim(),
        password:  pass,
        tc_no:     String(fd.get('tc_no')||'').trim()
      };

      try{
        const r = await fetch(`${API_BASE}/api/auth/register`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await r.json().catch(()=>({}));
        if(!r.ok || data.ok===false) throw new Error(data.error||data.message||`HTTP ${r.status}`);

        showMsg(msg, 'Kayıt başarılı! Oturum açıldı, yönlendiriliyorsunuz…', 'success');
        location.href = '/';

      }catch(err){
        // ör: “email already exists”, “username taken”
        showMsg(msg, err.message || 'Kayıt başarısız');
      }finally{
        btn.disabled = false;
      }
    });
  }
})();
