
Eskisini — Tam Yetkilendirme Düzeltmeleri (Node.js 22 + bcryptjs + Cookie JWT)

Neler düzeltildi?
-----------------
1) bcrypt -> bcryptjs
   - backend/routes/auth.js zaten bcryptjs kullanıyordu. Lokal ortamda "Cannot find package 'bcrypt'" hatasını almaman için tamamen bcryptjs ile uyumlu.

2) Cookie tabanlı oturum (HTTP-only)
   - backend/mw/auth.js: Bearer token *ve* cookie (`token`) destekli olacak şekilde güncellendi.
   - backend/routes/auth.js:
     * /register ve /login: token oluşturulunca HTTP-only cookie olarak set ediliyor.
     * /logout: token cookie temizleniyor.
   - backend/server.js: cookie-parser eklendi.

   Ortam değişkenleri:
     COOKIE_DOMAIN   = .eskisiniveryenisinial.com   (prod için; localhost'ta boş bırak)
     COOKIE_SECURE   = true                         (prod HTTPS’te true; localhost’ta false)
     COOKIE_SAMESITE = none|lax|strict              (prod farklı origin ise 'none', aksi halde 'lax')

3) CORS
   - server.js zaten `credentials:true` kullanıyor. .env’de CORS_ORIGIN'i doğru ayarlayın:
     CORS_ORIGIN=https://eskisiniveryenisinial.com,https://www.eskisiniveryenisinial.com

4) Frontend entegrasyonu
   - frontend/public/js/partials.js: `partials:loaded` olayı **includePartials() tamamlandıktan sonra** tetiklenecek şekilde düzeltildi.
   - frontend/public/js/auth.js: API_BASE algısı, `window.APP.API_BASE` > `window.API_BASE` > '' sırasıyla.
   - login.html & register.html: `js/config.js` dahil edildi. (APP.API_BASE = http://localhost:3000 gibi)
   - Header hidrasyonu: `auth.js` zaten `partials:loaded` olayını dinliyor. Artık partialler yüklendikten sonra header’da kullanıcı bilgisi görünür.

Nasıl çalıştırılır?
-------------------
1) Backend
   - .env örneği:
       PORT=3000
       DB_HOST=127.0.0.1
       DB_PORT=3306
       DB_USER=root
       DB_PASS=yourpass
       DB_NAME=eskisini
       JWT_SECRET=change-this
       CORS_ORIGIN=http://localhost:8080,http://127.0.0.1:8080
       COOKIE_SECURE=false
       COOKIE_SAMESITE=lax
   - `cd backend && npm i && npm start`

2) Frontend (statik)
   - `cd frontend && node server.static.js`
   - http://localhost:8080 açın (server.static.js bu portu kullanıyorsa).
   - `frontend/public/js/config.js` içinde `API_BASE`'i backend portuna göre ayarlayın.

Hızlı test akışı
----------------
- Kayıt: /register.html → formu doldur → Network: /api/auth/register 200 + Set-Cookie: token
- Giriş:  /login.html → Network: /api/auth/login    200 + Set-Cookie: token
- Me:     /api/auth/me → 200 { ok:true, user } (cookie tabanlı)
- Header: sayfa yenilemeden de kullanıcı chip’i görünür (partials:loaded sonrası hydrate).

Notlar
------
- Eğer prod’da farklı subdomain kullanıyorsanız (api. ve www.), COOKIE_SECURE=true, COOKIE_SAMESITE=none ve COOKIE_DOMAIN=.yourdomain.com ayarlarını unutmayın.
- Eski kullanıcı şifreleri `bcryptjs` ile uyumludur; yine de test bir kullanıcıyla doğrulama yapın.
