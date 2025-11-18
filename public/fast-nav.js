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
    // Temporarily disabled - fallback to regular navigation
    // The page swap was causing JavaScript initialization issues
    window.location.href = page;
    return;

    /* Original swap code - commented out for now
    const html = this.cache.get(page);
    if (!html) {
      window.location.href = page;
      return;
    }

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Update title
    document.title = doc.title;

    // Replace body content
    document.body.innerHTML = doc.body.innerHTML;

    // Re-execute scripts in the new content
    const scripts = document.body.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });

    // Update URL
    if (pushState) {
      history.pushState({ page }, '', page);
    }

    this.currentPage = page;

    // Re-initialize fast nav on new page
    this.interceptNavigation();

    // Prefetch the other page
    this.prefetchPages();

    console.log(`⚡ Swapped to ${page} instantly!`);
    */
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new FastNav());
} else {
  new FastNav();
}
