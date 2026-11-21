# Дневник разработчика / Developer diary

Главная страница сайта — двуязычный архив записей с краткими анонсами и ссылками на полные тексты в `/diary/`. Интерактивный граф доступен по адресу `/graph/`. Подробные записи дневника используют `tufte/tufte-universal.css`; для сайта не нужны отдельный сервер или npm-зависимости.

The site homepage is a bilingual diary archive with short summaries and links to full entries at `/diary/`. The interactive graph is at `/graph/`. Full diary entries use `tufte/tufte-universal.css`; the site needs no separate server or npm dependencies.

## Как добавлять записи / Adding entries

1. Добавьте полный текст записи в `diary/index.html` **перед** предыдущими записями; свежие заметки идут первыми. Затем добавьте анонс-ссылку на неё в корневой `index.html`.
2. Добавьте две версии одной записи: русский `<article lang="ru" data-language-content="ru">` и английский `<article lang="en" data-language-content="en" hidden>`. Перевод должен сохранять технический смысл, ссылки и даты.
3. Используйте одинаковый ISO-идентификатор даты (`datetime="YYYY-MM-DD"`) в обеих версиях. У каждого языка должны быть уникальные `id` у переключателей боковых заметок.
4. Для заметок на полях используйте пары `label` / `input.margin-toggle` / `.sidenote` из существующих записей. На мобильных номер раскрывает заметку.
5. Если добавляете новые CSS, JS или изображения, обновите шаг `Assemble Site Artifact` в `.github/workflows/main.yml`, чтобы ресурс попал в GitHub Pages.

1. Add new entries **before** older ones so the newest appears first.
2. Add both translations: a Russian `<article lang="ru" data-language-content="ru">` and an English `<article lang="en" data-language-content="en" hidden>`. Keep the technical meaning, links, and dates aligned.
3. Use the same ISO date (`datetime="YYYY-MM-DD"`) in both versions. Sidenote toggle IDs must be unique across both languages.
4. For margin notes, follow the existing `label` / `input.margin-toggle` / `.sidenote` pattern. On mobile, tap the number to reveal the note.
5. If you add CSS, JS, or image assets, update the `Assemble Site Artifact` step in `.github/workflows/main.yml` so the files are included in the GitHub Pages deployment.

Язык можно выбрать кнопкой RU / EN; выбор сохраняется в браузере. Для ссылки с заранее выбранным языком используйте `/?lang=ru` или `/?lang=en`.

Choose RU / EN with the language buttons; the selection is stored in the browser. To share a link with a preset language, use `/?lang=ru` or `/?lang=en`.
