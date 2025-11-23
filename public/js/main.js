document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');

  const navbar = document.querySelector('.nav');
  const toggleNavScrolled = () => {
    if (!navbar) return;
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  if (navbar) {
    toggleNavScrolled();
    window.addEventListener('scroll', toggleNavScrolled, { passive: true });
  }

  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const navLinkItems = Array.from(document.querySelectorAll('.nav__links a'));

  function setActiveNavLink() {
    if (!sections.length || !navLinkItems.length) {
      return;
    }
    let currentId = '';
    const offsetAdjustment = 120;
    sections.forEach((section) => {
      const sectionTop = section.offsetTop - offsetAdjustment;
      if (window.scrollY >= sectionTop) {
        currentId = section.id;
      }
    });

    navLinkItems.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const isActive = currentId && href.includes(`#${currentId}`);
      link.classList.toggle('active', isActive);
    });
  }

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
        setTimeout(() => setActiveNavLink(), 0);
      });
    });
  }

  setActiveNavLink();
  window.addEventListener('scroll', setActiveNavLink, { passive: true });

  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    scrollIndicator.addEventListener('click', () => {
      const target = document.querySelector('#about');
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const statusEl = document.querySelector('.current-status');
  const nextOpenEl = document.querySelector('.next-open');

  const updateHoursStatus = () => {
    if (!statusEl || !nextOpenEl) return;

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const schedule = [
      { day: 5, label: 'Friday' },
      { day: 6, label: 'Saturday' },
      { day: 0, label: 'Sunday' },
    ];
    const OPEN_START = 6;
    const OPEN_END = 14;

    const isOpenDay = schedule.some((entry) => entry.day === currentDay);
    const isOpenHours = currentHour >= OPEN_START && currentHour < OPEN_END;

    if (isOpenDay && isOpenHours) {
      statusEl.textContent = 'Open Now';
      statusEl.classList.add('open');
      statusEl.classList.remove('closed');
      nextOpenEl.textContent = 'We close at 2:00 PM today';
      return;
    }

    statusEl.textContent = 'Currently Closed';
    statusEl.classList.add('closed');
    statusEl.classList.remove('open');

    let nextMessage = 'Opens Friday at 6:00 AM';

    for (let offset = 0; offset < 7; offset += 1) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + offset);
      const checkDay = checkDate.getDay();
      const scheduleEntry = schedule.find((entry) => entry.day === checkDay);
      if (!scheduleEntry) {
        continue;
      }

      if (offset === 0) {
        if (currentHour < OPEN_START) {
          nextMessage = 'Opens today at 6:00 AM';
          break;
        }
        if (currentHour >= OPEN_END) {
          continue;
        }
      }

      nextMessage = `Opens ${scheduleEntry.label} at 6:00 AM`;
      break;
    }

    nextOpenEl.textContent = nextMessage;
  };

  updateHoursStatus();
  setInterval(updateHoursStatus, 60000);
});
