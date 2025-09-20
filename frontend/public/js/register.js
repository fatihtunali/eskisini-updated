// js/register.js
(function (){
  'use strict';
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s,r=document)=>r.querySelector(s);

  function setErr(el, msg){ if(!el) return; el.textContent = msg || ''; el.hidden = !msg; }

  function normalizePhone(v){
    if(!v) return null;
    let raw = String(v).replace(/[^\d+]/g,'');
    if(/^0\d{10}$/.test(raw)) raw = '+9' + raw;     // 0xxxxxxxxxx -> +90...
    if(/^90\d{10}$/.test(raw)) raw = '+' + raw;     // 90xxxxxxxxxx -> +90...
    if(!/^\+\d{8,15}$/.test(raw)) return null;
    return raw;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form#f[data-auth="register"]');
    if (!form) return;

    // üstte hoş bir hata alanı
    let err = form.querySelector('.form-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'form-error';
      err.setAttribute('role','alert');
      err.style.cssText = 'margin:8px 0;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;padding:8px;border-radius:8px;';
      err.hidden = true;
      form.insertBefore(err, form.firstChild.nextSibling);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr(err, '');

      const fd = new FormData(form);
      const full_name  = (fd.get('full_name')  || '').toString().trim();
      const username   = (fd.get('username')   || '').toString().trim();
      const email      = (fd.get('email')      || '').toString().trim().toLowerCase();
      const password   = (fd.get('password')   || '').toString();
      const password2  = (fd.get('password2')  || '').toString();
      const phone_raw  = (fd.get('phone_e164') || '').toString().trim();
      const tc_no_raw  = (fd.get('tc_no')      || '').toString().trim();

      // basit kontroller
      if (!email || !password) {
        setErr(err, 'E-posta ve şifre gerekli.');
        return;
      }
      if (password.length < 6) {
        setErr(err, 'Şifre en az 6 karakter olmalı.');
        return;
      }
      if (password !== password2) {
        setErr(err, 'Şifreler aynı olmalı.');
        return;
      }

      const phone_e164 = phone_raw ? normalizePhone(phone_raw) : null;
      if (phone_raw && !phone_e164) {
        setErr(err, 'Telefon numarası E.164 formatında olmalı. Örn: +905551112233');
        return;
      }

      let tc_no = null;
      if (tc_no_raw) {
        const digits = tc_no_raw.replace(/\D/g,'');
        if (digits.length !== 11) {
          setErr(err, 'TC Kimlik No 11 hane olmalı.');
          return;
        }
        tc_no = digits;
      }

      const payload = { email, password, full_name, username, phone_e164, tc_no };

      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(()=>({}));
        if (!res.ok || data?.ok === false) {
          // backend’teki Türkçe hata kodlarını güzelce eşleyelim
          const map = {
            email_kayitli:        'Bu e-posta zaten kayıtlı.',
            kullanici_adi_kayitli:'Bu kullanıcı adı zaten alınmış.',
            kullanici_adi_kisa:   'Kullanıcı adı en az 3 karakter olmalı.',
            telefon_gecersiz:     'Telefon formatı geçersiz.',
            telefon_kayitli:      'Bu telefon zaten kayıtlı.',
            tc_gecersiz:          'TC Kimlik No geçersiz.',
            tc_kayitli:           'Bu TC Kimlik No zaten kayıtlı.',
            eksik_alan:           'Zorunlu alanlar eksik.',
            sunucu_hatasi:        'Sunucu hatası. Lütfen tekrar deneyin.'
          };
          const msg = map[data?.error] || data?.message || 'Kayıt başarısız.';
          setErr(err, msg);
          return;
        }

        // Başarılı — header’ı güncelle, yönlendir
        document.dispatchEvent(new CustomEvent('auth:login', { detail: { user: data.user } }));
        const u = new URL(location.href);
        const redirect = u.searchParams.get('redirect') || '/';
        location.href = redirect;

      } catch (ex) {
        setErr(err, 'Ağ hatası. Tekrar deneyin.');
      }
    });
  });
})();
