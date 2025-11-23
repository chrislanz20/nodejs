/**
 * THE OMELETTE HEADQUARTERS - Menu Tabs
 * Handles interactive menu tab switching
 */

// ============================================
// MENU TAB FUNCTIONALITY
// ============================================

class MenuTabs {
  constructor() {
    this.tabs = document.querySelectorAll('.menu-tab');
    this.contents = document.querySelectorAll('.menu-tab-content');
    this.currentTab = 0;

    if (this.tabs.length === 0 || this.contents.length === 0) {
      console.warn('Menu tabs or content not found');
      return;
    }

    this.init();
  }

  init() {
    // Add click listeners to tabs
    this.tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.switchTab(index));

      // Keyboard accessibility
      tab.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.switchTab(index);
        }
      });

      // Arrow key navigation
      tab.addEventListener('keydown', (e) => {
        this.handleKeyNavigation(e, index);
      });
    });

    // Set first tab as active
    this.switchTab(0);
  }

  switchTab(index) {
    if (index < 0 || index >= this.tabs.length) return;

    // Update current tab
    this.currentTab = index;

    // Remove active class from all tabs and contents
    this.tabs.forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('tabindex', '-1');
    });

    this.contents.forEach(content => {
      content.classList.remove('active');
      content.setAttribute('hidden', '');
    });

    // Add active class to selected tab and content
    const activeTab = this.tabs[index];
    const tabId = activeTab.getAttribute('data-tab');
    const activeContent = document.getElementById(tabId);

    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    activeTab.setAttribute('tabindex', '0');
    activeTab.focus();

    if (activeContent) {
      activeContent.classList.add('active');
      activeContent.removeAttribute('hidden');

      // Trigger animation for menu cards
      this.animateMenuCards(activeContent);

      // Announce change to screen readers
      this.announceTabChange(activeTab.textContent);
    }

    // Save preference to localStorage
    this.saveTabPreference(tabId);

    // Analytics tracking (if you add analytics)
    this.trackTabSwitch(tabId);
  }

  animateMenuCards(container) {
    const cards = container.querySelectorAll('.menu-card');

    cards.forEach((card, index) => {
      // Reset animation
      card.style.animation = 'none';
      card.offsetHeight; // Trigger reflow
      card.style.animation = null;
      card.style.setProperty('--index', index);
    });
  }

  handleKeyNavigation(e, currentIndex) {
    let newIndex = currentIndex;

    switch(e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : this.tabs.length - 1;
        this.switchTab(newIndex);
        break;

      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = currentIndex < this.tabs.length - 1 ? currentIndex + 1 : 0;
        this.switchTab(newIndex);
        break;

      case 'Home':
        e.preventDefault();
        this.switchTab(0);
        break;

      case 'End':
        e.preventDefault();
        this.switchTab(this.tabs.length - 1);
        break;
    }
  }

  saveTabPreference(tabId) {
    try {
      localStorage.setItem('omeletteHQ_lastMenuTab', tabId);
    } catch (e) {
      // localStorage might not be available
      console.warn('Could not save tab preference:', e);
    }
  }

  loadTabPreference() {
    try {
      const savedTab = localStorage.getItem('omeletteHQ_lastMenuTab');

      if (savedTab) {
        const tabIndex = Array.from(this.tabs).findIndex(
          tab => tab.getAttribute('data-tab') === savedTab
        );

        if (tabIndex !== -1) {
          this.switchTab(tabIndex);
          return true;
        }
      }
    } catch (e) {
      console.warn('Could not load tab preference:', e);
    }

    return false;
  }

  announceTabChange(tabName) {
    // Create or update live region for screen readers
    let liveRegion = document.getElementById('menu-live-region');

    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'menu-live-region';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.position = 'absolute';
      liveRegion.style.left = '-10000px';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.overflow = 'hidden';
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = `${tabName} menu items displayed`;
  }

  trackTabSwitch(tabId) {
    // Placeholder for analytics tracking
    if (typeof gtag !== 'undefined') {
      gtag('event', 'menu_tab_switch', {
        'event_category': 'Menu',
        'event_label': tabId
      });
    }

    console.log(`Menu tab switched to: ${tabId}`);
  }

  // Public method to switch to a specific tab by ID
  showTab(tabId) {
    const index = Array.from(this.tabs).findIndex(
      tab => tab.getAttribute('data-tab') === tabId
    );

    if (index !== -1) {
      this.switchTab(index);
    }
  }

  // Public method to get current tab
  getCurrentTab() {
    return this.tabs[this.currentTab]?.getAttribute('data-tab');
  }
}

// ============================================
// MENU SEARCH/FILTER (BONUS FEATURE)
// ============================================

class MenuFilter {
  constructor() {
    this.createSearchInput();
  }

  createSearchInput() {
    const menuSection = document.querySelector('.menu');
    if (!menuSection) return;

    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'menu-search-container';
    searchContainer.style.cssText = `
      max-width: 500px;
      margin: 2rem auto 1rem;
      position: relative;
    `;

    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'menu-search';
    searchInput.placeholder = 'Search menu items...';
    searchInput.setAttribute('aria-label', 'Search menu items');
    searchInput.style.cssText = `
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 1rem;
      border: 2px solid var(--navy-primary);
      border-radius: 50px;
      outline: none;
      transition: all 0.3s ease;
    `;

    searchInput.addEventListener('focus', () => {
      searchInput.style.borderColor = 'var(--orange-primary)';
      searchInput.style.boxShadow = '0 0 0 3px rgba(255, 140, 66, 0.2)';
    });

    searchInput.addEventListener('blur', () => {
      searchInput.style.borderColor = 'var(--navy-primary)';
      searchInput.style.boxShadow = 'none';
    });

    // Add event listener for search
    searchInput.addEventListener('input', (e) => this.filterMenuItems(e.target.value));

    searchContainer.appendChild(searchInput);

    // Insert before menu tabs
    const menuTabs = menuSection.querySelector('.menu-tabs');
    if (menuTabs) {
      menuTabs.parentNode.insertBefore(searchContainer, menuTabs);
    }
  }

  filterMenuItems(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    // If empty, show all
    if (!term) {
      this.resetFilter();
      return;
    }

    // Search through all menu items
    const allMenuCards = document.querySelectorAll('.menu-card');
    let visibleCount = 0;

    allMenuCards.forEach(card => {
      const name = card.querySelector('.menu-item-name')?.textContent.toLowerCase() || '';
      const description = card.querySelector('.menu-item-description')?.textContent.toLowerCase() || '';

      const matches = name.includes(term) || description.includes(term);

      if (matches) {
        card.style.display = '';
        visibleCount++;

        // Highlight matching text
        this.highlightText(card, term);
      } else {
        card.style.display = 'none';
      }
    });

    // Show message if no results
    this.showSearchResults(visibleCount, term);
  }

  highlightText(card, term) {
    const name = card.querySelector('.menu-item-name');
    const description = card.querySelector('.menu-item-description');

    if (name && !name.dataset.originalText) {
      name.dataset.originalText = name.textContent;
    }

    if (description && !description.dataset.originalText) {
      description.dataset.originalText = description.textContent;
    }

    // Reset to original if term is empty
    if (!term) {
      if (name?.dataset.originalText) name.textContent = name.dataset.originalText;
      if (description?.dataset.originalText) description.textContent = description.dataset.originalText;
      return;
    }

    // Highlight matching term
    const highlightMatch = (element, original) => {
      const regex = new RegExp(`(${term})`, 'gi');
      element.innerHTML = original.replace(regex, '<mark style="background: #FFE066; padding: 2px 4px; border-radius: 3px;">$1</mark>');
    };

    if (name?.dataset.originalText) {
      highlightMatch(name, name.dataset.originalText);
    }

    if (description?.dataset.originalText) {
      highlightMatch(description, description.dataset.originalText);
    }
  }

  showSearchResults(count, term) {
    let resultsMessage = document.getElementById('search-results-message');

    if (!resultsMessage) {
      resultsMessage = document.createElement('div');
      resultsMessage.id = 'search-results-message';
      resultsMessage.setAttribute('role', 'status');
      resultsMessage.setAttribute('aria-live', 'polite');
      resultsMessage.style.cssText = `
        text-align: center;
        padding: 1rem;
        margin: 1rem 0;
        font-weight: 500;
      `;

      const menuContent = document.querySelector('.menu-content');
      if (menuContent) {
        menuContent.insertBefore(resultsMessage, menuContent.firstChild);
      }
    }

    if (count === 0) {
      resultsMessage.textContent = `No menu items found for "${term}"`;
      resultsMessage.style.color = 'var(--burgundy-primary)';
    } else {
      resultsMessage.textContent = `Found ${count} menu item${count !== 1 ? 's' : ''} matching "${term}"`;
      resultsMessage.style.color = 'var(--navy-primary)';
    }

    resultsMessage.style.display = 'block';
  }

  resetFilter() {
    const allMenuCards = document.querySelectorAll('.menu-card');

    allMenuCards.forEach(card => {
      card.style.display = '';

      // Reset highlighted text
      const name = card.querySelector('.menu-item-name');
      const description = card.querySelector('.menu-item-description');

      if (name?.dataset.originalText) {
        name.textContent = name.dataset.originalText;
      }

      if (description?.dataset.originalText) {
        description.textContent = description.dataset.originalText;
      }
    });

    // Hide results message
    const resultsMessage = document.getElementById('search-results-message');
    if (resultsMessage) {
      resultsMessage.style.display = 'none';
    }
  }
}

// ============================================
// INITIALIZE MENU FUNCTIONALITY
// ============================================

let menuTabsInstance = null;
let menuFilterInstance = null;

function initializeMenu() {
  // Initialize tabs
  menuTabsInstance = new MenuTabs();

  // Try to load saved tab preference
  if (!menuTabsInstance.loadTabPreference()) {
    // Default to first tab
    menuTabsInstance.switchTab(0);
  }

  // Initialize search/filter (optional feature)
  // Uncomment to enable:
  // menuFilterInstance = new MenuFilter();

  console.log('Menu functionality initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMenu);
} else {
  initializeMenu();
}

// Export for external use
if (typeof window !== 'undefined') {
  window.MenuTabs = MenuTabs;
  window.menuTabsInstance = menuTabsInstance;
}

// ============================================
// URL HASH SUPPORT (Deep Linking to Tabs)
// ============================================

function handleHashChange() {
  const hash = window.location.hash.slice(1); // Remove #

  // Check if hash matches a menu tab
  if (hash && menuTabsInstance) {
    const menuTabs = ['omelettes', 'benedicts', 'waffles', 'sandwiches', 'sides'];

    if (menuTabs.includes(hash)) {
      // Scroll to menu section
      const menuSection = document.getElementById('menu');
      if (menuSection) {
        const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 0;
        const targetPosition = menuSection.offsetTop - navbarHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }

      // Show the tab
      setTimeout(() => {
        menuTabsInstance.showTab(hash);
      }, 300);
    }
  }
}

// Listen for hash changes
window.addEventListener('hashchange', handleHashChange);

// Check hash on load
if (window.location.hash) {
  setTimeout(handleHashChange, 500);
}
