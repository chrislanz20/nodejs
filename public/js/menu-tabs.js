document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = Array.from(document.querySelectorAll('.menu__tab'));
  const panels = Array.from(document.querySelectorAll('.menu__panel'));

  function activateTab(tab) {
    tabButtons.forEach((button) => {
      const isActive = button === tab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      document.getElementById(button.getAttribute('aria-controls')).classList.toggle('is-active', isActive);
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activateTab(button);
    });

    button.addEventListener('keydown', (event) => {
      const index = tabButtons.indexOf(button);
      let newIndex = index;
      if (event.key === 'ArrowRight') {
        newIndex = (index + 1) % tabButtons.length;
      } else if (event.key === 'ArrowLeft') {
        newIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      } else {
        return;
      }
      event.preventDefault();
      tabButtons[newIndex].focus();
      activateTab(tabButtons[newIndex]);
    });
  });
});
