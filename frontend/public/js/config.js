// frontend/public/js/config.js

// Development (local) ve production için API endpoint belirle
const host = location.hostname;
let apiBase;

if (host === 'localhost' || host === '127.0.0.1') {
  // local geliştirme
  apiBase = 'http://localhost:3000';
} else {
  // prod
  apiBase = 'https://api.eskisiniveryenisinial.com';
}

window.APP = {
  API_BASE: apiBase
};
