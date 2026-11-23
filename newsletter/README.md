# Email-рассылка дневника / Diary email newsletter

Механика подписки и отправки выпусков. Сайт живёт на GitHub Pages, а он умеет
отдавать только статические файлы — ни хранить подписчиков, ни отправлять письма
сам не может. Поэтому рассылка сделана из двух частей: **API на Vercel** и
**еженедельный workflow в GitHub Actions**.

```
Подписка (форма)     →  POST /api/newsletter/subscribe  →  письмо с подтверждением
Переход по ссылке    →  GET  /api/newsletter/confirm    →  адрес в списке, письмо «готово»
Отписка из письма    →  GET  /api/newsletter/unsubscribe →  адрес из списка убран
Еженедельный выпуск  →  newsletter/scripts/send-digest.mjs (GitHub Actions, cron)
```

## Что уже настроено

| Слой | Где | Состояние |
| --- | --- | --- |
| Хранилище | Supabase, проект `masortim-newsletter` (`ruirizviwndgyojdqicu`), таблица `public.newsletter_subscribers` | работает |
| Доступ к таблице | RLS включён, политик нет: пишет и читает только `service_role` | работает |
| API | `https://masortim-newsletter.vercel.app` (проект `prj_fxHDrJlcI8Z5XUUsNNYeQua1STHm`) | задеплоено |
| Переменные | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEWSLETTER_SITE`, `NEWSLETTER_API_BASE`, `CRON_SECRET` | заданы |
| Еженедельный выпуск | `GET /api/newsletter/digest`, Vercel Cron `0 9 * * 0` | зарегистрирован |
| Форма на сайте | `newsletter/config.js` → `NEWSLETTER_API_BASE` | указывает на Vercel |
| Отправка писем | SMTP Gmail, адрес `alex.typeface@gmail.com` | **нужен пароль приложения** |

Транспорт выбирается сам: если задан `NEWSLETTER_SMTP_PASS` — письма идут через
SMTP Gmail от имени автора; если задан только `RESEND_API_KEY` — через Resend
(годится лишь с проверенным доменом). Без пароля и ключа форма принимает адрес,
но письмо не уходит, и API честно отвечает `502 email_failed` с полем `upstream`:
по нему видно, отказал транспорт из-за пароля (`535 auth_failed`) или получателя
(`550 recipient_rejected`).

### Как проверить, что API жив

Среда разработки не видит домены Vercel, поэтому проверка вынесена в
GitHub Actions — `.github/workflows/newsletter-probe.yml`:

```bash
gh run list --workflow=newsletter-probe.yml --limit 1
```

Воркфлоу прозванивает живой адрес и падает, если:
- корень не отдаёт `200` с описанием маршрутов;
- битый адрес не получает `400 invalid_email`;
- валидный адрес получает что-то кроме `200` (письмо ушло) и `502` (нет ключа);
- `digest` без секрета отдаёт не `401`;
- нет заголовка `Access-Control-Allow-Origin` для `https://masortim.github.io`;
- отвечает редирект на SSO Vercel — значит включена защита деплоя.

Именно эта проверка нашла две ошибки, которые локальные тесты пропустили:
`FUNCTION_INVOCATION_FAILED` из-за повторного `const SITE` в бандле и
404 на `newsletter/config.js` из-за неполного списка копируемых файлов
в `main.yml`.

### Что нужно от владельца

Единственный шаг, который нельзя выполнить из кода: получить пароль приложения
Gmail. Подробная инструкция — в [SETUP-FINAL.md](./SETUP-FINAL.md), шаги 1–3.
Коротко:

1. <https://myaccount.google.com/security> → включить двухэтапную аутентификацию.
2. <https://myaccount.google.com/apppasswords> → создать пароль для
   `masortim newsletter`.
3. Vercel → проект `masortim-newsletter` → Settings → Environment Variables:
   `NEWSLETTER_SMTP_PASS` = 16 символов, `NEWSLETTER_SMTP_USER` = ящик,
   `NEWSLETTER_FROM` = `Masortim <alex.typeface@gmail.com>`.
4. Deployments → последний → ⋯ → Redeploy.

До появления пароля форма показывает «Адрес принят, но отправка писем ещё
настраивается» — честно и без ложного «нет связи». Самодиагностика
`/api/newsletter/health` в поле `blocking` пишет дословно, чего не хватает.

### Как устроен деплой

Vercel-проект создан в режиме `framework: node`: из корня собирается **одна**
функция, а каталог `api/` не разворачивается в отдельные роуты. Поэтому
маршрутизация живёт в `newsletter/edge/index.mjs`, который собирается
скриптом:

```bash
node newsletter/scripts/bundle.mjs
```

Скрипт склеивает `api/newsletter/*.mjs` и `newsletter/lib/*.mjs` в один
самодостаточный файл (плюс генерирует `newsletter/edge/vercel.json` с cron).
В репозитории источники остаются раздельными — склейка нужна только для
артефакта деплоя, он в `.gitignore`.

Перед отправкой бандл проверяется локально:

```bash
node newsletter/test/e2e-bundle.mjs   # 18 проверок: подписка → подтверждение → отписка
```

### Почему Supabase, а не файл в репозитории

Подписка на файл в GitHub — это коммит на каждого подписчика: гонки при записи,
тысячи коммитов в истории, и нужен отдельный приватный репозиторий с токеном.
Строка в таблице дешевле и не требует ничего, кроме service-ключа в серверных
переменных. Токен подтверждения и отписки хранится в той же строке.

### Схема таблицы

```sql
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  lang text not null default 'ru' check (lang in ('ru','en')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','unsubscribed')),
  token text not null unique,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
grant all on public.newsletter_subscribers to service_role;
```

### Адрес API в браузере

Сайт на GitHub Pages и функции на Vercel — разные домены, поэтому адрес API
задан в `newsletter/config.js` (`NEWSLETTER_API_BASE`). Пока значение пустое,
форма честно сообщает «серверная часть пока не подключена» вместо «нет связи».


## Что где лежит

| Файл | Назначение |
| --- | --- |
| `api/newsletter/subscribe.mjs` | Приём адреса, создание подписки `pending`, отправка письма с подтверждением |
| `api/newsletter/confirm.mjs` | Подтверждение по токену, приветственное письмо, редирект на `/newsletter/?state=…` |
| `api/newsletter/unsubscribe.mjs` | Отписка по токену из письма |
| `newsletter/lib/subscribers.mjs` | Вся логика списка: подписка, подтверждение, отписка, выборка подтверждённых |
| `newsletter/lib/store.mjs` | Хранилище: Supabase через PostgREST; пишет только изменившиеся строки; память для тестов |
| `newsletter/lib/email.mjs` | Двуязычные тексты писем и выбор транспорта (SMTP или Resend) |
| `newsletter/lib/smtp.mjs` | SMTP-клиент без зависимостей: EHLO, AUTH LOGIN, DATA, STARTTLS |
| `newsletter/edge/index.mjs` | Собранная функция для Vercel (генерируется, руками не править) |
| `newsletter/scripts/send-digest.mjs` | Сборка и отправка выпуска, поддерживает `--dry-run` и `--since` |
| `newsletter/index.html` | Страница подписки на сайте (двуязычная, как заметки) |
| `newsletter/newsletter.js` | Форма: проверка адреса, запрос, сообщения об успехе и ошибке (ES5) |
| `.github/workflows/newsletter-probe.yml` | Проба живого API снаружи: конвейер, CORS, самодиагностика, полный цикл |

## Настройка (один раз)

Всё уже развёрнуто; ниже — что где лежит, если понадобится повторить.

### 1. Отправка: SMTP Gmail

Письма уходят от имени `alex.typeface@gmail.com`. Обычный пароль Google для
этого не годится — нужен пароль приложения, и в аккаунте должна быть включена
двухэтапная аутентификация.

1. <https://myaccount.google.com/apppasswords> → создать пароль для
   `masortim newsletter`.
2. Vercel → проект `masortim-newsletter` → Environment Variables:
   - `NEWSLETTER_SMTP_PASS` — 16 символов (пробелы можно оставить, код их уберёт);
   - `NEWSLETTER_SMTP_USER` — `alex.typeface@gmail.com`;
   - `NEWSLETTER_FROM` — `Masortim <alex.typeface@gmail.com>`.
3. Перевыпустить деплой: без этого переменные не попадут в функцию.

`NEWSLETTER_SMTP_HOST` и `NEWSLETTER_SMTP_PORT` по умолчанию —
`smtp.gmail.com` и `465`, задавать их не обязательно.

### 2. Хранилище подписчиков: Supabase

Таблица `public.newsletter_subscribers` в проекте `masortim-newsletter`
(`ruirizviwndgyojdqicu`). RLS включён, политик нет: доступ есть только у
`service_role`, поэтому ключ живёт исключительно в переменных Vercel.

Колонки: `email` (первичный ключ), `lang`, `status`, `token`, `created_at`,
`confirmed_at`, `unsubscribed_at`. Отписка не ставит статус, а **удаляет**
строку: адрес, который попросили забыть, в базе не остаётся.

### 3. Vercel

- Проект `masortim-newsletter-api` (`prj_fxHDrJlcI8Z5XUUsNNYeQua1STHm`),
  root directory `newsletter/edge`.
- Переменные: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEWSLETTER_SITE`,
  `NEWSLETTER_API_BASE`, `CRON_SECRET`, `NEWSLETTER_FROM`, `NEWSLETTER_SMTP_*`.
- Автодеплой по push отключён: каждый деплой выпускается явно.
- `.vercelignore` — список исключений: на Vercel уезжает только собранная
  функция, сайт остаётся на GitHub Pages.

Сайт обращается к API по абсолютному адресу из `newsletter/config.js`
(`NEWSLETTER_API_BASE`), поэтому CORS настроен на `https://masortim.github.io`.

## Как это работает

**Double opt-in.** Адрес попадает в список только после перехода по ссылке из
письма. До этого он в статусе `pending` и выпусков не получает. Это защищает
и от опечаток в адресе, и от подписки чужих людей.

**Статусы подписчика:** `pending` → `confirmed`. Отписка удаляет строку, поэтому
вернувшийся подписчик снова проходит подтверждение — это нормально и безопасно.

**Токены.** Случайные 24 байта в base64url, по одному на подписчика. Токен
используется и для подтверждения, и для отписки, поэтому ссылка отписки есть
в каждом письме.

**Язык.** Хранится вместе с адресом (`ru`/`en`) и обновляется при каждой
подписке — письма приходят на языке, который читатель выбрал на сайте.

**Ответ формы не раскрывает статус.** На уже подтверждённый адрес форма
отвечает так же, как на новый, но письмо не отправляет: иначе форму можно
было бы использовать, чтобы проверять, кто подписан.

## Выпуск

Workflow `newsletter.yml` запускается каждое воскресенье в 09:00 UTC и умеет
запускаться вручную (**Actions → Weekly Newsletter Digest → Run workflow**).

- по умолчанию в выпуск идут три последние записи;
- поле `since` ограничивает выпуск датой (`2026-11-01`);
- `dry_run` показывает получателей и записи, ничего не отправляя.

Локально:

```bash
node newsletter/scripts/send-digest.mjs --dry-run
node newsletter/scripts/send-digest.mjs --since 2026-11-01
```

Записи берутся из тех же `diary/<slug>/index.html`, что и RSS-фиды: заголовок
и вступление на языке подписчика. Новый каталог заметки попадает в выпуск
автоматически.

## Проверки

```bash
cd newsletter && npm test        # 11 тестов логики и писем
node scripts/check-es5.mjs       # newsletter.js тоже должен быть ES5 (QuiteRSS)
```

Тесты покрывают: подписку, повторную отправку подтверждения, подтверждение,
идемпотентность, отписку, возврат после отписки, неизвестные токены,
валидацию адресов, уникальность токенов, экранирование HTML в письмах.

## Ограничения

- **Хранилище в GitHub** — не база данных: каждая запись списка делает коммит
  в приватный репозиторий. Для дневника с десятками подписчиков это нормально,
  для тысяч — стоит перейти на реальную БД (например Postgres или KV).
- **Рассылку нельзя отозвать.** Письмо отправлено — оно ушло. Поэтому
  сначала `--dry-run`.
- **Первый запуск** после настройки стоит сделать вручную с `--dry-run`, чтобы
  увидеть список получателей до реальной отправки.
