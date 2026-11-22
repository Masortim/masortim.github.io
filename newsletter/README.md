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
| Отправка писем | Resend | **нужен ключ** |

Без `RESEND_API_KEY` форма принимает адрес, но письмо с подтверждением не уходит:
Resend отвечает ошибкой, API возвращает `502 email_failed`. После добавления ключа
достаточно перевыпустить деплой — код менять не нужно.

### Что нужно от владельца

Единственный шаг, который нельзя выполнить из кода: выпустить ключ Resend.

1. [resend.com/api-keys](https://resend.com/api-keys) → Create API Key (достаточно
   Sending access).
2. Vercel → проект `masortim-newsletter` → Settings → Environment Variables →
   `RESEND_API_KEY` = `re_…` → Production.
3. Redeploy: Deployments → последний → ⋯ → Redeploy.

Домен отправителя тоже проверяется в Resend (Domains → Add Domain → DNS-записи).
Пока домена нет, можно отправлять с тестового `onboarding@resend.dev` — но только
на собственный адрес. `NEWSLETTER_FROM` меняется в тех же переменных.

До появления ключа форма показывает «Адрес принят, но отправка писем ещё
настраивается» — честно и без ложного «нет связи».

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
| `newsletter/lib/store.mjs` | Хранилище: приватный репозиторий через GitHub Contents API или память (тесты) |
| `newsletter/lib/email.mjs` | Двуязычные тексты писем и отправка через Resend |
| `newsletter/scripts/send-digest.mjs` | Сборка и отправка выпуска, поддерживает `--dry-run` и `--since` |
| `newsletter/index.html` | Страница подписки на сайте (двуязычная, как заметки) |
| `newsletter/newsletter.js` | Форма: проверка адреса, запрос, сообщения об успехе и ошибке (ES5) |
| `.github/workflows/newsletter.yml` | Еженедельный выпуск по расписанию + запуск вручную |

## Настройка (один раз)

### 1. Resend

1. Зарегистрироваться на [resend.com](https://resend.com) и добавить домен
   `masortim.github.io` (Resend покажет DNS-записи — их нужно внести у регистратора).
2. Создать API-ключ с правом отправки.
3. В настройках репозитория → **Secrets and variables → Actions** добавить:
   - `RESEND_API_KEY` — ключ из шага 2;
   - `NEWSLETTER_FROM` — например `Masortim <digest@masortim.github.io>`.

Пока домен не подтверждён, Resend разрешает отправку только на собственный
адрес аккаунта — этого достаточно, чтобы прогнать весь цикл.

### 2. Хранилище подписчиков

Список адресов в публичном репозитории хранить нельзя, поэтому он лежит в
**отдельном приватном репозитории** (например `Masortim/newsletter-store`)
в файле `subscribers.json`.

1. Создать приватный репозиторий и положить туда начальный файл:
   ```json
   { "version": 1, "subscribers": [] }
   ```
2. Создать fine-grained PAT с доступом **Contents: Read and write** только к
   этому репозиторию.
3. Добавить секреты:
   - `NEWSLETTER_STORE_REPO` — `Masortim/newsletter-store`;
   - `NEWSLETTER_STORE_TOKEN` — сам токен.

Если секреты не заданы, код работает с хранилищем в памяти: удобно для
локальных проверок, но между запросами ничего не сохраняется.

### 3. Vercel

API-функции разворачиваются на Vercel из этого же репозитория.

1. Импортировать репозиторий в Vercel (Framework Preset: **Other**).
2. В настройках проекта → **Environment Variables** добавить те же четыре
   переменные: `RESEND_API_KEY`, `NEWSLETTER_FROM`, `NEWSLETTER_STORE_REPO`,
   `NEWSLETTER_STORE_TOKEN`, плюс `NEWSLETTER_SITE=https://masortim.github.io`.
3. `.vercelignore` уже настроен: на Vercel уезжают только `api/` и
   `newsletter/lib/`, сам сайт остаётся на GitHub Pages.

После деплоя `https://<project>.vercel.app/api/newsletter/subscribe` отвечает
на POST. Форма на сайте обращается к относительному `/api/…`, поэтому нужен
маршрут с домена сайта на Vercel — например, rewrite в Cloudflare или в
настройках домена. Пока маршрута нет, форма покажет «Не получилось отправить
письмо» — это ожидаемо и не ломает сайт.

## Как это работает

**Double opt-in.** Адрес попадает в список только после перехода по ссылке из
письма. До этого он в статусе `pending` и выпусков не получает. Это защищает
и от опечаток в адресе, и от подписки чужих людей.

**Статусы подписчика:** `pending` → `confirmed` → `unsubscribed`. Отписавшийся
может вернуться: новая подписка переводит его снова в `pending`.

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
- **Рассылку нельзя отозвать.** Resend отправил письмо — оно ушло. Поэтому
  сначала `--dry-run`.
- **Первый запуск** после настройки стоит сделать вручную с `--dry-run`, чтобы
  увидеть список получателей до реальной отправки.
