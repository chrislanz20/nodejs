document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          if (entry.target.classList.contains('menu-card')) {
            entry.target.style.animationDelay = `${(Number(entry.target.style.getPropertyValue('--index')) || 0) * 0.1}s`;
          }
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  document.querySelectorAll('.fade-in-section, .menu-card').forEach((element) => observer.observe(element));

  const heroBackground = document.querySelector('.hero__background');
  if (heroBackground) {
    window.addEventListener('scroll', () => {
      const offset = window.scrollY * 0.35;
      heroBackground.style.transform = `translateY(${offset * -1}px)`;
    });
  }

  const galleryItems = document.querySelectorAll('.gallery__item');
  const handleScroll = () => {
    const scrollTop = window.scrollY;
    galleryItems.forEach((item) => {
      const speed = Number(item.style.getPropertyValue('--parallax-speed')) || 0.5;
      item.style.transform = `translateY(${scrollTop * speed * -0.05}px)`;
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
});
