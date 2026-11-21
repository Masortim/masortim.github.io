# Developer diary / Дневник разработчика

Главная страница (`/`) — архив по мотивам шестиколоночной сетки The Grid System. В нём собраны девять репозиториев; каждая карточка открывает отдельную страницу записи в `/diary/<project>/`. Страница `/diary/` содержит исходную заметку о запуске дневника, а `/graph/` ведёт к интерактивному графу.

The site homepage (`/`) is a six-column archive inspired by The Grid System. It lists nine repositories, and each card opens a dedicated entry at `/diary/<project>/`. `/diary/` keeps the original diary introduction, while `/graph/` links to the interactive graph.

## Как добавить проект / Adding a project

1. Создайте отдельную страницу `diary/<slug>/index.html`. Используйте двуязычные блоки `data-language-content="ru"` и `data-language-content="en"`, подключите `/diary/diary.css`, `/diary/projects.css` и `/diary/diary.js`.
2. Добавьте карточку со ссылкой на эту страницу в соответствующий столбец корневого `index.html`.
3. При необходимости расширьте стили в `diary/projects.css`. Workflow публикует весь каталог `diary/` в Pages.

1. Create a dedicated `diary/<slug>/index.html` page. Use bilingual `data-language-content="ru"` and `data-language-content="en"` blocks, and include `/diary/diary.css`, `/diary/projects.css`, and `/diary/diary.js`.
2. Add a card linking to the new page in the appropriate column in the root `index.html`.
3. Extend `diary/projects.css` if needed. The Pages workflow publishes the complete `diary/` directory.
