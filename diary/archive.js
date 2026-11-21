(() => {
  const gridButton = document.querySelector('#grid-toggle');
  const gridLabel = document.querySelector('#grid-toggle-label');

  function updateGridLabel() {
    if (!gridButton || !gridLabel) return;
    const enabled = document.body.classList.contains('show-grid');
    const language = document.documentElement.lang === 'en' ? 'en' : 'ru';
    const labels = {
      ru: enabled ? 'Скрыть сетку' : 'Показать сетку',
      en: enabled ? 'Hide grid' : 'Show grid',
    };
    gridLabel.textContent = labels[language];
    gridButton.setAttribute('aria-pressed', String(enabled));
    gridButton.setAttribute('aria-label', labels[language]);
  }

  gridButton?.addEventListener('click', () => {
    document.body.classList.toggle('show-grid');
    updateGridLabel();
  });
  document.querySelectorAll('[data-language-choice]').forEach((button) => {
    button.addEventListener('click', updateGridLabel);
  });
  updateGridLabel();
  const search = document.querySelector('#project-search');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    document.querySelectorAll('.project-card').forEach((card) => {
      card.hidden = query !== '' && !card.textContent.toLocaleLowerCase().includes(query);
    });
  });
})();
