(() => {
  const languageKey = 'masortim-diary-language';
  const themeKey = 'masortim-diary-theme';
  const content = [...document.querySelectorAll('[data-language-content]')];
  const languageButtons = [...document.querySelectorAll('[data-language-choice]')];
  const themeButton = document.querySelector('#theme-toggle');
  const pageTitles = {
    ru: 'Дневник разработчика · Masortim',
    en: 'Developer diary · Masortim',
  };
  let currentLanguage = 'ru';

  function readPreference(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function savePreference(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The page remains usable when browser storage is unavailable.
    }
  }

  function applyLanguage(language, remember = true) {
    currentLanguage = language;
    document.documentElement.lang = language;
    document.title = pageTitles[language];

    content.forEach((element) => {
      element.hidden = element.dataset.languageContent !== language;
    });

    languageButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.languageChoice === language));
    });

    if (remember) savePreference(languageKey, language);
    updateThemeLabel();
  }

  function updateThemeLabel() {
    if (!themeButton) return;
    const isDark = document.body.classList.contains('dark-theme');
    const label = currentLanguage === 'ru'
      ? (isDark ? 'Включить светлую тему' : 'Включить тёмную тему')
      : (isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label);
    themeButton.textContent = isDark ? '☀' : '☾';
  }

  languageButtons.forEach((button) => {
    button.addEventListener('click', () => applyLanguage(button.dataset.languageChoice));
  });

  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  const storedLanguage = readPreference(languageKey);
  const initialLanguage = ['ru', 'en'].includes(requestedLanguage)
    ? requestedLanguage
    : (['ru', 'en'].includes(storedLanguage) ? storedLanguage : 'ru');
  applyLanguage(initialLanguage, false);

  const storedTheme = readPreference(themeKey);
  if (storedTheme === 'dark') document.body.classList.add('dark-theme');
  document.documentElement.style.colorScheme = storedTheme === 'dark' ? 'dark' : 'light';
  updateThemeLabel();

  themeButton?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = theme;
    savePreference(themeKey, theme);
    updateThemeLabel();
  });
})();
