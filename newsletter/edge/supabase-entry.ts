/**
 * Функция рассылки для Supabase Edge Functions.
 *
 * Сам бэкенд лежит не здесь: он собран в один файл newsletter/edge/index.mjs
 * (npm run build в newsletter/) и публикуется вместе с сайтом как
 * /newsletter/bundle.js. Эта функция его скачивает и выполняет.
 *
 * Почему не обычный import по адресу: Supabase не загружает внешние
 * ES-модули вообще — ни с сайта, ни с esm.sh, ответ всегда «Module not
 * found» (проверено запросами к живой функции). А обычный fetch из функции
 * работает: бандл приходит целиком. Поэтому код скачивается
 * как текст и выполняется через new Function.
 *
 * Ещё одно отличие среды: глобального Buffer в Supabase нет, но модуль
 * node:buffer есть и работает по-настоящему (проверено: base64 туда и
 * обратно). Подставлять вместо него Uint8Array нельзя: код зовёт
 * Buffer.from(value, 'utf8').toString('base64'), а Uint8Array аргумент
 * игнорирует и возвращает «97,108,99,…». Из-за этого в письме и в
 * AUTH LOGIN оказывался мусор, и Gmail отвечал «501 5.5.4».
 *
 * Обновление бэкенда: пересобрать (npm run build), закоммитить — следующий
 * запуск функции возьмёт свежий бандл. Кеш здесь на минуту, чтобы не
 * скачивать файл на каждый запрос.
 *
 * Адрес: /functions/v1/newsletter-api/api/newsletter/…
 *
 * Слаг — newsletter-api, а не newsletter: короткое имя платформа отдаёт
 * шаблонам функций Supabase, и запрос к нему возвращает пустой ответ ещё
 * до нашего кода.
 */

import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { Buffer as NodeBuffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

/**
 * Так путь выглядит внутри функции: /functions/v1 платформа срезает сама.
 * Проверено: /functions/v1/newsletter-api/api/newsletter/health приходит
 * сюда как /newsletter-api/api/newsletter/health.
 */
const PREFIX = '/newsletter-api';

const SITE = (Deno.env.get('NEWSLETTER_SITE') ?? 'https://masortim.github.io').replace(/\/$/, '');
const BUNDLE_URL = `${SITE}/newsletter/bundle.js`;

/** Сколько держим разобранный модуль в памяти изолята. */
const CACHE_MS = 60_000;
let cached = { handler: null, at: 0 };

/**
 * Скачивает бандл и превращает его в функцию-обработчик.
 *
 * Кеш на минуту: изолят переиспользуется, и разбирать 70 КБ на каждый
 * запрос незачем. Правка бэкенда подхватывается сама, без перевыпуска
 * функции.
 */
async function loadHandler() {
  if (cached.handler && Date.now() - cached.at < CACHE_MS) return cached.handler;

  const response = await fetch(BUNDLE_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`бандл: ${response.status} ${BUNDLE_URL}`);
  const source = await response.text();

  // Снимаем импорты платформы (модули уже переданы аргументами) и
  // единственный export default — тело становится обычным скриптом.
  const body = source
    .replace(/^import\s+\{[^}]*\}\s+from\s+'node:[^']+';?[ \t]*$/gm, '')
    .replace(/^export\s+default\s+async\s+function\s+handler/m, 'async function handler');

  if (/^import\s/m.test(body)) throw new Error('в бандле остался import');

  // Настоящий Buffer из node:buffer. Подделка на Uint8Array ломала base64.
  // Перевод строки обязателен: без него комментарий в начале бандла
  // съедает весь код до конца файла.
  const polyfill = 'const Buffer = globalThis.Buffer ?? BufferImpl;\n';

  const factory = new Function(
    'netConnect', 'tlsConnect', 'randomBytes', 'process', 'BufferImpl',
    `"use strict";\n${polyfill}${body}\nreturn { default: handler };`,
  );
  const module = factory(netConnect, tlsConnect, randomBytes, globalThis.process, NodeBuffer);
  cached = { handler: module.default, at: Date.now() };
  return module.default;
}

/** Разрешения для браузера: пускаем только сайт. */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': SITE,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Маршруты, где страница шлёт POST { token }, а старый бандл на сайте
 * понимает только GET. Обёртка переводит запрос в GET и возвращает JSON.
 *
 * Зачем это здесь: страница берёт бандл с сайта, и до публикации новой
 * версии POST отвечает 405 — из браузера это выглядит как «нет связи».
 * Слой включается только при 405, поэтому после обновления сайта он
 * просто перестаёт срабатывать и ничего не ломает.
 */
const POST_TO_GET = new Set(['/api/newsletter/confirm', '/api/newsletter/unsubscribe']);

/** Достаёт state и lang из адреса, куда бандл уводит читателя. */
function stateFromRedirect(location) {
  const state = (String(location ?? '').match(/[?&]state=([a-z]+)/) ?? [])[1] ?? '';
  const lang = (String(location ?? '').match(/[?&]lang=([a-z]+)/) ?? [])[1] ?? 'ru';
  return { state, lang };
}

/** JSON-ответ: браузер читает тело, а не переход. */
function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Перевод POST { token } в GET ?token=… для старого бандла.
 * Возвращает готовый ответ для страницы.
 */
async function postAsGet(handler, path, body) {
  let token = '';
  try {
    const text = new TextDecoder().decode(body ?? new ArrayBuffer(0));
    token = String(JSON.parse(text)?.token ?? '');
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }
  if (!token) return jsonResponse(404, { error: 'not_found' });

  const response = await handler(new Request(
    new URL(`${path}?token=${encodeURIComponent(token)}`, SITE),
    { method: 'GET' },
  ));
  const { state, lang } = stateFromRedirect(response.headers.get('location'));

  if (state === 'invalid') return jsonResponse(404, { error: 'not_found' });
  if (state === 'error') return jsonResponse(500, { error: 'server_error' });
  if (state === 'confirmed' || state === 'already' || state === 'unsubscribed') {
    return jsonResponse(200, { result: state, lang });
  }
  return jsonResponse(500, { error: 'server_error' });
}

Deno.serve(async (request) => {
  // Preflight: маршрутизатор Supabase OPTIONS не обрабатывает, а POST с сайта
  // на другой домен всегда предваряется таким запросом.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  // Роутер в бандле ищет маршруты от корня, поэтому слаг отрезаем.
  const rest = url.pathname === PREFIX || url.pathname === `${PREFIX}/`
    ? '/'
    : url.pathname.startsWith(`${PREFIX}/`)
      ? url.pathname.slice(PREFIX.length)
      : url.pathname;

  // Тело читаем целиком: исходный Request нельзя пересобрать с тем же потоком.
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  const target = new URL(rest + url.search, SITE);

  let response;
  try {
    const handler = await loadHandler();
    response = await handler(new Request(target, {
      method: request.method,
      headers: request.headers,
      body,
    }));

    // Старый бандл на сайте не знает POST для ссылок из письма: страница
    // шлёт { token } и получает 405 — то есть «нет связи». Переводим такой
    // запрос в GET, пока сайт не обновился.
    if (response.status === 405 && request.method === 'POST' && POST_TO_GET.has(rest)) {
      response = await postAsGet(handler, rest, body);
    }
  } catch (error) {
    // Причину показываем текстом: иначе браузер напишет «нет связи» и
    // виновник потеряется.
    console.error('newsletter-api failed', error);
    response = new Response(JSON.stringify({
      error: 'server_error',
      detail: String(error?.message ?? error).slice(0, 240),
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }

  // CORS на любой ответ, включая ошибки.
  const headers = new Headers(response.headers);
  const extra = corsHeaders();
  for (const name of Object.keys(extra)) headers.set(name, extra[name]);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
