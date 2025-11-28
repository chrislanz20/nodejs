const navToggle = document.querySelector('.nav-toggle');
const primaryNav = document.querySelector('.primary-nav');
const header = document.getElementById('site-header');

if (navToggle && primaryNav) {
  primaryNav.dataset.open = 'false';

  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    primaryNav.dataset.open = String(!expanded);
  });

  primaryNav.addEventListener('click', event => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle.setAttribute('aria-expanded', 'false');
      primaryNav.dataset.open = 'false';
    }
  });
}

const mobileCta = document.querySelector('.mobile-cta');

const toggleHeaderShadow = () => {
  if (window.scrollY > 10) {
    header?.classList.add('scrolled');
    mobileCta?.classList.add('visible');
  } else {
    header?.classList.remove('scrolled');
    mobileCta?.classList.remove('visible');
  }
};

toggleHeaderShadow();
window.addEventListener('scroll', toggleHeaderShadow);
window.addEventListener('resize', toggleHeaderShadow);

const currentYearEl = document.querySelector('[data-current-year]');
if (currentYearEl) {
  currentYearEl.textContent = new Date().getFullYear().toString();
}
