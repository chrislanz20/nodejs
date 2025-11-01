/**
 * THE OMELETTE HEADQUARTERS - Scroll Effects
 * Handles parallax effects and scroll-triggered animations
 */

// ============================================
// INTERSECTION OBSERVER FOR FADE-IN SECTIONS
// ============================================

const fadeInSections = document.querySelectorAll('.fade-in-section');

if ('IntersectionObserver' in window && fadeInSections.length > 0) {
  const fadeInObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');

        // Optional: unobserve after animation for better performance
        // fadeInObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -100px 0px'
  });

  fadeInSections.forEach(section => {
    fadeInObserver.observe(section);
  });
} else {
  // Fallback: show all sections immediately
  fadeInSections.forEach(section => {
    section.classList.add('is-visible');
  });
}

// ============================================
// PARALLAX BACKGROUND EFFECT
// ============================================

function handleParallax() {
  const parallaxElements = document.querySelectorAll('.hero, .cta-section');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return; // Respect user's motion preferences
  }

  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;

    parallaxElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + scrolled;
      const elementHeight = element.offsetHeight;

      // Only apply parallax when element is in viewport
      if (scrolled + window.innerHeight > elementTop && scrolled < elementTop + elementHeight) {
        const yPos = (scrolled - elementTop) * 0.5;
        element.style.backgroundPositionY = `${yPos}px`;
      }
    });
  });
}

// Initialize parallax only on desktop
if (window.innerWidth > 768) {
  handleParallax();
}

// ============================================
// MENU CARD STAGGER ANIMATION ON SCROLL
// ============================================

const menuSection = document.getElementById('menu');

if (menuSection && 'IntersectionObserver' in window) {
  const menuObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const cards = entry.target.querySelectorAll('.menu-card');

        cards.forEach((card, index) => {
          card.style.animationDelay = `${index * 0.1}s`;
          card.classList.add('animate');
        });

        menuObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.2
  });

  menuObserver.observe(menuSection);
}

// ============================================
// GALLERY ITEMS ANIMATION
// ============================================

const galleryItems = document.querySelectorAll('.gallery-item');

if (galleryItems.length > 0 && 'IntersectionObserver' in window) {
  const galleryObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const index = entry.target.getAttribute('data-index') || 0;
        entry.target.style.animationDelay = `${index * 0.1}s`;
        entry.target.classList.add('animate');

        // Optional: unobserve after animation
        galleryObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  galleryItems.forEach(item => {
    galleryObserver.observe(item);
  });
}

// ============================================
// ABOUT SECTION PHOTO GRID ANIMATION
// ============================================

const aboutSection = document.querySelector('.about');

if (aboutSection && 'IntersectionObserver' in window) {
  const aboutObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');

        const images = entry.target.querySelectorAll('.about-gallery img');
        images.forEach((img, index) => {
          img.style.animationDelay = `${0.2 + (index * 0.2)}s`;
        });

        aboutObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.3
  });

  aboutObserver.observe(aboutSection);
}

// ============================================
// CHALKBOARD SPECIALS ANIMATION
// ============================================

const chalkboardSection = document.querySelector('.chalkboard-specials');

if (chalkboardSection && 'IntersectionObserver' in window) {
  const chalkboardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const specialItems = entry.target.querySelectorAll('.special-item');

        specialItems.forEach((item, index) => {
          item.style.setProperty('--index', index);
          item.classList.add('animate');
        });

        chalkboardObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.2
  });

  chalkboardObserver.observe(chalkboardSection);
}

// ============================================
// FOOTER ANIMATION
// ============================================

const footer = document.querySelector('.footer');

if (footer && 'IntersectionObserver' in window) {
  const footerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        footerObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1
  });

  footerObserver.observe(footer);
}

// ============================================
// SCROLL DIRECTION DETECTION
// ============================================

let lastScrollTop = 0;
let scrollDirection = 'down';

window.addEventListener('scroll', () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  scrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
  lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

  // Add data attribute to body for CSS targeting if needed
  document.body.setAttribute('data-scroll-direction', scrollDirection);
}, { passive: true });

// ============================================
// REVEAL ELEMENTS ON SCROLL WITH DELAY
// ============================================

function revealOnScroll() {
  const reveals = document.querySelectorAll('.reveal-on-scroll');

  if (!reveals.length) return;

  reveals.forEach(element => {
    const windowHeight = window.innerHeight;
    const elementTop = element.getBoundingClientRect().top;
    const elementVisible = 150;

    if (elementTop < windowHeight - elementVisible) {
      element.classList.add('active');
    }
  });
}

window.addEventListener('scroll', revealOnScroll, { passive: true });

// ============================================
// PARALLAX LAYERS (Multiple Speeds)
// ============================================

const parallaxLayers = document.querySelectorAll('[data-parallax-speed]');

if (parallaxLayers.length > 0 && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;

    parallaxLayers.forEach(layer => {
      const speed = layer.getAttribute('data-parallax-speed') || 0.5;
      const yPos = -(scrolled * speed);
      layer.style.transform = `translateY(${yPos}px)`;
    });
  }, { passive: true });
}

// ============================================
// ANIMATE NUMBERS IN STATS
// ============================================

function animateNumber(element, start, end, duration) {
  const startTime = performance.now();
  const range = end - start;

  function updateNumber(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function (ease-out cubic)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = start + (range * easeOut);

    element.textContent = Math.floor(current);

    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    } else {
      element.textContent = end;
    }
  }

  requestAnimationFrame(updateNumber);
}

// Animate stat numbers when visible
const statNumbers = document.querySelectorAll('.stat-number');

if (statNumbers.length > 0 && 'IntersectionObserver' in window) {
  const statNumberObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
        entry.target.classList.add('animated');

        const text = entry.target.textContent;
        const number = parseInt(text.replace(/[^0-9]/g, ''));

        if (!isNaN(number) && number > 0) {
          animateNumber(entry.target, 0, number, 1500);
        }
      }
    });
  }, {
    threshold: 0.5
  });

  statNumbers.forEach(stat => {
    // Only animate numbers, not text like "Serving" or "100%"
    const text = stat.textContent;
    if (/^\d+$/.test(text.trim())) {
      statNumberObserver.observe(stat);
    }
  });
}

// ============================================
// SMOOTH SCROLL ENHANCEMENT
// ============================================

function enhanceSmoothScroll() {
  // Add easing to smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#' || !targetId) return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 0;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navbarHeight;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    });
  });
}

enhanceSmoothScroll();

// ============================================
// VIEWPORT HEIGHT FIX FOR MOBILE
// ============================================

function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

setViewportHeight();
window.addEventListener('resize', setViewportHeight);

// ============================================
// THROTTLE FUNCTION FOR SCROLL PERFORMANCE
// ============================================

function throttle(func, wait) {
  let timeout;
  let lastRan;

  return function executedFunction(...args) {
    if (!lastRan) {
      func.apply(this, args);
      lastRan = Date.now();
    } else {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if ((Date.now() - lastRan) >= wait) {
          func.apply(this, args);
          lastRan = Date.now();
        }
      }, wait - (Date.now() - lastRan));
    }
  };
}

// ============================================
// SCROLL PERFORMANCE OPTIMIZATION
// ============================================

// Use passive event listeners for scroll events
const supportsPassive = (() => {
  let supported = false;

  try {
    const options = {
      get passive() {
        supported = true;
        return false;
      }
    };

    window.addEventListener('test', null, options);
    window.removeEventListener('test', null, options);
  } catch (err) {
    supported = false;
  }

  return supported;
})();

const scrollOptions = supportsPassive ? { passive: true } : false;

// ============================================
// INITIALIZE ALL ANIMATIONS
// ============================================

function initScrollEffects() {
  console.log('Scroll effects initialized');

  // Check if reduced motion is preferred
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    console.log('Reduced motion preference detected - limiting animations');

    // Remove animation classes
    document.querySelectorAll('.fade-in-section').forEach(el => {
      el.classList.add('is-visible');
      el.style.animation = 'none';
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollEffects);
} else {
  initScrollEffects();
}

// Export for testing if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    throttle,
    animateNumber,
    revealOnScroll
  };
}
