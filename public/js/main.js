const navToggle = document.querySelector(".nav__toggle");
const navLinks = document.querySelector(".nav__links");
const navLinkItems = document.querySelectorAll(".nav__links a");
const header = document.querySelector(".header");
const mobileCta = document.querySelector(".mobile-cta");

navToggle?.addEventListener("click", () => {
  const expanded = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!expanded));
  navLinks?.classList.toggle("is-open");
});

navLinkItems.forEach(link =>
  link.addEventListener("click", () => {
    navToggle?.setAttribute("aria-expanded", "false");
    navLinks?.classList.remove("is-open");
  })
);

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        header?.classList.add("is-scrolled");
      } else {
        header?.classList.remove("is-scrolled");
      }
    });
  },
  { rootMargin: "-120px 0px 0px 0px" }
);

const hero = document.querySelector(".hero");
if (hero) {
  observer.observe(hero);
} else {
  header?.classList.add("is-scrolled");
}

const yearEl = document.querySelector("[data-year]");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const testimonials = document.querySelectorAll(".testimonial");
const dots = document.querySelectorAll(".dot");
let testimonialIndex = 0;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function showTestimonial(index) {
  testimonials.forEach((testimonial, i) => {
    testimonial.classList.toggle("is-active", i === index);
  });
  dots.forEach((dot, i) => {
    dot.classList.toggle("is-active", i === index);
  });
  testimonialIndex = index;
}

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => showTestimonial(index));
});

if (testimonials.length > 0) {
  showTestimonial(0);
  if (!prefersReducedMotion) {
    setInterval(() => {
      const nextIndex = (testimonialIndex + 1) % testimonials.length;
      showTestimonial(nextIndex);
    }, 7000);
  }
}

function handleResize() {
  if (window.innerWidth > 960) {
    mobileCta?.classList.remove("is-hidden");
  }
}

window.addEventListener("resize", handleResize);
handleResize();
