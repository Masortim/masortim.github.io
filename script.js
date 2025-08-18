document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('messagesToggle');
  const pop = document.getElementById('messagesPopover');

  function hide() {
    pop.setAttribute('aria-hidden', 'true');
  }

  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    const isHidden = pop.getAttribute('aria-hidden') !== 'false';
    pop.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
  });

  document.addEventListener('click', (e) => {
    if (!pop.contains(e.target) && e.target !== toggle) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
});

