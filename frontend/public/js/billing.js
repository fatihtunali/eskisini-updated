// public/js/billing.js - Billing system frontend entegrasyonu (düzeltilmiş)

(function() {
  'use strict';

  const API_BASE = (window.APP && window.APP.API_BASE) || '';

  // ---------- Utilities ----------
  const formatPrice = (price_minor, currency = 'TRY') => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency
    }).format((price_minor || 0) / 100);
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

  // ---------- Notifications ----------
  function showNotification(message, type = 'success', duration = 4000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">
          ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
        </span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        .notification {
          position: fixed; top: 20px; right: 20px; z-index: 10000;
          min-width: 300px; max-width: 500px; border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform: translateX(100%);
          transition: transform 0.3s ease;
        }
        .notification.success { background: #10b981; color: #fff; }
        .notification.error { background: #ef4444; color: #fff; }
        .notification.warning { background: #f59e0b; color: #fff; }
        .notification.info { background: #3b82f6; color: #fff; }
        .notification-content { display: flex; align-items: center; padding: 12px 16px; gap: 8px; }
        .notification-message { flex: 1; font-weight: 500; }
        .notification-close {
          background: rgba(255,255,255,0.2); border: none; color: inherit;
          width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1;
        }
        .notification-close:hover { background: rgba(255,255,255,0.3); }
        .notification.show { transform: translateX(0); }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);

    if (duration > 0) {
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }

    return notification;
  }

  // ---------- Billing API ----------
  class BillingAPI {
    static async request(endpoint, options = {}) {
      try {
        const response = await fetch(`${API_BASE}/api/billing${endpoint}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers || {})
          },
          method: options.method || 'GET',
          body: options.body ?? null
        });

        // Bazı 204/empty body durumları için guard
        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : {};

        if (!response.ok) {
          const msg = data?.message || `HTTP ${response.status}`;
          throw new Error(msg);
        }
        return data;
      } catch (error) {
        console.error(`Billing API Error [${endpoint}]:`, error);
        throw error;
      }
    }

    static getCurrentPlan() { return this.request('/me'); }
    static getPlans() { return this.request('/plans'); }
    static checkQuota(action) { return this.request(`/quota/${encodeURIComponent(action)}`); }

    static useCredit(type, listingId = null) {
      return this.request('/use-credit', {
        method: 'POST',
        body: JSON.stringify({ type, listing_id: listingId })
      });
    }

    static subscribeToPlan(planCode, paymentData) {
      return this.request(`/subscribe/${encodeURIComponent(planCode)}`, {
        method: 'POST',
        body: JSON.stringify({ payment_data: paymentData })
      });
    }

    static cancelSubscription() { return this.request('/cancel', { method: 'POST' }); }
  }

  // ---------- UI Pieces ----------
  function createPlanBadge(planCode, planName = null) {
    const name = planName || planCode;
    const className = `plan-badge plan-${planCode}`;
    return `<span class="${className}">${esc(name)}</span>`;
  }

  function createCurrentPlanDisplay(data) {
    const plan = data.effective_plan;
    const usage = data.usage || {};
    const subscription = data.subscription;

    return `
      <div class="current-plan-card">
        <div class="plan-header">
          <div class="plan-icon">📋</div>
          <div class="plan-info">
            <div class="plan-name">${esc(plan.name)}</div>
            <div class="plan-price">${formatPrice(plan.price_minor)}</div>
          </div>
          ${createPlanBadge(plan.code, plan.name)}
        </div>

        ${subscription && subscription.status === 'active' ? `
          <div class="subscription-info">
            <div class="subscription-period">
              Geçerlilik: ${new Date(subscription.current_period_start).toLocaleDateString('tr-TR')} -
              ${new Date(subscription.current_period_end).toLocaleDateString('tr-TR')}
            </div>
          </div>
        ` : ''}

        <div class="usage-summary">
          <div class="usage-item">
            <span class="usage-label">📝 İlanlar</span>
            <span class="usage-value">${usage.listings ?? 0}/${plan.listing_quota_month === 9999 ? '∞' : plan.listing_quota_month}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">⬆️ Yukarı Çıkarma</span>
            <span class="usage-value">${usage.bumps ?? 0}/${plan.bump_credits_month}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">⭐ Öne Çıkarma</span>
            <span class="usage-value">${usage.features ?? 0}/${plan.featured_credits_month}</span>
          </div>
        </div>

        ${plan.code !== 'business' ? `
          <div class="upgrade-section">
            <button class="btn btn-primary btn-upgrade" data-upgrade="${plan.code === 'free' ? 'pro' : 'business'}">
              ${plan.code === 'free' ? 'Pro\'ya Yükselt' : 'Business\'a Yükselt'}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function createUsageBar(used, quota, label) {
    const isUnlimited = quota === 9999;
    const percentage = isUnlimited ? 0 : Math.min((used / quota) * 100, 100);
    const remaining = isUnlimited ? '∞' : Math.max(quota - used, 0);

    let statusClass = '';
    if (!isUnlimited) {
      if (percentage >= 90) statusClass = 'danger';
      else if (percentage >= 70) statusClass = 'warning';
    }

    return `
      <div class="usage-bar-container">
        <div class="usage-bar-header">
          <span class="usage-label">${label}</span>
          <span class="usage-stats">
            ${used}/${isUnlimited ? '∞' : quota}
            <span class="usage-remaining">(${remaining} kalan)</span>
          </span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill ${statusClass}" style="width: ${percentage}%;"></div>
        </div>
        ${!isUnlimited && percentage >= 90 && remaining === 0 ? `
          <div class="usage-warning">⚠️ Limitiniz doldu! Planınızı yükselterek daha fazla hak elde edin.</div>
        ` : (!isUnlimited && percentage >= 70) ? `
          <div class="usage-warning warning">⚡ Limitiniz dolmak üzere!</div>
        ` : ''}
      </div>
    `;
  }

  function createPremiumButton(type, listingId, userPlan, usage) {
    const isListing = type === 'listing';
    const isBump = type === 'bump';
    const isFeature = type === 'feature';

    let quota, used, label, icon;

    if (isListing) {
      quota = userPlan.listing_quota_month;
      used = usage.listings || 0;
      label = 'Yeni İlan Ver';
      icon = '📝';
    } else if (isBump) {
      quota = userPlan.bump_credits_month;
      used = usage.bumps || 0;
      label = 'Yukarı Çıkar';
      icon = '⬆️';
    } else if (isFeature) {
      quota = userPlan.featured_credits_month;
      used = usage.features || 0;
      label = 'Öne Çıkar';
      icon = '⭐';
    } else {
      quota = 0; used = 0; label = 'Aksiyon'; icon = '⚙️';
    }

    const remaining = quota === 9999 ? 9999 : Math.max(quota - used, 0);
    const canUse = remaining > 0;

    let buttonClass = 'btn premium-btn';
    let buttonText = label;
    let clickHandler = '';

    if (!canUse && quota === 0) {
      // Free planda olmayan özellik (veya quota 0)
      buttonClass += ' btn-secondary';
      buttonText = 'Pro Özelliği';
      clickHandler = `onclick="BILLING.showUpgradeModal('pro')"`;
    } else if (!canUse) {
      // Kota dolu
      buttonClass += ' btn-disabled';
      buttonText = 'Limit Doldu';
    } else {
      // Kullanılabilir
      buttonClass += ' btn-primary';
      if (!isListing) buttonText += ` (${remaining} kalan)`;
      const method = isBump ? 'useBump' : isFeature ? 'useFeature' : 'useListing';
      clickHandler = `onclick="BILLING.${method}(${listingId ?? 'null'})"`;
    }

    return `<button class="${buttonClass}" ${clickHandler} ${!canUse && quota > 0 ? 'disabled' : ''}>${icon} ${buttonText}</button>`;
  }

  function createPaymentModal(plan, currentPlan) {
    return `
      <div class="modal-overlay" id="paymentModal" onclick="if(event.target===this) BILLING.closePaymentModal()">
        <div class="modal-content payment-modal">
          <div class="modal-header">
            <h3>Plan Yükseltme</h3>
            <button class="modal-close" onclick="BILLING.closePaymentModal()">×</button>
          </div>

          <div class="plan-upgrade-info">
            <div class="upgrade-from-to">
              ${createPlanBadge(currentPlan.code, currentPlan.name)}
              <span class="upgrade-arrow">→</span>
              ${createPlanBadge(plan.code, plan.name)}
            </div>
          </div>

          <div class="payment-summary">
            <div class="summary-row"><span>Plan:</span><span>${esc(plan.name)}</span></div>
            <div class="summary-row"><span>Aylık Ücret:</span><span>${formatPrice(plan.price_minor)}</span></div>
            <div class="summary-row total"><span>Toplam:</span><span>${formatPrice(plan.price_minor)}</span></div>
          </div>

          <div class="what-you-get">
            <h4>Neler Kazanıyorsunuz:</h4>
            <ul>
              ${plan.perks && Array.isArray(plan.perks)
                ? plan.perks.map(perk => `<li>✅ ${esc(perk)}</li>`).join('')
                : `
                  <li>✅ ${plan.listing_quota_month === 9999 ? 'Sınırsız' : plan.listing_quota_month} ilan/ay</li>
                  <li>✅ ${plan.bump_credits_month} yukarı çıkarma kredisi</li>
                  <li>✅ ${plan.featured_credits_month} öne çıkarma kredisi</li>
                `}
            </ul>
          </div>

          <form class="payment-form" id="paymentForm" novalidate>
            <div class="form-group">
              <label>Kart Numarası</label>
              <input type="text" id="cardNumber" placeholder="1234 5678 9012 3456" inputmode="numeric" autocomplete="cc-number" maxlength="19" required>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Son Kullanma</label>
                <input type="text" id="cardExpiry" placeholder="MM/YY" inputmode="numeric" autocomplete="cc-exp" maxlength="5" required>
              </div>
              <div class="form-group">
                <label>CVV</label>
                <input type="text" id="cardCvv" placeholder="123" inputmode="numeric" autocomplete="cc-csc" maxlength="3" required>
              </div>
            </div>

            <div class="form-group">
              <label>Kart Sahibi</label>
              <input type="text" id="cardName" placeholder="JOHN DOE" autocomplete="cc-name" required>
            </div>

            <div class="form-actions">
              <button type="button" class="btn btn-secondary" onclick="BILLING.closePaymentModal()">İptal</button>
              <button type="submit" class="btn btn-primary">
                <span class="btn-text">Ödemeyi Tamamla</span>
                <span class="btn-loading" style="display: none;">İşleniyor...</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ---------- Main BILLING ----------
  window.BILLING = {
    currentPlan: null,
    currentUsage: null,
    currentSubscription: null,

    async init() {
      try {
        const data = await BillingAPI.getCurrentPlan();
        this.currentPlan = data.effective_plan;
        this.currentUsage = data.usage || {};
        this.currentSubscription = data.subscription || null;

        this.setupEventListeners();
        return data;
      } catch (error) {
        console.error('Billing init error:', error);
        showNotification('Plan bilgileri yüklenemedi', 'error');
        return null;
      }
    },

    setupEventListeners() {
      // Form input mask
      document.addEventListener('input', (e) => {
        if (e.target.id === 'cardNumber') {
          this.formatCardNumber(e.target);
        } else if (e.target.id === 'cardExpiry') {
          this.formatCardExpiry(e.target);
        } else if (e.target.id === 'cardCvv') {
          this.formatCVV(e.target);
        } else if (e.target.id === 'cardName') {
          e.target.value = e.target.value.toUpperCase();
        }
      });

      // Escape to close modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closePaymentModal();
      });

      // Upgrade buttons
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-upgrade]');
        if (btn) {
          const planCode = btn.dataset.upgrade;
          this.showUpgradeModal(planCode);
        }
      });
    },

    // ---- Input formatters ----
    formatCardNumber(input) {
      let value = input.value.replace(/\s/g, '').replace(/\D/g, '').slice(0, 16);
      input.value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
    },

    formatCardExpiry(input) {
      let value = input.value.replace(/\D/g, '').slice(0, 4);
      if (value.length >= 3) value = value.substring(0, 2) + '/' + value.substring(2, 4);
      input.value = value;
    },

    formatCVV(input) {
      input.value = input.value.replace(/\D/g, '').slice(0, 3);
    },

    // ---- Upgrade Modal ----
    async showUpgradeModal(planCode) {
      try {
        if (!this.currentPlan) await this.init();

        const plansData = await BillingAPI.getPlans();
        const targetPlan = plansData.plans.find(p => p.code === planCode);

        if (!targetPlan) return showNotification('Plan bulunamadı', 'error');
        if (targetPlan.code === this.currentPlan.code) return showNotification('Bu plan zaten aktif', 'info');

        const modalHTML = createPaymentModal(targetPlan, this.currentPlan);

        // Eski modalı kaldır
        document.getElementById('paymentModal')?.remove();

        // Modalı ekle ve göster
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const form = document.getElementById('paymentForm');
        form.onsubmit = (e) => {
          e.preventDefault();
          this.processPayment(targetPlan);
        };
      } catch (error) {
        console.error('Show upgrade modal error:', error);
        showNotification('Plan yükseltme ekranı açılamadı', 'error');
      }
    },

    closePaymentModal() {
      const modal = document.getElementById('paymentModal');
      if (modal) {
        modal.style.display = 'none';
        setTimeout(() => modal.remove(), 300);
      }
    },

    // ---- Payment ----
    async processPayment(plan) {
      const form = document.getElementById('paymentForm');
      const submitBtn = form.querySelector('button[type="submit"]');
      const btnText = submitBtn.querySelector('.btn-text');
      const btnLoading = submitBtn.querySelector('.btn-loading');

      const paymentData = {
        card_number: document.getElementById('cardNumber').value,
        card_expiry: document.getElementById('cardExpiry').value,
        card_cvv: document.getElementById('cardCvv').value,
        card_name: document.getElementById('cardName').value
      };

      if (!this.validatePaymentForm(paymentData)) return;

      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline';

      // Eski planı event için sakla
      const oldPlan = this.currentPlan;

      try {
        const result = await BillingAPI.subscribeToPlan(plan.code, paymentData);

        if (result.ok) {
          showNotification('🎉 Ödeme başarılı! Planınız yükseltildi.', 'success');
          this.closePaymentModal();

          // Plan verilerini tazele
          await this.init();

          // Doğru eski/yeni plan ile event
          document.dispatchEvent(new CustomEvent('billing:plan-updated', {
            detail: { newPlan: this.currentPlan, oldPlan }
          }));

          // Yönlendirme / yenileme
          setTimeout(() => {
            if (window.location.pathname.includes('profile')) {
              location.reload();
            } else {
              location.href = '/profile.html#billing';
            }
          }, 2000);
        } else {
          showNotification('Ödeme tamamlanamadı', 'error');
        }
      } catch (error) {
        console.error('Payment error:', error);
        showNotification(`Ödeme hatası: ${error.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    },

    validatePaymentForm(data) {
      const digits = (s) => (s || '').replace(/\D/g, '');

      // Kart numarası (Luhn yapmıyoruz; basit uzunluk/format)
      const num = digits(data.card_number);
      if (num.length < 16) {
        showNotification('Geçerli bir kart numarası girin', 'error');
        return false;
      }

      // Expiry MM/YY
      if (!/^\d{2}\/\d{2}$/.test(data.card_expiry)) {
        showNotification('Geçerli bir son kullanma tarihi girin (MM/YY)', 'error');
        return false;
      }
      const [mmStr, yyStr] = data.card_expiry.split('/');
      const mm = parseInt(mmStr, 10);
      const yy = parseInt(yyStr, 10);
      if (mm < 1 || mm > 12) {
        showNotification('Ay değeri 01-12 arasında olmalı', 'error');
        return false;
      }
      // Kartlar genellikle ayın SON günü 23:59’a kadar geçerlidir
      const year = 2000 + yy;
      // Ayın son günü
      const lastDay = new Date(year, mm, 0).getDate();
      const expiryEnd = new Date(year, mm - 1, lastDay, 23, 59, 59, 999);
      const now = new Date();
      if (expiryEnd < now) {
        showNotification('Kart son kullanma tarihi geçmiş', 'error');
        return false;
      }

      // CVV
      const cvv = digits(data.card_cvv);
      if (cvv.length !== 3) {
        showNotification('Geçerli bir CVV kodu girin', 'error');
        return false;
      }

      // İsim
      if (!data.card_name || data.card_name.trim().length < 2) {
        showNotification('Kart sahibinin adını girin', 'error');
        return false;
      }

      return true;
    },

    // ---- Quota / Credit ----
    async checkListingQuota() {
      try {
        return await BillingAPI.checkQuota('listing');
      } catch (error) {
        console.error('Listing quota check error:', error);
        return { canUse: false, remaining: 0 };
      }
    },

    async useListing(listingId = null) {
      try {
        const res = await BillingAPI.useCredit('listing', listingId);
        if (res.ok) {
          showNotification('📝 İlan hakkı kullanıldı!', 'success');
          if (this.currentUsage) this.currentUsage.listings = (this.currentUsage.listings || 0) + 1;

          document.dispatchEvent(new CustomEvent('billing:credit-used', {
            detail: { type: 'listing', listingId, remaining: res.remaining }
          }));

          return true;
        }
        showNotification('İlan hakkı kullanılamadı', 'error');
        return false;
      } catch (error) {
        console.error('Listing usage error:', error);
        if (String(error.message || '').includes('quota_exceeded')) {
          showNotification('İlan limitiniz doldu! Planınızı yükseltin.', 'warning');
          this.showUpgradeModal('pro');
        } else {
          showNotification('İlan hakkı kullanımı başarısız', 'error');
        }
        return false;
      }
    },

    async useBump(listingId = null) {
      try {
        const result = await BillingAPI.useCredit('bump', listingId);
        if (result.ok) {
          showNotification('✅ İlan yukarı çıkarıldı!', 'success');
          if (this.currentUsage) this.currentUsage.bumps = (this.currentUsage.bumps || 0) + 1;

          document.dispatchEvent(new CustomEvent('billing:credit-used', {
            detail: { type: 'bump', listingId, remaining: result.remaining }
          }));
          return true;
        }
        showNotification('Yukarı çıkarma gerçekleştirilemedi', 'error');
        return false;
      } catch (error) {
        console.error('Bump usage error:', error);
        if (String(error.message || '').includes('quota_exceeded')) {
          showNotification('Yukarı çıkarma limitiniz doldu! Planınızı yükseltin.', 'warning');
          this.showUpgradeModal('pro');
        } else {
          showNotification('Yukarı çıkarma işlemi başarısız', 'error');
        }
        return false;
      }
    },

    async useFeature(listingId = null) {
      try {
        const result = await BillingAPI.useCredit('feature', listingId);
        if (result.ok) {
          showNotification('⭐ İlan öne çıkarıldı!', 'success');
          if (this.currentUsage) this.currentUsage.features = (this.currentUsage.features || 0) + 1;

          document.dispatchEvent(new CustomEvent('billing:credit-used', {
            detail: { type: 'feature', listingId, remaining: result.remaining }
          }));
          return true;
        }
        showNotification('Öne çıkarma gerçekleştirilemedi', 'error');
        return false;
      } catch (error) {
        console.error('Feature usage error:', error);
        if (String(error.message || '').includes('quota_exceeded')) {
          showNotification('Öne çıkarma limitiniz doldu! Planınızı yükseltin.', 'warning');
          this.showUpgradeModal('pro');
        } else {
          showNotification('Öne çıkarma işlemi başarısız', 'error');
        }
        return false;
      }
    },

    async validateListingCreation() {
      try {
        const result = await BillingAPI.checkQuota('listing');
        if (!result.canUse) {
          showNotification('İlan limitiniz doldu! Planınızı yükseltin.', 'warning');
          this.showUpgradeModal('pro');
          return false;
        }
        if (result.remaining <= 2) {
          showNotification(`⚠️ İlan limitiniz dolmak üzere! ${result.remaining} ilan hakkınız kaldı.`, 'warning');
        }
        return true;
      } catch (error) {
        console.error('Listing validation error:', error);
        return false;
      }
    },

    // ---- Render helpers ----
    renderCurrentPlan(containerId) {
      const container = document.getElementById(containerId);
      if (!container || !this.currentPlan) return;
      container.innerHTML = createCurrentPlanDisplay({
        effective_plan: this.currentPlan,
        usage: this.currentUsage,
        subscription: this.currentSubscription
      });
    },

    renderUsageBars(containerId) {
      const container = document.getElementById(containerId);
      if (!container || !this.currentPlan || !this.currentUsage) return;

      const usage = this.currentUsage;
      const plan = this.currentPlan;

      container.innerHTML = `
        <div class="usage-bars">
          ${createUsageBar(usage.listings || 0, plan.listing_quota_month, '📝 İlanlar')}
          ${createUsageBar(usage.bumps || 0, plan.bump_credits_month, '⬆️ Yukarı Çıkarma')}
          ${createUsageBar(usage.features || 0, plan.featured_credits_month, '⭐ Öne Çıkarma')}
        </div>
      `;
    },

    // dışarı açılan util’ler
    createPremiumButton,
    createPlanBadge,
    formatPrice
  };

  // ---------- Auto init ----------
  const shouldInit = () =>
    window.location.pathname.includes('profile') ||
    window.location.pathname.includes('pricing') ||
    document.querySelector('[data-billing]');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (shouldInit()) window.BILLING.init(); });
  } else {
    if (shouldInit()) window.BILLING.init();
  }

  // Export API
  window.BillingAPI = BillingAPI;

})();
