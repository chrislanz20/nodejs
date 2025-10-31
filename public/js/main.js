document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      navLinks.classList.toggle('is-open');
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    scrollIndicator.addEventListener('click', () => {
      const target = document.querySelector('#about');
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const hoursStatus = document.querySelector('[data-hours]');
  if (hoursStatus) {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours() + now.getMinutes() / 60;
    const isOpenDay = day === 5 || day === 6 || day === 0; // Fri, Sat, Sun
    const isOpenHours = hours >= 6 && hours < 14;
    if (isOpenDay && isOpenHours) {
      hoursStatus.textContent = 'Now Boarding – We are open';
      hoursStatus.style.color = '#22c55e';
    } else {
      hoursStatus.textContent = 'Station Closed – See you soon';
      hoursStatus.style.color = '#facc15';
    }
  }
});
