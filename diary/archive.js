/*
 * Переключение сетки, переключатель языка и поиск по проектам на главной.
 *
 * ВАЖНО: файл написан на ES5 — см. комментарий в diary.js. Встроенный
 * браузер QuiteRSS (старый QtWebKit) не выполняет файлы с современным
 * синтаксисом вообще, поэтому здесь только var/function и никаких `?.`,
 * стрелочных функций и Array.prototype.includes.
 */
(function () {
  var gridButton = document.querySelector('#grid-toggle');
  var gridLabel = document.querySelector('#grid-toggle-label');

  function hasClassToken(element, token) {
    return (' ' + element.className + ' ').indexOf(' ' + token + ' ') !== -1;
  }

  function updateGridLabel() {
    if (!gridButton || !gridLabel) return;
    var enabled = hasClassToken(document.body, 'show-grid');
    var language = document.documentElement.lang === 'en' ? 'en' : 'ru';
    var labels = {
      ru: enabled ? 'Скрыть сетку' : 'Показать сетку',
      en: enabled ? 'Hide grid' : 'Show grid',
    };
    gridLabel.textContent = labels[language];
    gridButton.setAttribute('aria-pressed', String(enabled));
    gridButton.setAttribute('aria-label', labels[language]);
  }

  if (gridButton) {
    gridButton.addEventListener('click', function () {
      var enabled = !hasClassToken(document.body, 'show-grid');
      document.body.className = enabled
        ? document.body.className + ' show-grid'
        : document.body.className.replace(/\s*show-grid/g, '');
      updateGridLabel();
    });
  }

  var languageButtons = document.querySelectorAll('[data-language-choice]');
  for (var i = 0; i < languageButtons.length; i += 1) {
    languageButtons[i].addEventListener('click', updateGridLabel);
  }
  updateGridLabel();

  var search = document.querySelector('#project-search');
  if (search) {
    search.addEventListener('input', function () {
      var query = search.value.replace(/^\s+|\s+$/g, '').toLowerCase();
      var cards = document.querySelectorAll('.project-card');
      for (var c = 0; c < cards.length; c += 1) {
        cards[c].hidden = query !== '' && cards[c].textContent.toLowerCase().indexOf(query) === -1;
      }
    });
  }
}());
