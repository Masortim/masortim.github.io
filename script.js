// Basic interactivity for the mockup
(function () {
  const messagesBtn = document.getElementById('messagesBtn');
  const panel = document.getElementById('messagesPanel');
  const tabs = panel ? panel.querySelectorAll('.tab') : [];

  function hidePanelOnOutsideClick(event) {
    if (!panel) return;
    if (!panel.contains(event.target) && !messagesBtn.contains(event.target)) {
      panel.setAttribute('aria-hidden', 'true');
      document.removeEventListener('click', hidePanelOnOutsideClick);
    }
  }

  if (messagesBtn && panel) {
    messagesBtn.addEventListener('click', function (e) {
      const isHidden = panel.getAttribute('aria-hidden') !== 'false';
      panel.setAttribute('aria-hidden', String(!isHidden));
      if (isHidden) {
        setTimeout(() => document.addEventListener('click', hidePanelOnOutsideClick), 0);
      }
      e.stopPropagation();
    });
  }

  // Tabs
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const id = tab.getAttribute('data-tab');
      panel.querySelectorAll('[data-tab-panel]').forEach(function (ul) {
        ul.classList.toggle('is-hidden', ul.getAttribute('data-tab-panel') !== id);
      });
    });
  });

  // Like heart demo: toggle numbers color when clicking chips
  document.querySelectorAll('.chip, .chip--heart').forEach(function (chip) {
    chip.addEventListener('click', function () {
      chip.classList.toggle('is-on');
    });
  });
})();

