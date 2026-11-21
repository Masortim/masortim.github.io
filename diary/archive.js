(() => {
  const gridButton = document.querySelector('#grid-toggle');
  gridButton?.addEventListener('click', () => {
    const visible = document.body.classList.toggle('show-grid');
    gridButton.setAttribute('aria-pressed', String(visible));
  });
  const search = document.querySelector('#project-search');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    document.querySelectorAll('.project-card').forEach((card) => {
      card.hidden = query !== '' && !card.textContent.toLocaleLowerCase().includes(query);
    });
  });
})();
