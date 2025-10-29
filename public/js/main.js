(function () {
  const root = document.documentElement;
  const navToggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');
  const langButtons = document.querySelectorAll('[data-switch-language]');
  const storedLanguage = localStorage.getItem('casaLatinaLanguage');

  const setLanguage = (lang) => {
    const language = lang === 'es' ? 'es' : 'en';
    root.setAttribute('data-lang', language);
    document.body?.setAttribute('data-lang', language);
    root.setAttribute('lang', language === 'en' ? 'en' : 'es');
    localStorage.setItem('casaLatinaLanguage', language);

    langButtons.forEach((button) => {
      const isActive = button.dataset.switchLanguage === language;
      button.setAttribute('aria-pressed', String(isActive));
    });
  };

  if (storedLanguage) {
    setLanguage(storedLanguage);
  } else {
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang && browserLang.toLowerCase().startsWith('es')) {
      setLanguage('es');
    } else {
      setLanguage('en');
    }
  }

  langButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setLanguage(button.dataset.switchLanguage);
    });
  });

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      const hidden = navLinks.getAttribute('aria-hidden') === 'true';
      navLinks.setAttribute('aria-hidden', String(!hidden));
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks.setAttribute('aria-hidden', 'true');
      });
    });
  }
})();
