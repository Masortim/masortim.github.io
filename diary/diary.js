(() => {
  const languageKey = 'masortim-diary-language';
  const themeKey = 'masortim-diary-theme';
  const tufteThemeKey = 'tufte-theme'; // синхронизация с tufte-universal.js
  const content = [...document.querySelectorAll('[data-language-content]')];
  const languageButtons = [...document.querySelectorAll('[data-language-choice]')];
  const themeButton = document.querySelector('#theme-toggle');
  const pageTitles = {
    ru: 'Дневник разработчика · Masortim',
    en: 'Developer diary · Masortim',
  };
  // Заголовок заметки (например, «hello_world · Дневник разработчика»)
  // не затираем общим: обновляем только страницы архива/главной.
  const originalTitle = document.title || '';
  const isGenericTitle = originalTitle.includes('Masortim');
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
    if (isGenericTitle) document.title = pageTitles[language];

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

  const storedTheme = readPreference(themeKey) || readPreference(tufteThemeKey);
  if (storedTheme === 'dark') document.body.classList.add('dark-theme');
  document.documentElement.style.colorScheme = storedTheme === 'dark' ? 'dark' : 'light';
  updateThemeLabel();

  themeButton?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = theme;
    savePreference(themeKey, theme);
    savePreference(tufteThemeKey, theme);
    updateThemeLabel();
  });

  // Ленивая загрузка MathJax и highlight.js для заметок с формулами/кодом.
  // Стили — в tufte-universal.css (разделы «Математика» и «Код»).
  function loadScript(src) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  async function initMathAndCode() {
    const text = document.body ? document.body.textContent || '' : '';
    const hasMath = /\\\(|\\\[|class="[^"]*math/.test(document.body ? document.body.innerHTML : '');
    const hasCode = !!document.querySelector('pre code');
    if (hasMath && !window.MathJax) {
      window.MathJax = {
        tex: {
          inlineMath: [['\\(', '\\)']],
          displayMath: [['\\[', '\\]']],
          processEscapes: true,
          processEnvironments: true,
        },
        options: { ignoreHtmlClass: 'tex2jax_ignore', processHtmlClass: 'tex2jax_process' },
      };
      await loadScript('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js');
    }
    if (hasCode && !window.hljs) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
    }
    if (hasCode && window.hljs) {
      try { window.hljs.highlightAll(); } catch { /* без подсветки страница читабельна */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMathAndCode);
  } else {
    initMathAndCode();
  }
})();
