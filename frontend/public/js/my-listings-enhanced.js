// Enhanced My Listings JavaScript
console.log('[MY-LISTINGS-ENHANCED] script loaded');

(function () {
  'use strict';
  
  const API_BASE = (window.APP && window.APP.API_BASE) || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => r.querySelectorAll(s);

  // State management
  let currentPage = 1;
  let pageSize = 12;
  let totalItems = 0;
  let totalPages = 0;
  let currentListings = [];
  let isLoading = false;
  let currentView = 'grid'; // 'grid' or 'list'

  // Filters
  let currentFilters = {
    search: '',
    status: '',
    sort: 'newest'
  };

  // Utility functions
  const esc = s => String(s ?? '').replace(/[&<>"'`]/g, m =>
    m === '&' ? '&amp;' :
    m === '<' ? '&lt;'  :
    m === '>' ? '&gt;'  :
    m === '"' ? '&quot;':
    m === "'" ? '&#39;' :
    '&#96;'
  );

  const formatPrice = (priceMinor, currency = 'TRY') => {
    const amount = (Number(priceMinor) || 0) / 100;
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  const showNotification = (message, type = 'info') => {
    // Simple notification system
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '8px',
      zIndex: '10000',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  // Authentication check
  async function requireLogin() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error('Not authenticated');
      
      const data = await response.json();
      return data.user || data;
    } catch (error) {
      const loginUrl = new URL('/login.html', location.origin);
      loginUrl.searchParams.set('redirect', location.pathname + location.search);
      location.href = loginUrl.toString();
      throw error;
    }
  }

  // API functions
  async function fetchListings() {
    if (isLoading) return;
    isLoading = true;
    
    showLoadingState();
    
    try {
      const url = new URL('/api/listings/my', API_BASE);
      url.searchParams.set('page', currentPage.toString());
      url.searchParams.set('size', pageSize.toString());
      
      // Add filters to query
      if (currentFilters.search) {
        url.searchParams.set('q', currentFilters.search);
      }
      if (currentFilters.status) {
        url.searchParams.set('status', currentFilters.status);
      }
      if (currentFilters.sort) {
        url.searchParams.set('sort', currentFilters.sort);
      }

      const response = await fetch(url.toString(), {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      currentListings = data.items || [];
      totalItems = Number(data.total || 0);
      totalPages = Math.ceil(totalItems / pageSize);

      updateStats(data.stats || {});
      renderListings();
      updatePagination();
      
    } catch (error) {
      console.error('Error fetching listings:', error);
      showError('İlanlar yüklenirken bir hata oluştu.');
    } finally {
      isLoading = false;
      hideLoadingState();
    }
  }

  // UI Update functions
  function updateStats(stats = {}) {
    const totalCount = $('#totalCount');
    const activeCount = $('#activeCount');
    const viewsCount = $('#viewsCount');
    const favoritesCount = $('#favoritesCount');

    if (totalCount) totalCount.textContent = totalItems.toString();
    if (activeCount) activeCount.textContent = (stats.active || currentListings.filter(l => l.status === 'active').length).toString();
    if (viewsCount) viewsCount.textContent = (stats.totalViews || currentListings.reduce((sum, l) => sum + (l.views_count || 0), 0)).toString();
    if (favoritesCount) favoritesCount.textContent = (stats.totalFavorites || currentListings.reduce((sum, l) => sum + (l.favorites_count || 0), 0)).toString();
  }

  function showLoadingState() {
    const loadingState = $('#loadingState');
    const listingsContainer = $('#listings');
    const emptyState = $('#emptyState');
    const noResultsState = $('#noResultsState');

    if (loadingState) loadingState.style.display = 'block';
    if (listingsContainer) listingsContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (noResultsState) noResultsState.style.display = 'none';
  }

  function hideLoadingState() {
    const loadingState = $('#loadingState');
    const listingsContainer = $('#listings');

    if (loadingState) loadingState.style.display = 'none';
    if (listingsContainer) listingsContainer.style.display = currentView === 'grid' ? 'grid' : 'flex';
  }

  function showError(message) {
    const listingsContainer = $('#listings');
    if (listingsContainer) {
      listingsContainer.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Hata Oluştu</h3>
          <p>${esc(message)}</p>
          <button type="button" class="btn btn-primary" onclick="window.MyListings.reload()">
            Tekrar Deneyin
          </button>
        </div>
      `;
      listingsContainer.style.display = 'flex';
      listingsContainer.style.justifyContent = 'center';
      listingsContainer.style.alignItems = 'center';
      listingsContainer.style.minHeight = '300px';
    }
  }

  function renderListings() {
    const container = $('#listings');
    const emptyState = $('#emptyState');
    const noResultsState = $('#noResultsState');
    
    if (!container) return;

    // Handle empty states
    if (currentListings.length === 0) {
      container.style.display = 'none';
      
      // Show appropriate empty state
      if (hasActiveFilters()) {
        if (noResultsState) noResultsState.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';
      } else {
        if (emptyState) emptyState.style.display = 'block';
        if (noResultsState) noResultsState.style.display = 'none';
      }
      return;
    }

    // Hide empty states
    if (emptyState) emptyState.style.display = 'none';
    if (noResultsState) noResultsState.style.display = 'none';

    // Set container view class
    container.className = `listings-container ${currentView}-view`;
    container.style.display = currentView === 'grid' ? 'grid' : 'flex';

    // Render listings
    container.innerHTML = currentListings.map(listing => createListingCard(listing)).join('');

    // Wire up event listeners for actions
    wireListingActions();
  }

  function createListingCard(listing) {
    const imageUrl = listing.thumb_url || listing.cover || '/assets/placeholder.png';
    const price = formatPrice(listing.price_minor || (listing.price * 100), listing.currency);
    const statusClass = `status-${listing.status || 'active'}`;
    const statusText = getStatusText(listing.status);
    
    const viewUrl = listing.slug 
      ? `/listing.html?slug=${encodeURIComponent(listing.slug)}`
      : `/listing.html?id=${encodeURIComponent(listing.id)}`;

    return `
      <article class="listing-card" data-listing-id="${listing.id}">
        <div class="listing-image">
          <img src="${esc(imageUrl)}" alt="${esc(listing.title)}" 
               onerror="this.src='/assets/placeholder.png';this.onerror=null;">
          <div class="listing-status ${statusClass}">${statusText}</div>
        </div>
        
        <div class="listing-content">
          <div class="listing-info">
            <h3 class="listing-title">${esc(listing.title || 'Başlıksız İlan')}</h3>
            <div class="listing-category">${esc(listing.category_name || 'Kategori belirtilmemiş')}</div>
            <div class="listing-price">${price}</div>
            
            <div class="listing-meta">
              <div class="meta-item">
                <span>👁️</span>
                <span>${listing.views_count || 0} görüntülenme</span>
              </div>
              <div class="meta-item">
                <span>❤️</span>
                <span>${listing.favorites_count || 0} favori</span>
              </div>
              <div class="meta-item">
                <span>📅</span>
                <span>${formatDate(listing.created_at)}</span>
              </div>
            </div>
          </div>
          
          <div class="listing-actions">
            <a href="${viewUrl}" class="btn btn-primary">Görüntüle</a>
            <a href="/sell.html?edit=${encodeURIComponent(listing.slug || listing.id)}" class="btn btn-secondary">Düzenle</a>
            <button type="button" class="btn btn-danger btn-delete" data-listing-id="${listing.id}">
              Sil
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function getStatusText(status) {
    const statusMap = {
      'active': 'Aktif',
      'inactive': 'Pasif',
      'sold': 'Satıldı',
      'pending': 'Beklemede',
      'expired': 'Süresi Doldu'
    };
    return statusMap[status] || 'Aktif';
  }

  function wireListingActions() {
    // Delete buttons
    $('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const listingId = btn.dataset.listingId;
        await handleDeleteListing(listingId);
      });
    });
  }

  async function handleDeleteListing(listingId) {
    if (!confirm('Bu ilanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }

    try {
      // Find the listing to get its slug
      const listing = currentListings.find(l => l.id == listingId);
      const identifier = listing?.slug || listingId;

      const response = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(identifier)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      showNotification('İlan başarıyla silindi', 'success');
      
      // Reload current page
      await fetchListings();
      
    } catch (error) {
      console.error('Error deleting listing:', error);
      showNotification('İlan silinirken bir hata oluştu', 'error');
    }
  }

  function updatePagination() {
    const container = $('#paginationContainer');
    const infoElement = $('#paginationInfo');
    
    if (!container) return;

    // Hide pagination if not needed
    if (totalPages <= 1) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'block';

    // Update info text
    if (infoElement) {
      const start = (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, totalItems);
      infoElement.textContent = `${start}-${end} / ${totalItems} ilan gösteriliyor`;
    }

    // Update page controls
    const firstBtn = $('#firstPage');
    const prevBtn = $('#prevPage');
    const nextBtn = $('#nextPage');
    const lastBtn = $('#lastPage');

    if (firstBtn) firstBtn.disabled = currentPage === 1;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    if (lastBtn) lastBtn.disabled = currentPage === totalPages;

    // Update page numbers
    updatePageNumbers();
  }

  function updatePageNumbers() {
    const container = $('#pageNumbers');
    if (!container) return;

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    let html = '';
    
    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? ' active' : '';
      html += `
        <button type="button" class="page-number${activeClass}" data-page="${i}">
          ${i}
        </button>
      `;
    }

    container.innerHTML = html;

    // Wire up page number clicks
    $('.page-number').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page);
        if (page !== currentPage) {
          currentPage = page;
          fetchListings();
        }
      });
    });
  }

  function setupEventListeners() {
    // Search input
    const searchInput = $('#searchInput');
    const searchBtn = $('#searchBtn');
    
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          currentFilters.search = searchInput.value.trim();
          currentPage = 1;
          fetchListings();
        }, 500);
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        if (searchInput) {
          currentFilters.search = searchInput.value.trim();
          currentPage = 1;
          fetchListings();
        }
      });
    }

    // Filter controls
    const statusFilter = $('#statusFilter');
    const sortFilter = $('#sortFilter');

    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        currentFilters.status = statusFilter.value;
        currentPage = 1;
        fetchListings();
      });
    }

    if (sortFilter) {
      sortFilter.addEventListener('change', () => {
        currentFilters.sort = sortFilter.value;
        currentPage = 1;
        fetchListings();
      });
    }

    // View toggle
    const gridViewBtn = $('#gridView');
    const listViewBtn = $('#listView');

    if (gridViewBtn) {
      gridViewBtn.addEventListener('click', () => {
        currentView = 'grid';
        gridViewBtn.classList.add('active');
        listViewBtn?.classList.remove('active');
        renderListings();
        localStorage.setItem('myListingsView', 'grid');
      });
    }

    if (listViewBtn) {
      listViewBtn.addEventListener('click', () => {
        currentView = 'list';
        listViewBtn.classList.add('active');
        gridViewBtn?.classList.remove('active');
        renderListings();
        localStorage.setItem('myListingsView', 'list');
      });
    }

    // Pagination controls
    const firstBtn = $('#firstPage');
    const prevBtn = $('#prevPage');
    const nextBtn = $('#nextPage');
    const lastBtn = $('#lastPage');

    if (firstBtn) {
      firstBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage = 1;
          fetchListings();
        }
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          fetchListings();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          fetchListings();
        }
      });
    }

    if (lastBtn) {
      lastBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage = totalPages;
          fetchListings();
        }
      });
    }
  }

  function hasActiveFilters() {
    return !!(currentFilters.search || currentFilters.status || currentFilters.sort !== 'newest');
  }

  function initializeView() {
    // Restore saved view preference
    const savedView = localStorage.getItem('myListingsView');
    if (savedView === 'list') {
      currentView = 'list';
      $('#listView')?.classList.add('active');
      $('#gridView')?.classList.remove('active');
    }
  }

  // Public API
  window.MyListings = {
    reload: fetchListings,
    applyFilters: () => {
      currentPage = 1;
      fetchListings();
    },
    setView: (view) => {
      if (view === 'grid' || view === 'list') {
        currentView = view;
        renderListings();
      }
    }
  };

  // Initialize
  async function initialize() {
    if (!$('#listings')) return; // Not on my listings page

    try {
      await requireLogin();
      initializeView();
      setupEventListeners();
      await fetchListings();
    } catch (error) {
      console.error('Failed to initialize my listings:', error);
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Also listen for partials loaded event
  document.addEventListener('partials:loaded', initialize);

})();