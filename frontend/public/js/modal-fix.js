// Modal fix script - Add this to ensure proper modal behavior
(function() {
  'use strict';

  // Enhanced modal positioning fix
  function fixModalPositioning() {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;

    // Ensure modal is properly positioned
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '99999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Scroll page to top if needed
    if (window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Enhanced close modal function
  function closeModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) {
      modal.remove();
    }
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
  }

  // Override BILLING showUpgradeModal if it exists
  if (window.BILLING) {
    const originalShowUpgradeModal = window.BILLING.showUpgradeModal;
    const originalClosePaymentModal = window.BILLING.closePaymentModal;
    
    window.BILLING.showUpgradeModal = async function(planCode) {
      await originalShowUpgradeModal.call(this, planCode);
      // Apply fix after modal is created
      setTimeout(fixModalPositioning, 100);
    };

    window.BILLING.closePaymentModal = function() {
      closeModal();
    };
  }

  // Global event listeners for modal
  document.addEventListener('click', function(e) {
    // Close on overlay click
    if (e.target.classList.contains('modal-overlay')) {
      closeModal();
    }
    
    // Close button
    if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
      e.preventDefault();
      closeModal();
    }
  });

  // Escape key to close
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  });

  // Monitor for modal creation
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1 && node.id === 'paymentModal') {
          fixModalPositioning();
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: false
  });

})();