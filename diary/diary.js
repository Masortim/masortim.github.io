/*
 * Переключение языка, темы и поздняя загрузка MathJax/highlight.js.
 *
 * ВАЖНО: файл написан на ES5 (var, function, без стрелочных функций,
 * шаблонных строк, spread, `?.` и URLSearchParams). Встроенный браузер
 * RSS-ридера QuiteRSS — это старый QtWebKit, где современный синтаксис
 * приводит к ошибке разбора, и тогда не выполняется вообще ничего:
 * страница из EN-фида открывалась на русском. Любая правка должна
 * оставаться совместимой с ES5 — проверяется тестом scripts/check-es5.mjs.
 */
(function () {
  var languageKey = 'masortim-diary-language';
  var themeKey = 'masortim-diary-theme';
  var tufteThemeKey = 'tufte-theme'; // синхронизация с tufte-universal.js

  function toArray(nodeList) {
    var out = [];
    for (var i = 0; i < nodeList.length; i += 1) out.push(nodeList[i]);
    return out;
  }

  var content = toArray(document.querySelectorAll('[data-language-content]'));
  var languageButtons = toArray(document.querySelectorAll('[data-language-choice]'));
  var themeButton = document.querySelector('#theme-toggle');
  var pageTitles = {
    ru: 'Дневник разработчика · Masortim',
    en: 'Developer diary · Masortim',
  };
  // Заголовок заметки (например, «hello_world · Дневник разработчика»)
  // не затираем общим: обновляем только страницы архива/главной.
  var originalTitle = document.title || '';
  var isGenericTitle = originalTitle.indexOf('Masortim') !== -1;
  var currentLanguage = 'ru';

  function indexOf(list, value) {
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] === value) return i;
    }
    return -1;
  }

  function readPreference(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function savePreference(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // The page remains usable when browser storage is unavailable.
    }
  }

  /** Значение параметра из строки запроса (совместимо со старыми движками). */
  function queryParameter(name) {
    var search = window.location.search || '';
    if (search.charAt(0) === '?') search = search.substring(1);
    var pairs = search.length ? search.split('&') : [];
    for (var i = 0; i < pairs.length; i += 1) {
      var pair = pairs[i].split('=');
      if (decodeURIComponent(pair[0]) === name) {
        return decodeURIComponent((pair[1] || '').replace(/\+/g, ' '));
      }
    }
    return null;
  }

  function languageOf(element) {
    return element.getAttribute('data-language-content');
  }

  function applyLanguage(language, remember) {
    currentLanguage = language;
    document.documentElement.lang = language;
    if (isGenericTitle) document.title = pageTitles[language];

    for (var i = 0; i < content.length; i += 1) {
      content[i].hidden = languageOf(content[i]) !== language;
    }

    for (var j = 0; j < languageButtons.length; j += 1) {
      var button = languageButtons[j];
      button.setAttribute('aria-pressed', String(button.getAttribute('data-language-choice') === language));
    }

    if (remember !== false) savePreference(languageKey, language);
    updateThemeLabel();
  }

  // Цвет системной полосы (Chrome на Android, Safari) под тему страницы.
  // Без этого при тёмной теме адресная строка остаётся белой и страница
  // «не вся тёмная». ES5: без let/const/стрелок и шаблонов.
  var themeColorMeta = document.getElementById('theme-color-meta');
  function updateThemeColor(isDark) {
    if (!themeColorMeta) return;
    themeColorMeta.setAttribute('content', isDark ? '#222222' : '#ffffff');
  }

  function updateThemeLabel() {
    if (!themeButton) return;
    var isDark = document.body.className.indexOf('dark-theme') !== -1;
    var label = currentLanguage === 'ru'
      ? (isDark ? 'Включить светлую тему' : 'Включить тёмную тему')
      : (isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.setAttribute('aria-label', label);
    themeButton.setAttribute('title', label);
    themeButton.textContent = isDark ? '☀' : '☾';
  }

  for (var b = 0; b < languageButtons.length; b += 1) {
    (function (button) {
      button.addEventListener('click', function () {
        applyLanguage(button.getAttribute('data-language-choice'), true);
      });
    }(languageButtons[b]));
  }

  var requestedLanguage = queryParameter('lang');
  var storedLanguage = readPreference(languageKey);
  var initialLanguage = indexOf(['ru', 'en'], requestedLanguage) !== -1
    ? requestedLanguage
    : (indexOf(['ru', 'en'], storedLanguage) !== -1 ? storedLanguage : 'ru');
  // Язык из адреса (?lang=) — это осознанный выбор: ссылка из RSS-фида
  // открывает запись сразу на нужном языке, и этот выбор должен сохраниться
  // при переходе по внутренним ссылкам. Иначе читатель EN-фида, щёлкнув
  // «назад к дневнику», снова оказался бы на русской версии.
  applyLanguage(initialLanguage, indexOf(['ru', 'en'], requestedLanguage) !== -1);

  var storedTheme = readPreference(themeKey) || readPreference(tufteThemeKey);
  if (storedTheme === 'dark') document.body.className += ' dark-theme';

  // Заставка на время загрузки шрифтов. Пока файлы не пришли, у страницы нет
  // ни одного доступного шрифта (в стеке одно имя, запасных нет), и при
  // font-display:swap браузер успел бы показать чужие буквы — на части систем
  // с засечками. В helvetica.css стоит font-display:block, а здесь —
  // сплошное поле по теме, чтобы читатель не смотрел на пустоту.
  //
  // Порядок важен: класс ставится синхронно, до первой отрисовки, иначе поле
  // успеет мигнуть. Снимается после того, как все начертания загрузились, —
  // или по таймеру, если Font Loading API нет или загрузка подвисла.
  //
  // Ждём ровно те начертания, которые есть на странице. Раньше список был
  // общий на весь сайт и включал bolditalic (курсив 700) — 12 КБ, которых
  // нигде нет: в стилях нет ни одного правила с курсивом и жирным сразу.
  // Заставка ждала этот файл зря, и на мобильной сети именно он нередко
  // оказывался последним. Заодно 800 (heavy) нужен только архиву: заголовки
  // заметок прямые и весят 400.
  var FONT_STACK = '"HelveticaNeueCyr"';
  var isNotePage = (' ' + document.body.className + ' ').indexOf(' tufte-note ') !== -1;
  var FONT_FACES = [
    '400 1em ' + FONT_STACK,
    'italic 400 1em ' + FONT_STACK,
    '700 1em ' + FONT_STACK
  ];
  if (!isNotePage) FONT_FACES.push('800 1em ' + FONT_STACK);
  // Таймер — страховка, а не основной путь. Три секунды были привязаны к
  // font-display:block (текст невидим ровно 3 с); ждать столько незачем:
  // четыре файла — это доли секунды, а на медленной сети лучше показать
  // текст запасным шрифтом через 1.2 с, чем держать поле.
  var FONT_LOAD_TIMEOUT = 1200;

  function markFontsReady() {
    var veil = document.getElementById('fonts-loading');
    if (veil) veil.className = 'fonts-loading fonts-ready';
    if (document.body) document.body.className += ' fonts-ready';
  }

  function fontsAreLoaded() {
    // document.fonts.check() не загружает файлы, а только отвечает, доступно
    // ли начертание прямо сейчас. Если все пять доступны — грузить и ждать
    // нечего, заставку не показываем вовсе.
    if (!document.fonts || !document.fonts.check) return false;
    for (var i = 0; i < FONT_FACES.length; i += 1) {
      if (!document.fonts.check(FONT_FACES[i])) return false;
    }
    return true;
  }

  function hideFontVeilWhenReady() {
    if (fontsAreLoaded()) {
      markFontsReady();
      return;
    }
    // Заставку показывает скрипт, а не разметка: в CSS по умолчанию
    // display:none. Иначе белое поле успевало появиться ещё до выполнения
    // этого файла — на мобильной сети это и был «долгий белый экран».
    // Класс ставится здесь, то есть только когда шрифтов действительно нет.
    var veil = document.getElementById('fonts-loading');
    if (veil) veil.className = 'fonts-loading fonts-loading--pending';

    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      markFontsReady();
    }

    // Страховка: Font Loading API может отсутствовать (старый движок), а
    // загрузка — подвиснуть. Дольше 1.2 с поле не держим: за это время на
    // медленной сети уже понятно, что шрифт не успевает, и лучше показать
    // текст запасным, чем продолжать закрывать экран.
    window.setTimeout(finish, FONT_LOAD_TIMEOUT);

    if (!document.fonts || !document.fonts.load) return;

    var pending = [];
    for (var i = 0; i < FONT_FACES.length; i += 1) {
      pending.push(document.fonts.load(FONT_FACES[i]));
    }
    if (!window.Promise || !window.Promise.all) return;

    window.Promise.all(pending).then(function () {
      // Даже если какое-то начертание не пришло (сеть отвалилась), заставку
      // снимаем: держать поле дольше нет смысла, текст уже показан запасным.
      finish();
    }, function () {
      finish();
    });
  }
  document.documentElement.style.colorScheme = storedTheme === 'dark' ? 'dark' : 'light';
  updateThemeColor(storedTheme === 'dark');
  updateThemeLabel();

  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var isDark = document.body.className.indexOf('dark-theme') === -1;
      document.body.className = isDark
        ? document.body.className + ' dark-theme'
        : document.body.className.replace(/\s*dark-theme/g, '');
      var theme = isDark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = theme;
      updateThemeColor(isDark);
      savePreference(themeKey, theme);
      savePreference(tufteThemeKey, theme);
      updateThemeLabel();
    });
  }

  // Заставку запускаем сразу: скрипт подключён с defer, то есть выполняется
  // после разбора разметки, но до первой отрисовки. Класс успевает встать
  // раньше первого кадра, поэтому поле не мигает.
  hideFontVeilWhenReady();

  // Ленивая загрузка MathJax и highlight.js для заметок с формулами/кодом.
  // Стили — в tufte-universal.css (разделы «Математика» и «Код»).
  function loadScript(src) {
    return new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  function initMathAndCode() {
    var html = document.body ? document.body.innerHTML : '';
    var hasMath = /\\\(|\\\[|class="[^"]*math/.test(html);
    var hasCode = !!document.querySelector('pre code');
    var chain = Promise.resolve();

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
      chain = chain.then(function () {
        return loadScript('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js');
      });
    }
    if (hasCode && !window.hljs) {
      chain = chain.then(function () {
        return loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      });
    }
    chain.then(function () {
      if (hasCode && window.hljs) {
        try { window.hljs.highlightAll(); } catch (error) { /* без подсветки страница читабельна */ }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMathAndCode);
  } else {
    initMathAndCode();
  }
}());
