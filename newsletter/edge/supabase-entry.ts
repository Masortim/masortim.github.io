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
 * работает: бандл приходит целиком, 66 627 байт. Поэтому код скачивается
 * как текст и выполняется через new Function.
 *
 * Ещё одно отличие среды: Buffer в Supabase не определён. В бандле он нужен
 * только в ветке для Node (склейка тела запроса и ответа Vercel), которая
 * здесь не выполняется, но имя должно существовать — подставляем замену
 * на Uint8Array.
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
 * Кеш на минуту: изолят переиспользуется, и разбирать 66 КБ на каждый
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

  // Uint8Array вместо Buffer: в Edge Runtime Buffer не определён.
  const polyfill = 'const Buffer = globalThis.Buffer ?? { from: (value) => (typeof value === \'string\' ? new TextEncoder().encode(value) : new Uint8Array(value)) };\n';

  const factory = new Function(
    'netConnect', 'tlsConnect', 'randomBytes', 'process',
    `"use strict";\n${polyfill}${body}\nreturn { default: handler };`,
  );
  const module = factory(netConnect, tlsConnect, randomBytes, globalThis.process);
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
