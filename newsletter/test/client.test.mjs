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
    addEventListener(type, handler) { this.listeners[type] = handler; },
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

test('рабочий адрес запоминается и идёт первым', async () => {
  const env = await load({
    storage: { 'masortim-newsletter-base': VERCEL },
    fetch: async () => new Response('{"ok":true}', { status: 200 }),
  });
  await submit(env);
  assert.ok(env.calls[0].startsWith(VERCEL), 'запомненный адрес должен быть первым');
});

test('ссылка подтверждения из письма обрабатывается страницей', async () => {
  const env = await load({
    search: '?confirm=TOKEN123&lang=ru',
    fetch: async () => new Response('{"result":"confirmed"}', { status: 200 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  const notice = env.parts['#newsletter-notice'];
  assert.ok(env.calls.some((url) => url.endsWith('/api/newsletter/confirm')), env.calls.join(', '));
  assert.match(notice.textContent, /подтверждена/i);
  // Токен убираем из адреса: обновление страницы не должно подтверждать снова.
  assert.equal(env.window.history._last, '/newsletter/');
});

test('ссылка отписки из письма обрабатывается страницей', async () => {
  const env = await load({
    search: '?unsubscribe=TOKEN123&lang=ru',
    fetch: async () => new Response('{"result":"unsubscribed"}', { status: 200 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  assert.ok(env.calls.some((url) => url.endsWith('/api/newsletter/unsubscribe')));
  assert.match(env.parts['#newsletter-notice'].textContent, /отписаны/i);
});

test('устаревший токен — понятное сообщение, а не «нет связи»', async () => {
  const env = await load({
    search: '?confirm=OLD',
    fetch: async () => new Response('{"error":"not_found"}', { status: 404 }),
  });
  await new Promise((done) => setTimeout(done, 50));
  assert.match(env.parts['#newsletter-notice'].textContent, /устарела/i);
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
