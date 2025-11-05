document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  const yearEl = document.getElementById('year');

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  if (navToggle && mobileNav) {
    const links = [
      { href: 'index.html', label: 'Home' },
      { href: 'menu.html', label: 'Menu' },
      { href: 'about.html', label: 'About' },
      { href: 'order.html', label: 'Order Online' },
      { href: 'contact.html', label: 'Contact' }
    ];

    mobileNav.innerHTML = `
      ${links
        .map(
          ({ href, label }) =>
            `<a class="nav-link" href="${href}">${label}</a>`
        )
        .join('')}
      <a class="cta" href="order.html">Order Now</a>
    `;

    const handleToggle = () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      mobileNav.classList.toggle('open');
    };

    navToggle.addEventListener('click', handleToggle);

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        mobileNav.classList.remove('open');
      });
    });
  }
});
