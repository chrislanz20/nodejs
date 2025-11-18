const toggleButton = document.querySelector('[data-mobile-toggle]');
const nav = document.querySelector('#primary-navigation');

if (toggleButton && nav) {
  toggleButton.addEventListener('click', () => {
    const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
    toggleButton.setAttribute('aria-expanded', String(!isExpanded));
    nav.classList.toggle('hidden');
  });
}

const yearEl = document.getElementById('current-year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
