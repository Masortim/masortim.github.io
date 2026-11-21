/* ============================================
   УНИВЕРСАЛЬНЫЙ JS ДЛЯ СТИЛЯ TUFTE
   ============================================
   Этот файл содержит все скрипты, необходимые для работы
   стиля Tufte Handout в HTML документах.
   
   Для использования подключите этот файл в <head> вашего HTML:
   <script src="tufte-universal.js"></script>
   ============================================ */

(function() {
  'use strict';

  // ============================================
  // ИНИЦИАЛИЗАЦИЯ HIGHLIGHT.JS ДЛЯ ПОДСВЕТКИ СИНТАКСИСА
  // ============================================
  function initHighlightJS() {
    try {
      if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
        return;
      }
      var checkInterval = setInterval(function() {
        if (typeof hljs !== 'undefined') {
          clearInterval(checkInterval);
          hljs.highlightAll();
        }
      }, 50);
      setTimeout(function() { clearInterval(checkInterval); }, 5000);
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHighlightJS);
  } else {
    initHighlightJS();
  }
  if (document.readyState === 'complete') {
    window.setTimeout(initHighlightJS, 0);
  } else {
    window.addEventListener('load', function() { window.setTimeout(initHighlightJS, 0); });
  }

  // ============================================
  // ИНИЦИАЛИЗАЦИЯ MATHJAX ДЛЯ МАТЕМАТИЧЕСКИХ ФОРМУЛ
  // ============================================
  function initMathJax() {
    if (window.MathJax) return;
    window.MathJax = {
      tex: {
        inlineMath: [['\\(', '\\)']],
        displayMath: [['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
      },
      options: { ignoreHtmlClass: 'tex2jax_ignore', processHtmlClass: 'tex2jax_process' }
    };
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.async = true;
    script.onerror = function() { console.warn('Не удалось загрузить MathJax.'); };
    document.head.appendChild(script);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMathJax);
  } else {
    initMathJax();
  }

  // ============================================
  // ДОПОЛНИТЕЛЬНЫЕ УТИЛИТЫ ДЛЯ КОДА
  // ============================================
  function highlightNewCodeBlocks() {
    if (typeof hljs === 'undefined') return;
    var codeBlocks = document.querySelectorAll('pre code:not(.hljs)');
    codeBlocks.forEach(function(block) {
      try { hljs.highlightElement(block); } catch (e) { console.warn('Ошибка подсветки кода:', e); }
    });
  }
  window.tufteHighlightNewCode = highlightNewCodeBlocks;
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function(mutations) {
      var should = false;
      mutations.forEach(function(m) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(function(n) {
            if (n.nodeType === 1 && (n.tagName === 'CODE' || n.querySelector && n.querySelector('code'))) {
              should = true;
            }
          });
        }
      });
      if (should) window.setTimeout(highlightNewCodeBlocks, 100);
    });
    var startObserve = function() { observer.observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserve); else startObserve();
  }

  // ============================================
  // ПЕРЕКЛЮЧЕНИЕ ТЕМ (НОЧНАЯ/ДНЕВНАЯ)
  // ============================================
  function initThemeToggle() {
    if (document.getElementById('theme-toggle-button')) return;
    var btn = document.createElement('button');
    btn.id = 'theme-toggle-button';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Переключить тему');
    btn.innerHTML = '🌙';
    document.body.appendChild(btn);
    var saved = localStorage.getItem('tufte-theme');
    if (saved === 'dark') { document.body.classList.add('dark-theme'); btn.innerHTML = '☀️'; }
    btn.addEventListener('click', function() {
      var isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('tufte-theme', isDark ? 'dark' : 'light');
      btn.innerHTML = isDark ? '☀️' : '🌙';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
  window.tufteInitThemeToggle = initThemeToggle;

  // ============================================
  // ОБРАБОТКА ВИДЕО (обертка iframe/videos)
  // ============================================
  function initSidenoteVideos() {
    var allIframes = document.querySelectorAll('iframe:not(.video-container iframe)');
    allIframes.forEach(function(iframe) {
      if (iframe.parentElement && iframe.parentElement.classList.contains('video-container')) return;
      var isInSidenote = iframe.closest && iframe.closest('.sidenote, .marginnote');
      var isInFigure = iframe.closest && iframe.closest('div.figure');
      var isInMain = iframe.closest && iframe.closest('p, section, div.section');
      if (isInSidenote || isInFigure || (isInMain && !isInSidenote)) {
        var container = document.createElement('div');
        container.className = 'video-container';
        iframe.parentNode.insertBefore(container, iframe);
        container.appendChild(iframe);
      }
    });
    var allVideos = document.querySelectorAll('video');
    allVideos.forEach(function(v) {
      if (!v.hasAttribute('width') && !v.style.width) v.style.width = '100%';
      if (!v.hasAttribute('height') && !v.style.height) v.style.height = 'auto';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidenoteVideos);
  } else {
    initSidenoteVideos();
  }
  if (document.readyState === 'complete') {
    window.setTimeout(initSidenoteVideos, 0);
  } else {
    window.addEventListener('load', function() { window.setTimeout(initSidenoteVideos, 0); });
  }
  if (typeof MutationObserver !== 'undefined') {
    var videoObserver = new MutationObserver(function(mutations) {
      var should = false;
      mutations.forEach(function(m) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(function(n) {
            if (n.nodeType === 1 && (n.tagName === 'VIDEO' || n.tagName === 'IFRAME' || (n.querySelector && (n.querySelector('video') || n.querySelector('iframe'))))) {
              should = true;
            }
          });
        }
      });
      if (should) window.setTimeout(initSidenoteVideos, 100);
    });
    var startObserve2 = function() { videoObserver.observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserve2); else startObserve2();
  }
  window.tufteInitSidenoteVideos = initSidenoteVideos;

  // ============================================
  // ПРОГРЕССОР ЗАГОЛОВКОВ (полоски слева + всплывающий список)
  // ============================================
  function ensureTocProgressStyles() {
    if (document.getElementById('tufte-toc-progress-style')) return;
    var css = '' +
      '.toc-progress{position:fixed;z-index:9999;left:10px;top:120px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;user-select:none}' +
      '.toc-progress .toc-bar{width:16px;height:6px;background:#cfcfcf;border-radius:2px;opacity:.7;cursor:pointer;transition:opacity .15s ease,background-color .15s ease,transform .15s ease}' +
      '.toc-progress .toc-bar:hover{opacity:1}' +
      '.toc-progress .toc-bar.active{background:#333;opacity:1;transform:scaleX(1.15)}' +
      '.toc-progress .toc-tooltip{position:absolute;left:28px;top:0;background:rgba(255,255,255,.98);color:#111;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:6px 8px;min-width:280px;width:max-content;max-width:90vw;max-height:60vh;overflow-y:auto;overflow-x:auto;opacity:0;pointer-events:none;transition:opacity .15s ease}' +
      '.toc-progress:hover .toc-tooltip,.toc-progress:focus-within .toc-tooltip{opacity:1;pointer-events:auto}' +
      '.toc-progress.is-open .toc-tooltip{opacity:1;pointer-events:auto}' +
      '.toc-progress .toc-tooltip ul{margin:0;padding:0;list-style:none}' +
      '.toc-progress .toc-tooltip li{margin:1px 0}' +
      '.toc-progress .toc-tooltip a{display:block;color:inherit;text-decoration:none;font-size:.85rem;line-height:1.2;white-space:nowrap;overflow:visible;text-overflow:clip;padding:0;background:none!important;text-shadow:none!important}' +
      '.toc-progress .toc-tooltip a:hover{text-decoration:none}' +
      '.toc-progress .toc-tooltip a,.toc-progress .toc-tooltip a:link,.toc-progress .toc-tooltip a:visited,.toc-progress .toc-tooltip a:hover,.toc-progress .toc-tooltip a:active{background:none!important;text-shadow:none!important;text-decoration:none!important}' +
      '.toc-progress .toc-tooltip .toc-item{display:block}' +
      '.toc-progress .toc-tooltip .toc-item.level-2 a{padding-left:12px;font-size:.82rem;opacity:.95}' +
      '.toc-progress .toc-tooltip .toc-item.active > a{font-weight:600}' +
      '.toc-progress .toc-tooltip .toc-item.hidden{display:none}' +
      '.toc-progress .toc-bar.is-hover{transform:scaleX(1.25)!important;opacity:1}' +
      '.toc-progress .toc-tooltip .toc-controls{display:flex;gap:4px;margin:4px 0 6px 0}' +
      '.toc-progress .toc-tooltip .toc-controls button{font-size:.75rem;line-height:1;padding:2px 6px;border:1px solid #ccc;border-radius:10px;background:#f5f5f5;cursor:pointer}' +
      '.toc-progress .toc-tooltip .toc-controls button.active{background:#e0e0e0;border-color:#bbb}' +
      'body.dark-theme .toc-progress .toc-bar{background:#555}' +
      'body.dark-theme .toc-progress .toc-bar.active{background:#f0f0f0}' +
      'body.dark-theme .toc-progress .toc-tooltip{background:rgba(32,32,32,.98);color:#e0e0e0;border-color:#444;box-shadow:0 4px 16px rgba(0,0,0,.3)}';
    var style = document.createElement('style');
    style.id = 'tufte-toc-progress-style';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function ensureLayoutFixesStyles() {
    if (document.getElementById('tufte-layout-fixes-style')) return;
    var css = '' +
      '/* Fix gap before headings after right floats (sidenotes/marginnotes) */' +
      'h1, h2, div.section>h1, div.section>h2{clear:none!important;}' +
      'div.section>h1, div.section>h2{padding-right:0.25rem;}';
    var s = document.createElement('style');
    s.id = 'tufte-layout-fixes-style';
    s.type = 'text/css';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function initTocProgress() {
    try {
      ensureLayoutFixesStyles();
      ensureTocProgressStyles();
      if (document.querySelector('.toc-progress')) return; // избежать дубликатов
      // Ищем заголовки внутри секций
      var headings = Array.prototype.slice.call(document.querySelectorAll('div.section > h1, div.section > h2'));
      if (!headings.length) return;

      // Удалим дубликаты и заголовки-метаданные, если попадутся случайно
      headings = headings.filter(function(h){ return !h.classList.contains('title') && !h.classList.contains('subtitle') && !h.classList.contains('author') && !h.classList.contains('date'); });
      if (!headings.length) return;

      // Добавим id, если отсутствует
      headings.forEach(function(h, idx){ if (!h.id) h.id = 'section-heading-' + (idx + 1); });

      // Контейнер прогрессора
      var container = document.createElement('div');
      container.className = 'toc-progress';
      container.setAttribute('role', 'navigation');
      container.setAttribute('aria-label', 'Прогресс по заголовкам');

      // Подсказка-список
      var tooltip = document.createElement('div');
      tooltip.className = 'toc-tooltip';
      var controls = document.createElement('div');
      controls.className = 'toc-controls';
      var btnAll = document.createElement('button'); btnAll.textContent = 'Все'; btnAll.className = 'active';
      var btnH1 = document.createElement('button'); btnH1.textContent = 'H1';
      var btnH2 = document.createElement('button'); btnH2.textContent = 'H2';
      controls.appendChild(btnAll); controls.appendChild(btnH1); controls.appendChild(btnH2);
      var list = document.createElement('ul');
      tooltip.appendChild(controls);
      tooltip.appendChild(list);

      // Полоски и пункты меню
      var bars = [];
      var items = [];
      headings.forEach(function(h, i) {
        var bar = document.createElement('div');
        bar.className = 'toc-bar';
        bar.title = h.textContent.trim();
        bar.addEventListener('click', function(e){ e.preventDefault(); document.getElementById(h.id).scrollIntoView({behavior:'smooth',block:'start'}); });
        bar.addEventListener('mouseenter', function(){ 
          bars.forEach(function(b){ b.classList.remove('is-hover'); });
          bar.classList.add('is-hover');
          items.forEach(function(li){ li.classList.remove('active'); });
          var li = items[i]; 
          if (li) { li.classList.add('active'); try { list.scrollTop = li.offsetTop - 8; } catch(_) {} }
        });
        container.appendChild(bar);
        bars.push(bar);

        var li = document.createElement('li');
        li.className = 'toc-item level-' + (h.tagName === 'H2' ? '2' : '1');
        li.dataset.idx = i;
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent.trim();
        a.addEventListener('click', function(e){ e.preventDefault(); document.getElementById(h.id).scrollIntoView({behavior:'smooth',block:'start'}); });
        li.addEventListener('mouseenter', function(){
          bars.forEach(function(b){ b.classList.remove('is-hover'); });
          if (bars[i]) bars[i].classList.add('is-hover');
          items.forEach(function(x){ x.classList.remove('active'); });
          li.classList.add('active');
        });
        li.appendChild(a);
        list.appendChild(li);
        items.push(li);
      });

      // Фильтрация списка по уровням
      function applyFilter(mode) {
        btnAll.classList.toggle('active', mode==='all');
        btnH1.classList.toggle('active', mode==='h1');
        btnH2.classList.toggle('active', mode==='h2');
        items.forEach(function(li){
          var isH2 = li.classList.contains('level-2');
          var isH1 = li.classList.contains('level-1');
          var hidden = false;
          if (mode === 'h1') hidden = !isH1;
          else if (mode === 'h2') hidden = !isH2;
          li.classList.toggle('hidden', hidden);
        });
      }
      btnAll.addEventListener('click', function(){ applyFilter('all'); });
      btnH1.addEventListener('click', function(){ applyFilter('h1'); });
      btnH2.addEventListener('click', function(){ applyFilter('h2'); });

      container.appendChild(tooltip);
      document.body.appendChild(container);

      // Управление показом/скрытием подсказки (устраняет исчезновение при переходе к списку)
      var closeTimer = null;
      function openTooltip(){ if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } container.classList.add('is-open'); }
      function closeTooltipDelayed(){ if (closeTimer) clearTimeout(closeTimer); closeTimer = setTimeout(function(){ container.classList.remove('is-open'); }, 200); }
      container.addEventListener('mouseenter', openTooltip);
      container.addEventListener('mouseleave', closeTooltipDelayed);
      tooltip.addEventListener('mouseenter', openTooltip);
      tooltip.addEventListener('mouseleave', closeTooltipDelayed);

      // Позиционируем слева чуть внутрь от padding-left body (если есть)
      try {
        var pl = parseFloat(getComputedStyle(document.body).paddingLeft || '0');
        if (!isNaN(pl) && pl > 0) container.style.left = Math.max(10, pl * 0.25) + 'px';
      } catch(_) {}

      // Обновление активного индекса через rAF на scroll/resize
      var ticking = false;
      function updateActive() {
        ticking = false;
        var viewportTop = 80; // пиксели от верха, чтобы считать заголовок достигнутым
        var current = 0;
        for (var i = 0; i < headings.length; i++) {
          var r = headings[i].getBoundingClientRect();
          if (r.top <= viewportTop) current = i; else break;
        }
        // Если пользователь дошёл до низа страницы, активируем последний заголовок
        var doc = document.documentElement;
        var scrollY = (window.scrollY !== undefined ? window.scrollY : window.pageYOffset);
        var nearBottom = (window.innerHeight + scrollY >= (doc.scrollHeight - 1));
        if (nearBottom) current = headings.length - 1;
        bars.forEach(function(b, idx){ b.classList.toggle('active', idx <= current); });
        if (typeof items !== 'undefined') {
          items.forEach(function(li, idx){ li.classList.toggle('active', idx === current); });
        }
      }
      function requestUpdate() {
        if (!ticking) { window.requestAnimationFrame(updateActive); ticking = true; }
      }
      window.addEventListener('scroll', requestUpdate, { passive: true });
      window.addEventListener('resize', requestUpdate);
      // Первичное обновление после отрисовки
      setTimeout(updateActive, 0);
    } catch (e) {
      console.warn('Ошибка инициализации toc-progress:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTocProgress);
  } else {
    initTocProgress();
  }
  window.tufteInitTocProgress = initTocProgress;

})();
