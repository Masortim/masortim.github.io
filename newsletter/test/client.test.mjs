// Логика формы в браузере: перебор адресов API и переход по ссылке из письма.
//
// Проверять нужно именно поведение, а не текст: раньше форма ходила на один
// домен, и когда провайдер начал рвать соединение с ним, подписка перестала
// работать у части читателей. Теперь адресов два, и код обязан переходить на
// второй при сетевой ошибке.
//
// newsletter.js берёт элементы из DOM, поэтому тест подсовывает минимальные
// заглушки вместо настоящей страницы.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '../newsletter.js');

const SUPABASE = 'https://ruirizviwndgyojdqicu.supabase.co/functions/v1/newsletter-api';
const VERCEL = 'https://masortim-newsletter.vercel.app';

function element() {
  return {
    value: '', disabled: false, hidden: false, className: '', textContent: '',
    listeners: {},
    children: [],
    addEventListener(type, handler) { this.listeners[type] = handler; },
    appendChild(child) {
      this.children.push(child);
      // Так же, как в браузере: текст узла складывается в textContent.
      if (child && typeof child.text === 'string') this.textContent += child.text;
      else if (child && typeof child.textContent === 'string') this.textContent += child.textContent;
      return child;
    },
    removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; },
    setAttribute() {},
    focus() {},
  };
}

/**
 * Загружает newsletter.js в поддельное окно.
 * search — адресная строка, storage — сохранённые предпочтения.
 */
async function load({ search = '', storage = {}, fetch: fetchImpl } = {}) {
  const source = await readFile(SOURCE, 'utf8');
  const store = new Map(Object.entries(storage));
  const parts = {
    '#newsletter-form': element(),
    '#newsletter-email': element(),
    '#newsletter-submit': element(),
    '#newsletter-notice': element(),
  };
  const calls = [];

  const window = {
    fetch: (url, init) => { calls.push(String(url)); return fetchImpl(String(url), init); },
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    location: { search, pathname: '/newsletter/' },
    history: { replaceState: null, _last: null },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
    },
    NEWSLETTER_API_BASES: [SUPABASE, VERCEL],
  };
  window.history.replaceState = (_state, _title, url) => { window.history._last = url; };

  const document = {
    querySelector: (selector) => parts[selector] ?? null,
    querySelectorAll: () => [],
    documentElement: { lang: 'ru' },
    // Кнопки подтверждения создаются на лету: нужен минимальный узел.
    createElement: () => element(),
    createTextNode: (text) => ({ text }),
  };

  // Скрипт рассчитан на браузер и берёт window/document при выполнении.
  // Подменяем их на время загрузки. Прямой eval, а не косвенный: нужна
  // внешняя область видимости, которой эти глобальные объекты и видны.
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = document;
  try {
    // eslint-disable-next-line no-eval
    eval(source);
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
  }

  return { parts, window, calls };
}

/** Отправляет форму и ждёт, пока обещания улягутся. */
async function submit(env) {
  const form = env.parts['#newsletter-form'];
  env.parts['#newsletter-email'].value = 'reader@example.com';
  form.listeners.submit({ preventDefault() {} });
  await new Promise((done) => setTimeout(done, 50));
  return env.parts['#newsletter-notice'];
}

test('подписка уходит на первый адрес, если он отвечает', async () => {
  const env = await load({ fetch: async () => new Response('{"ok":true}', { status: 200 }) });
  const notice = await submit(env);
  assert.equal(env.calls.length, 1);
  assert.ok(env.calls[0].startsWith(SUPABASE), env.calls[0]);
  assert.match(notice.textContent, /Готово/);
});

test('сетевая ошибка на первом адресе — переход на второй', async () => {
  const env = await load({
    fetch: async (url) => {
      if (url.startsWith(SUPABASE)) throw new TypeError('Failed to fetch');
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  const notice = await submit(env);
  assert.equal(env.calls.length, 2, 'должно быть две попытки');
  assert.ok(env.calls[1].startsWith(VERCEL));
  assert.match(notice.textContent, /Готово/);
});

test('ответ 5xx — тоже повод перейти на второй адрес', async () => {
  const env = await load({
    fetch: async (url) => (url.startsWith(SUPABASE)
      ? new Response('boom', { status: 500 })
      : new Response('{"ok":true}', { status: 200 })),
  });
  const notice = await submit(env);
  assert.equal(env.calls.length, 2);
  assert.match(notice.textContent, /Готово/);
});

test('ответ 4xx не повторяется на втором адресе', async () => {
  const env = await load({ fetch: async () => new Response('{"error":"invalid_email"}', { status: 400 }) });
  const notice = await submit(env);
  assert.equal(env.calls.length, 1, 'осмысленный ответ сервера повторять незачем');
  assert.match(notice.textContent, /опечатка/);
});

test('рабочий адрес запоминается и идёт первым — но недолго', async () => {
  const remembered = JSON.stringify({ base: VERCEL, at: Date.now() });
  const env = await load({
    storage: { 'masortim-newsletter-base': remembered },
    fetch: async () => new Response('{"ok":true}', { status: 200 }),
  });
  await submit(env);
  assert.ok(env.calls[0].startsWith(VERCEL), 'свежий запомненный адрес идёт первым');
});

test('старый запомненный адрес не тормозит страницу', async () => {
  // Запасной адрес (*.vercel.app) у части провайдеров рвётся на TCP. Если
  // он остался первым навсегда, каждый визит начинается с мёртвого домена
  // и ожидания таймаута. Приоритет живёт пять минут.
  const stale = JSON.stringify({ base: VERCEL, at: Date.now() - 6 * 60 * 1000 });
  const env = await load({
    storage: { 'masortim-newsletter-base': stale },
    fetch: async () => new Response('{"ok":true}', { status: 200 }),
  });
  await submit(env);
  assert.ok(env.calls[0].startsWith(SUPABASE), 'порядок вернулся к конфигу');

  // Старый формат (просто строка) тоже больше не читается.
  const legacy = await load({
    storage: { 'masortim-newsletter-base': VERCEL },
    fetch: async () => new Response('{"ok":true}', { status: 200 }),
  });
  await submit(legacy);
  assert.ok(legacy.calls[0].startsWith(SUPABASE), 'старый формат игнорируется');
});

test('ссылка из письма ждёт нажатия и только потом действует', async () => {
  // Почтовый клиент может заранее загрузить адрес из письма, чтобы показать
  // превью. Если страница действует сразу, отписка срабатывает без человека,
  // и кнопка «Отписаться» потом натыкается на мёртвый токен — «ссылка
  // не подошла». Поэтому первый заход обязан только спросить.
  const env = await load({
    search: '?unsubscribe=TOKEN123&lang=ru',
    fetch: async () => new Response('{"result":"unsubscribed"}', { status: 200 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  const notice = env.parts['#newsletter-notice'];

  assert.deepEqual(env.calls, [], 'ни одного запроса до нажатия');
  assert.match(notice.textContent, /отписаться/i, 'страница спрашивает');

  const action = notice.children.find((child) => child.className === 'newsletter-notice-action');
  assert.ok(action, 'есть кнопка действия');
  assert.equal(action.textContent, 'Отписаться');

  action.listeners.click();
  await new Promise((done) => setTimeout(done, 50));

  assert.ok(env.calls.some((url) => url.endsWith('/api/newsletter/unsubscribe')), env.calls.join(', '));
  assert.match(notice.textContent, /отписаны/i);
  assert.equal(env.window.history._last, '/newsletter/', 'токен убран из адреса');
});

test('подтверждение подписки тоже требует нажатия', async () => {
  const env = await load({
    search: '?confirm=TOKEN123&lang=ru',
    fetch: async () => new Response('{"result":"confirmed"}', { status: 200 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  const notice = env.parts['#newsletter-notice'];

  assert.deepEqual(env.calls, [], 'предзагрузка ссылки ничего не подтверждает');
  assert.match(notice.textContent, /подтвердить подписку/i);

  const action = notice.children.find((child) => child.className === 'newsletter-notice-action');
  assert.ok(action);
  action.listeners.click();
  await new Promise((done) => setTimeout(done, 50));

  assert.ok(env.calls.some((url) => url.endsWith('/api/newsletter/confirm')));
  assert.match(notice.textContent, /подтверждена/i);
});

test('отказ оставляет подписку как есть и убирает токен', async () => {
  const env = await load({
    search: '?unsubscribe=TOKEN123&lang=ru',
    fetch: async () => new Response('{"result":"unsubscribed"}', { status: 200 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  const notice = env.parts['#newsletter-notice'];

  const cancel = notice.children.find((child) => child.className === 'newsletter-notice-cancel');
  assert.ok(cancel, 'есть кнопка отказа');
  cancel.listeners.click();
  await new Promise((done) => setTimeout(done, 50));

  assert.deepEqual(env.calls, [], 'отказ не ходит на сервер');
  assert.equal(env.window.history._last, '/newsletter/');
  assert.equal(notice.hidden, true, 'сообщение убрано');
});

test('устаревший токен — понятное сообщение, а не «нет связи»', async () => {
  const env = await load({
    search: '?confirm=OLD',
    fetch: async () => new Response('{"error":"not_found"}', { status: 404 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  const notice = env.parts['#newsletter-notice'];

  const action = notice.children.find((child) => child.className === 'newsletter-notice-action');
  action.listeners.click();
  await new Promise((done) => setTimeout(done, 50));

  assert.match(notice.textContent, /устарела/i);
});

test('адрес API в конфиге совпадает с развёрнутой функцией', async () => {
  const config = await readFile(resolve(HERE, '../config.js'), 'utf8');
  const bases = [...config.matchAll(/'(https:\/\/[^']+)'/g)].map((match) => match[1]);
  assert.ok(bases.length >= 2, 'должно быть два адреса на случай блокировки одного');
  assert.ok(bases.some((base) => base.includes('/functions/v1/')), 'один из адресов — Supabase Edge Function');
  // Слаг зарезервирован платформой: /newsletter отдаёт пустой ответ до нашего кода.
  for (const base of bases.filter((item) => item.includes('/functions/v1/'))) {
    assert.ok(!/\/functions\/v1\/newsletter$/.test(base), `${base}: слаг newsletter зарезервирован, нужен newsletter-api`);
  }
});

test('функция Supabase срезает только слаг, а не /functions/v1', async () => {
  // Ловушка, на которой всё сломалось: внутри функции путь приходит БЕЗ
  // /functions/v1 — платформа его срезает сама. Если отрезать полный
  // префикс, от пути остаётся мусор и роутер отвечает «not_found» на всё.
  const entry = await readFile(resolve(HERE, '../edge/supabase-entry.ts'), 'utf8');
  const match = /const PREFIX = '([^']+)'/.exec(entry);
  assert.ok(match, 'в входе должна быть константа PREFIX');
  assert.equal(match[1], '/newsletter-api', 'PREFIX — только слаг');

  // Повторяем выражение среза из входа и проверяем на реальных путях.
  const PREFIX = match[1];
  const strip = (pathname) => (pathname === PREFIX || pathname === `${PREFIX}/`
    ? '/'
    : pathname.startsWith(`${PREFIX}/`)
      ? pathname.slice(PREFIX.length)
      : pathname);

  assert.equal(strip('/newsletter-api/api/newsletter/health'), '/api/newsletter/health');
  assert.equal(strip('/newsletter-api/api/newsletter/subscribe'), '/api/newsletter/subscribe');
  assert.equal(strip('/newsletter-api'), '/');
  assert.equal(strip('/newsletter-api/'), '/');
});

test('в «Ссылках» на главной стоит YouTube с красной плашкой', async () => {
  // Блок «Ссылки» внизу главной — единственное место, где собраны внешние
  // профили. GitHub оттуда убран, его место занял канал на YouTube.
  const page = await readFile(resolve(HERE, '../..', 'index.html'), 'utf8');
  const css = await readFile(resolve(HERE, '../..', 'diary/projects.css'), 'utf8');

  const block = /<h2><span[^>]*>Ссылки<\/span>[\s\S]*?<\/section>/.exec(page);
  assert.ok(block, 'должен быть блок «Ссылки»');
  assert.ok(!/github\.com/.test(block[0]), 'GitHub из «Ссылок» убран');

  // Адрес канала в процентах: кириллица в href должна быть закодирована,
  // иначе часть браузеров и RSS-читалок портит адрес.
  const href = /href="(https:\/\/www\.youtube\.com\/@[^"]+)"/.exec(block[0]);
  assert.ok(href, 'ссылка на YouTube');
  const decoded = decodeURIComponent(href[1]);
  assert.match(decoded, /^https:\/\/www\.youtube\.com\/@\S+$/);
  assert.ok(!/%[0-9A-F]{2}/i.test(href[1].replace(/@[^/]*/, '')), 'адрес закодирован целиком');

  // Обе языковые версии ведут на один канал.
  assert.equal((block[0].match(/youtube\.com/g) ?? []).length, 2, 'RU и EN');

  // Плашка: класс есть в разметке и правило есть в стилях обеих тем.
  assert.equal((block[0].match(/social-icon-plate/g) ?? []).length, 2, 'класс на плашке в обеих версиях');
  assert.match(css, /\.social-icon \.social-icon-plate \{ fill: #e01b16/);
  assert.match(css, /body\.dark-theme \.social-icon \.social-icon-plate/);

  // Габариты совпадают с RSS и Email: тот же квадрат 24 × 24 и радиус 4.5.
  assert.match(block[0], /<rect class="social-icon-plate" width="24" height="24" rx="4\.5"/);
});

test('вход передачи Buffer использует настоящий node:buffer', async () => {
  // В Edge Runtime нет глобального Buffer, и подстановка Uint8Array вместо
  // него давала «97,108,99,…» вместо base64. Gmail отвечал «501 5.5.4»
  // на AUTH, и подписка падала с «нет связи».
  const entry = await readFile(resolve(HERE, '../edge/supabase-entry.ts'), 'utf8');

  assert.match(entry, /from 'node:buffer'/, 'Buffer нужно брать из node:buffer');
  assert.match(entry, /globalThis\.Buffer \?\? BufferImpl/, 'настоящий Buffer передаётся в бандл');
  assert.ok(
    !/new Uint8Array\(value\)/.test(entry),
    'Uint8Array вместо Buffer не кодирует base64',
  );

  // Проверяем поведение, а не только текст: именно так бандл кодирует
  // логин в SMTP и тело письма.
  const real = Buffer.from('alex.typeface@gmail.com', 'utf8').toString('base64');
  assert.equal(real, 'YWxleC50eXBlZmFjZUBnbWFpbC5jb20=');

  const fake = new TextEncoder().encode('alex.typeface@gmail.com').toString('base64');
  assert.notEqual(fake, real, 'у Uint8Array base64 не получается — это и роняло отправку');
});

test('сгенерированный код собирается с настоящими переводами строк', async () => {
  // Двойной бэкслеш в шаблоне давал литерал «\n» вместо перевода строки,
  // и весь бандл склеивался в одну строку — new Function падал на
  // комментарии в начале файла.
  const entry = await readFile(resolve(HERE, '../edge/supabase-entry.ts'), 'utf8');

  const polyfillMatch = /const polyfill = ('.*');/.exec(entry);
  assert.ok(polyfillMatch, 'должна быть строка полифилла');
  const polyfill = eval(polyfillMatch[1]);
  assert.ok(polyfill.includes('\n'), 'полифилл должен заканчиваться переводом строки');
  assert.match(polyfill, /BufferImpl/);

  const factory = new Function(
    'BufferImpl',
    `"use strict";\n${polyfill}const out = Buffer.from('hi', 'utf8').toString('base64');\nreturn out;`,
  );
  assert.equal(factory(Buffer), 'aGk=', 'new Function должен видеть Buffer и настоящий base64');
});

test('маршруты подтверждения и отписки принимают POST со страницы', async () => {
  // Письмо ведёт на сайт, сайт шлёт POST { token } и ждёт JSON, а маршруты
  // принимали только GET и отвечали редиректом. Из браузера это выглядело
  // как «Нет связи с сервером» — 405 на POST.
  for (const name of ['confirm', 'unsubscribe']) {
    const source = await readFile(resolve(HERE, '../..', `api/newsletter/${name}.mjs`), 'utf8');

    assert.match(source, /export async function POST/, `${name}: нужен POST-обработчик`);
    assert.match(source, /export async function OPTIONS/, `${name}: нужен preflight`);
    assert.match(source, /Access-Control-Allow-Origin/, `${name}: нужен CORS`);
    assert.match(source, /result: 'confirmed'|result: 'unsubscribed'/, `${name}: POST отвечает result`);
    // Сборка должна видеть эти экспорты, иначе маршрут вернёт 405 и на сайте.
  }

  // Собранный бандл тоже обязан содержать POST у обоих маршрутов.
  const bundle = await readFile(resolve(HERE, '../edge/index.mjs'), 'utf8');
  const posts = (bundle.match(/^async function POST\(request\)/gm) ?? []).length;
  assert.ok(posts >= 3, `в бандле должно быть не меньше трёх POST (подписка, подтверждение, отписка), найдено ${posts}`);

  const page = await readFile(resolve(HERE, '../newsletter.js'), 'utf8');
  assert.match(page, /method: 'POST'/);
  assert.match(page, /JSON\.stringify\(\{ token: token \}\)/);
});

test('вход переводит POST ссылок в GET, пока сайт не обновился', async () => {
  // Страница берёт бандл с сайта. Пока там старая версия, POST { token }
  // получает 405 и читатель видит «Нет связи с сервером».
  const entry = await readFile(resolve(HERE, '../edge/supabase-entry.ts'), 'utf8');

  assert.match(entry, /const POST_TO_GET = new Set\(\[/, 'должен быть список маршрутов');
  assert.match(entry, /'\/api\/newsletter\/confirm'/, 'подтверждение в списке');
  assert.match(entry, /'\/api\/newsletter\/unsubscribe'/, 'отписка в списке');
  assert.match(entry, /response\.status === 405/, 'слой включается только на 405');
});
