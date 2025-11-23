/**
 * THE OMELETTE HEADQUARTERS - Main JavaScript
 * Handles core functionality including navigation, lightbox, and hours status
 */

// ============================================
// MOBILE NAVIGATION
// ============================================

const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('active');

    // Update ARIA attribute
    const isExpanded = navLinks.classList.contains('active');
    hamburger.setAttribute('aria-expanded', isExpanded);

    // Prevent body scroll when menu is open
    document.body.style.overflow = isExpanded ? 'hidden' : '';
  });

  // Close menu when clicking a link
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      hamburger.classList.remove('active');
      navLinks.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
}

// ============================================
// STICKY NAVIGATION
// ============================================

const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;

  // Add shadow when scrolled
  if (currentScroll > 100) {
    navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
  } else {
    navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  }

  lastScroll = currentScroll;
});

// ============================================
// SMOOTH SCROLL FOR NAVIGATION LINKS
// ============================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();

    const targetId = this.getAttribute('href');
    if (targetId === '#') return;

    const targetElement = document.querySelector(targetId);

    if (targetElement) {
      const navbarHeight = navbar.offsetHeight;
      const targetPosition = targetElement.offsetTop - navbarHeight;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ============================================
// GALLERY LIGHTBOX
// ============================================

const lightbox = document.getElementById('lightbox');
const lightboxImage = lightbox?.querySelector('.lightbox-image');
const lightboxCaption = lightbox?.querySelector('.lightbox-caption');
const lightboxClose = lightbox?.querySelector('.lightbox-close');
const lightboxPrev = lightbox?.querySelector('.lightbox-prev');
const lightboxNext = lightbox?.querySelector('.lightbox-next');

let currentImageIndex = 0;
const galleryItems = document.querySelectorAll('.gallery-item');

// Open lightbox
galleryItems.forEach((item, index) => {
  item.addEventListener('click', () => {
    currentImageIndex = index;
    openLightbox();
  });

  // Keyboard accessibility
  item.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      currentImageIndex = index;
      openLightbox();
    }
  });

  // Make gallery items focusable
  item.setAttribute('tabindex', '0');
  item.setAttribute('role', 'button');
});

function openLightbox() {
  const item = galleryItems[currentImageIndex];
  const img = item.querySelector('img');
  const caption = item.querySelector('.gallery-caption');

  if (lightboxImage && img) {
    lightboxImage.src = img.src;
    lightboxImage.alt = img.alt;
  }

  if (lightboxCaption && caption) {
    lightboxCaption.textContent = caption.textContent;
  }

  if (lightbox) {
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focus management for accessibility
    lightboxClose?.focus();
  }
}

function closeLightbox() {
  if (lightbox) {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';

    // Return focus to the gallery item
    galleryItems[currentImageIndex]?.focus();
  }
}

function showPrevImage() {
  currentImageIndex = (currentImageIndex - 1 + galleryItems.length) % galleryItems.length;
  openLightbox();
}

function showNextImage() {
  currentImageIndex = (currentImageIndex + 1) % galleryItems.length;
  openLightbox();
}

// Lightbox event listeners
lightboxClose?.addEventListener('click', closeLightbox);

lightboxPrev?.addEventListener('click', (e) => {
  e.stopPropagation();
  showPrevImage();
});

lightboxNext?.addEventListener('click', (e) => {
  e.stopPropagation();
  showNextImage();
});

// Close on background click
lightbox?.addEventListener('click', (e) => {
  if (e.target === lightbox) {
    closeLightbox();
  }
});

// Keyboard navigation for lightbox
document.addEventListener('keydown', (e) => {
  if (!lightbox?.classList.contains('active')) return;

  switch(e.key) {
    case 'Escape':
      closeLightbox();
      break;
    case 'ArrowLeft':
      showPrevImage();
      break;
    case 'ArrowRight':
      showNextImage();
      break;
  }
});

// ============================================
// HOURS STATUS INDICATOR
// ============================================

function updateHoursStatus() {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  if (!statusDot || !statusText) return;

  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;

  // Open: Friday (5), Saturday (6), Sunday (0)
  // Hours: 6:00 AM - 2:00 PM (360 minutes - 840 minutes)
  const openDays = [0, 5, 6]; // Sunday, Friday, Saturday
  const openTime = 6 * 60; // 6:00 AM in minutes
  const closeTime = 14 * 60; // 2:00 PM in minutes

  const isOpenDay = openDays.includes(day);
  const isOpenTime = currentTime >= openTime && currentTime < closeTime;
  const isOpen = isOpenDay && isOpenTime;

  if (isOpen) {
    statusDot.classList.add('open');
    statusDot.classList.remove('closed');
    statusText.textContent = 'Open Now';
    statusText.style.color = '#22C55E';
  } else {
    statusDot.classList.remove('open');
    statusDot.classList.add('closed');
    statusText.textContent = 'Currently Closed';
    statusText.style.color = '#EF4444';

    // Show when they'll open next
    if (!isOpenDay) {
      let daysUntilOpen;
      if (day === 1 || day === 2 || day === 3 || day === 4) {
        // Monday-Thursday, next open is Friday
        daysUntilOpen = 5 - day;
        statusText.textContent = `Opens Friday at 6:00 AM`;
      } else if (day === 6) {
        // Saturday after hours
        statusText.textContent = `Opens Sunday at 6:00 AM`;
      } else if (day === 0 && currentTime >= closeTime) {
        // Sunday after hours
        statusText.textContent = `Opens Friday at 6:00 AM`;
      }
    } else if (currentTime < openTime) {
      statusText.textContent = 'Opens at 6:00 AM';
    } else {
      statusText.textContent = 'Closed - Opens Friday';
    }
  }
}

// Update status on load and every minute
updateHoursStatus();
setInterval(updateHoursStatus, 60000);

// ============================================
// LAZY LOADING IMAGES
// ============================================

function lazyLoadImages() {
  const images = document.querySelectorAll('img[loading="lazy"]');

  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;

          // Add loaded class when image loads
          img.addEventListener('load', () => {
            img.classList.add('loaded');
          });

          // If already loaded (cached)
          if (img.complete) {
            img.classList.add('loaded');
          }

          observer.unobserve(img);
        }
      });
    }, {
      rootMargin: '50px'
    });

    images.forEach(img => imageObserver.observe(img));
  } else {
    // Fallback for browsers without IntersectionObserver
    images.forEach(img => {
      img.classList.add('loaded');
    });
  }
}

// Initialize lazy loading
lazyLoadImages();

// ============================================
// SCROLL PROGRESS INDICATOR
// ============================================

function updateScrollProgress() {
  const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
  const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrolled = (winScroll / height) * 100;

  let progressBar = document.querySelector('.scroll-progress');

  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    document.body.appendChild(progressBar);
  }

  progressBar.style.width = scrolled + '%';
}

window.addEventListener('scroll', updateScrollProgress);

// ============================================
// STAT COUNTER ANIMATION
// ============================================

function animateValue(element, start, end, duration) {
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = Math.floor(current);
  }, 16);
}

// Observe stat items
const statItems = document.querySelectorAll('.stat-item');
if (statItems.length > 0 && 'IntersectionObserver' in window) {
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
        entry.target.classList.add('animated');
        entry.target.classList.add('is-visible');
      }
    });
  }, {
    threshold: 0.5
  });

  statItems.forEach(item => statObserver.observe(item));
}

// ============================================
// PRELOAD CRITICAL IMAGES
// ============================================

function preloadImages() {
  const criticalImages = [
    'images/train-wall-art.jpeg',
    'images/dining-interior.jpeg'
  ];

  criticalImages.forEach(src => {
    const img = new Image();
    img.src = src;
  });
}

// Preload on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', preloadImages);
} else {
  preloadImages();
}

// ============================================
// PERFORMANCE MONITORING
// ============================================

if ('performance' in window) {
  window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0];

    if (perfData) {
      console.log(`Page load time: ${perfData.loadEventEnd - perfData.fetchStart}ms`);
      console.log(`DOM content loaded: ${perfData.domContentLoadedEventEnd - perfData.fetchStart}ms`);
    }
  });
}

// ============================================
// ERROR HANDLING FOR IMAGES
// ============================================

document.querySelectorAll('img').forEach(img => {
  img.addEventListener('error', function() {
    // Replace with placeholder or hide
    this.style.display = 'none';
    console.warn(`Failed to load image: ${this.src}`);
  });
});

// ============================================
// CONSOLE MESSAGE
// ============================================

console.log('%c🚂 Welcome to The Omelette Headquarters! %c',
  'font-size: 20px; font-weight: bold; color: #FF8C42;',
  'font-size: 12px;'
);
console.log('%cAll Aboard for Breakfast!', 'color: #8B1538; font-weight: bold;');
