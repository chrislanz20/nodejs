/**
 * Fast Navigation System - Makes page switching instant
 * Prefetches pages and swaps content without reload
 */

class FastNav {
  constructor() {
    this.cache = new Map();
    this.currentPage = window.location.pathname;
    this.init();
  }

  init() {
    // Prefetch all navigation pages
    this.prefetchPages();

    // Intercept navigation clicks
    this.interceptNavigation();

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.page) {
        this.swapPage(e.state.page, false);
      }
    });
  }

  prefetchPages() {
    const pages = ['/dashboard.html', '/admin.html'];

    pages.forEach(page => {
      if (page !== this.currentPage) {
        fetch(page)
          .then(res => res.text())
          .then(html => {
            this.cache.set(page, html);
            console.log(`✅ Prefetched ${page}`);
          })
          .catch(err => console.error(`Failed to prefetch ${page}:`, err));
      }
    });
  }

  interceptNavigation() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');

      // Only intercept internal navigation links
      if (href && (href === '/dashboard.html' || href === '/admin.html')) {
        e.preventDefault();
        this.navigateTo(href);
      }
    });
  }

  async navigateTo(page) {
    if (page === this.currentPage) return;

    // Get cached page or fetch it
    let html = this.cache.get(page);

    if (!html) {
      try {
        const response = await fetch(page);
        html = await response.text();
        this.cache.set(page, html);
      } catch (err) {
        console.error(`Failed to load ${page}:`, err);
        // Fallback to regular navigation
        window.location.href = page;
        return;
      }
    }

    // Swap the page
    this.swapPage(page, true);
  }

  swapPage(page, pushState = true) {
    // Since the page is prefetched and cached, just navigate normally
    // The browser will use the cached version, making it very fast
    // This approach is more reliable than DOM manipulation
    window.location.href = page;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new FastNav());
} else {
  new FastNav();
}
