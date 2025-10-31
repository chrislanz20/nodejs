document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = prefersReducedMotion.matches;

  prefersReducedMotion.addEventListener('change', (event) => {
    reduceMotion = event.matches;
  });

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
    const heroParallax = () => {
      if (reduceMotion) return;
      const offset = window.scrollY * 0.35;
      heroBackground.style.transform = `translateY(${offset * -1}px)`;
    };

    if (!reduceMotion) {
      window.addEventListener('scroll', heroParallax, { passive: true });
    }
  }

  const lazyImages = document.querySelectorAll('img.lazy');
  if (lazyImages.length) {
    const lazyObserver = new IntersectionObserver(
      (entries, imgObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const dataSrc = img.getAttribute('data-src');
            if (dataSrc) {
              img.src = dataSrc;
              img.removeAttribute('data-src');
            }
            img.classList.remove('lazy');
            imgObserver.unobserve(img);
          }
        });
      },
      { rootMargin: '200px 0px' }
    );

    lazyImages.forEach((image) => lazyObserver.observe(image));
  }

  const galleryItems = document.querySelectorAll('.gallery-item');
  if (galleryItems.length) {
    const handleScroll = () => {
      if (reduceMotion) return;
      const scrollTop = window.scrollY;
      galleryItems.forEach((item) => {
        const speed = Number(item.style.getPropertyValue('--parallax-speed')) || 0.5;
        item.style.transform = `translateY(${scrollTop * speed * -0.05}px)`;
      });
    };

    if (!reduceMotion) {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }
  }
});
