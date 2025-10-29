const navToggle = document.querySelector(".nav__toggle");
const navMenu = document.querySelector(".nav__links");
const phoneButtons = document.querySelectorAll("[data-call-btn]");
const cashBadges = document.querySelectorAll("[data-cash-alert]");
const yearSpan = document.getElementById("year");

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!expanded));
    navMenu.classList.toggle("nav__links--open");
  });
}

document.addEventListener("click", event => {
  if (!navMenu || !navToggle) return;
  if (navMenu.classList.contains("nav__links--open") && !navMenu.contains(event.target) && event.target !== navToggle) {
    navMenu.classList.remove("nav__links--open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

phoneButtons.forEach(button => {
  button.addEventListener("click", () => {
    window.location.href = "tel:17813970628";
  });
});

if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      const sources = img.parentElement?.querySelectorAll("source[data-srcset]");
      sources?.forEach(source => {
        source.setAttribute("srcset", source.getAttribute("data-srcset") || "");
        source.removeAttribute("data-srcset");
      });
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      }
      observer.unobserve(img);
    }
  });
}, { rootMargin: "0px 0px 200px 0px" }) : null;

document.querySelectorAll("img[data-src]").forEach(img => {
  if (observer) {
    observer.observe(img);
  } else if (img.dataset.src) {
    img.src = img.dataset.src;
  }
});

cashBadges.forEach(badge => {
  badge.setAttribute("role", "alert");
});
