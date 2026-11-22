# Developer diary / Дневник разработчика

Главная страница (`/`) — архив по мотивам шестиколоночной сетки The Grid System. В нём собраны девять репозиториев; каждая карточка открывает отдельную страницу записи в `/diary/<project>/`. Страница `/diary/` содержит исходную заметку о запуске дневника, а `/graph/` ведёт к интерактивному графу.

The site homepage (`/`) is a six-column archive inspired by The Grid System. It lists nine repositories, and each card opens a dedicated entry at `/diary/<project>/`. `/diary/` keeps the original diary introduction, while `/graph/` links to the interactive graph.

## Типографика заметок (Tufte) / Note typography (Tufte)

Заметки (`/diary/<project>/`) набраны в стиле Эдварда Тафти: ET Book, кегль текста 21px/30px в колонке 55%, боковые сноски в правом поле, рисунки с подписями на полях, инфографика без chartjunk, формулы MathJax и блоки кода. Канонический файл — `/tufte/tufte-universal.css` (шрифты — `/tufte/et-book/`); `diary/projects.css` — только адаптер хрома заметки. Переносы по слогам в заметках выключены (`hyphens: none` в `diary.css`, действует на всех страницах дневника, кроме архива на главной), а строка управления `.note-controls` держит отступ 2.5rem от правого края окна. Эталон всех элементов — `/tufte/specimen.html` (также `example.html`, `example2.html`).

Notes (`/diary/<project>/`) are set in Edward Tufte's style: ET Book, 21px/30px text in a 55% measure, sidenotes in the right margin, figures with margin captions, chartjunk-free infographics, MathJax formulas, and code blocks. The canonical file is `/tufte/tufte-universal.css` (fonts in `/tufte/et-book/`); `diary/projects.css` is only the note-chrome adapter. Hyphenation is off in the notes (`hyphens: none` in `diary.css`, applied to every diary page except the archive home page), and the `.note-controls` row keeps a 2.5rem gap from the right edge of the browser window. The reference for every element is `/tufte/specimen.html` (also `example.html`, `example2.html`).

### Как размечать заметку / How to mark up a note

```html
<link rel="stylesheet" href="/tufte/tufte-universal.css">
<link rel="stylesheet" href="/diary/diary.css">
<link rel="stylesheet" href="/diary/projects.css">
<script src="/diary/diary.js" defer></script>
```

- Заголовок — `h1` (3.2rem, прямой), раздел — `h2` (2.2rem, курсив), подраздел — `h3` (1.7rem, курсив). Не больше двух уровней.
- Сноска: `<label for="sn-1" class="margin-toggle sidenote-number">1</label><input type="checkbox" id="sn-1" class="margin-toggle"><span class="sidenote"><span class="sidenote-number">1</span> Текст…</span>`
- Заметка на полях: тот же каркас с `⊕` и `<span class="marginnote">…</span>`
- Рисунок: `<figure><img src="…" alt="…"><figcaption>Подпись на полях…</figcaption></figure>`; малый на полях — `figure.margin-figure`, внутритекстовый — `figure.inline-figure`, широкий — `figure.fullwidth`.
- График: `<div class="tufte-chart"><p class="chart-title">…</p><p class="chart-subtitle">…</p>…<p class="chart-source">Источник: …</p></div>`; блоки — `.bar-chart`, `.dot-plot`, `.slope-graph`, `.small-multiples`, `.sparkline`, `.table-graphic`.
- Формула: `\(…\)` — инлайн, `\[…\]` — блочная (нужен MathJax; в заметках дневника подключайте его скрипт при необходимости).
- Код: `<code>…</code>` — инлайн, `<pre><code class="language-python">…</code></pre>` — блок (подсветка — highlight.js при необходимости).

## Как добавить проект / Adding a project

1. Создайте отдельную страницу `diary/<slug>/index.html`. Используйте двуязычные блоки `data-language-content="ru"` и `data-language-content="en"`, подключите `/tufte/tufte-universal.css`, `/diary/diary.css`, `/diary/projects.css` и `/diary/diary.js`.
2. Добавьте карточку со ссылкой на эту страницу в соответствующий столбец корневого `index.html`.
3. При необходимости расширьте стили в `diary/projects.css`. Workflow публикует весь каталог `diary/` в Pages.

1. Create a dedicated `diary/<slug>/index.html` page. Use bilingual `data-language-content="ru"` and `data-language-content="en"` blocks, and include `/tufte/tufte-universal.css`, `/diary/diary.css`, `/diary/projects.css`, and `/diary/diary.js`.
2. Add a card linking to the new page in the appropriate column in the root `index.html`.
3. Extend `diary/projects.css` if needed. The Pages workflow publishes the complete `diary/` directory.
