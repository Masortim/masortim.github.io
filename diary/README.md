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

## Подписка: RSS-фид / Subscription: RSS feed

Фидов два — по одному на язык: `/feed.xml` (русский) и `/feed-en.xml` (английский). Оба собираются автоматически из самих страниц заметок — отдельного списка записей вести не нужно. Скрипт `scripts/build-feed.mjs` обходит `diary/<slug>/index.html`, берёт `h1`, `note-dek`, `note-meta` и ссылку на репозиторий, сортирует по дате (свежие сверху) и пишет RSS 2.0. Заметка попадает в фид, только если у неё есть заголовок и вступление на языке этого фида, поэтому частично переведённые записи не смешивают языки в одном канале. В CI шаг «Build RSS Feeds» выполняется перед сборкой артефакта на каждый пуш в `main`, поэтому новая папка с заметкой сразу попадает в оба фида. Локально: `node scripts/build-feed.mjs`. На главной ссылка в блоке «Подписка» ведёт на фид активного языка сайта («RSS-рассылка ↗» → `/feed.xml`, «RSS feed ↗» → `/feed-en.xml`); в `<head>` объявлены два `<link rel="alternate" type="application/rss+xml" hreflang="…">` для автообнаружения фида браузером и читалками. Адрес каждой записи в фиде содержит языковой параметр (`?lang=ru` / `?lang=en`), поэтому заметка из английского фида открывается сразу на английском, даже если читатель до этого смотрел русскую версию; язык из адреса запоминается и сохраняется при переходе по внутренним ссылкам.

There are two feeds, one per language: `/feed.xml` (Russian) and `/feed-en.xml` (English). Both are generated automatically from the note pages themselves — there is no separate list of entries to maintain. `scripts/build-feed.mjs` walks `diary/<slug>/index.html`, reads `h1`, `note-dek`, `note-meta`, and the repository link, sorts by date (newest first), and writes RSS 2.0. A note appears in a feed only if it has a title and a dek in that feed's language, so partially translated entries never mix languages within one channel. In CI the “Build RSS Feeds” step runs before the artifact is assembled on every push to `main`, so a new note folder appears in both feeds immediately. Locally: `node scripts/build-feed.mjs`. On the homepage the Subscription link points to the feed of the site's active language («RSS-рассылка ↗» → `/feed.xml`, «RSS feed ↗» → `/feed-en.xml`), and two `<link rel="alternate" type="application/rss+xml" hreflang="…">` tags let browsers and readers auto-discover them. Each entry URL carries a language parameter (`?lang=ru` / `?lang=en`), so a note opened from the English feed renders in English even if the reader had previously browsed the Russian version; the language from the URL is remembered and persists across internal links.

### Скрипты должны оставаться ES5-совместимыми / Scripts must stay ES5-compatible

Встроенный браузер RSS-ридера QuiteRSS — это старый QtWebKit. Файлы `diary/diary.js` и `diary/archive.js` обязаны разбираться как ES5: `?.`, стрелочные функции, `let`/`const`, `async/await` и `URLSearchParams` для него синтаксическая ошибка, и тогда скрипт не выполняется целиком — страница из английского фида открывалась на русском. Проверка: `node scripts/check-es5.mjs` (парсит файлы настоящим парсером acorn с `ecmaVersion: 5`), она же выполняется в CI перед сборкой артефакта.

The built-in browser of the QuiteRSS reader is an old QtWebKit. `diary/diary.js` and `diary/archive.js` must parse as ES5: `?.`, arrow functions, `let`/`const`, `async/await`, and `URLSearchParams` are syntax errors there, and then the whole script never runs — a note opened from the English feed rendered in Russian. Check with `node scripts/check-es5.mjs` (parses the files with acorn at `ecmaVersion: 5`); CI runs it before assembling the artifact.

## Email-рассылка / Email newsletter

Кроме RSS есть email-рассылка: форма на `/newsletter/`, ссылка «Email-рассылка ↗» в колонке «Подписка». Подписка двухшаговая (double opt-in): адрес попадает в список только после перехода по ссылке из письма, отписка — одним кликом из любого письма. Выпуск с новыми записями уходит раз в неделю (`.github/workflows/newsletter.yml`), записи берутся из тех же `diary/<slug>/index.html`, что и фиды.

Сайт статический, поэтому отправка и хранение живут вне GitHub Pages: API-функции на Vercel (`api/newsletter/`) шлют письма через Resend, список подписчиков хранится в отдельном приватном репозитории. Полная инструкция по настройке и ограничения — [newsletter/README.md](../newsletter/README.md).

Besides RSS there is an email newsletter: a form at `/newsletter/` and an “Email newsletter ↗” link in the Subscription column. Subscription is double opt-in: the address is added only after clicking the link in the confirmation email, and every email carries a one-click unsubscribe link. A digest with new notes goes out weekly (`.github/workflows/newsletter.yml`), drawn from the same `diary/<slug>/index.html` pages as the feeds.

The site is static, so sending and storage live outside GitHub Pages: Vercel API functions (`api/newsletter/`) send mail through Resend, and the subscriber list lives in a separate private repository. Setup instructions and limitations: [newsletter/README.md](../newsletter/README.md).

## Как добавить проект / Adding a project

1. Создайте отдельную страницу `diary/<slug>/index.html`. Используйте двуязычные блоки `data-language-content="ru"` и `data-language-content="en"`, подключите `/tufte/tufte-universal.css`, `/diary/diary.css`, `/diary/projects.css` и `/diary/diary.js`.
2. Добавьте карточку со ссылкой на эту страницу в соответствующий столбец корневого `index.html`.
3. При необходимости расширьте стили в `diary/projects.css`. Workflow публикует весь каталог `diary/` в Pages.

1. Create a dedicated `diary/<slug>/index.html` page. Use bilingual `data-language-content="ru"` and `data-language-content="en"` blocks, and include `/tufte/tufte-universal.css`, `/diary/diary.css`, `/diary/projects.css`, and `/diary/diary.js`.
2. Add a card linking to the new page in the appropriate column in the root `index.html`.
3. Extend `diary/projects.css` if needed. The Pages workflow publishes the complete `diary/` directory.
