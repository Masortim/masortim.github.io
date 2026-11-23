/**
 * Функция рассылки для Supabase Edge Functions.
 *
 * Сам бэкенд — не здесь: он собран в один файл newsletter/edge/index.mjs
 * (npm run build в newsletter/) и публикуется вместе с сайтом как
 * /newsletter/bundle.js. Эта обёртка его импортирует.
 *
 * Почему через импорт, а не копией в теле функции: у Supabase нет загрузки
 * файлов для Edge Functions — платформа принимает функцию одним текстом, а
 * бэкенд занимает почти 70 КБ. Через публичный адрес кода бандл обновляется
 * вместе с сайтом: пересобрал → закоммитил → следующий запуск функции уже
 * на новом коде. Внешний вид и логика писем правятся в одном месте — в
 * newsletter/, — и не расходятся между Vercel и Supabase.
 *
 * Бандл — обычный ES-модуль: только node-встроенные импорты, без npm.
 * Supabase выполняет его в Deno, где node:net, node:tls и node:crypto есть.
 * Проверено пробным запросом: TLS-соединение с smtp.gmail.com:465 из Edge
 * Runtime открывается, значит письма уходят тем же SMTP-клиентом.
 *
 * Адрес: /functions/v1/newsletter-api/api/newsletter/…
 *
 * Слаг — newsletter-api, а не newsletter: короткое имя платформа отдаёт
 * шаблонам функций Supabase, и запрос к нему возвращает пустой ответ ещё
 * до нашего кода (проверено: та же функция под другим слагом отвечает).
 */

import handler from 'https://masortim.github.io/newsletter/bundle.js';

/** Префикс, под которым Supabase открывает функцию. */
const PREFIX = '/functions/v1/newsletter-api';

const SITE = (Deno.env.get('NEWSLETTER_SITE') ?? 'https://masortim.github.io').replace(/\/$/, '');

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
  // Preflight: маршрутизатор Supabase его не обрабатывает, а POST с сайта
  // на другой домен всегда предваряется таким запросом.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  // Supabase передаёт полный путь вместе с префиксом: /functions/v1/newsletter/api/…
  // Роутер в бандле ищет маршруты от корня, поэтому префикс отрезаем.
  const rest = url.pathname.startsWith(PREFIX)
    ? url.pathname.slice(PREFIX.length) || '/'
    : url.pathname;
  const target = new URL(rest + url.search, SITE);

  // Тело читаем целиком: исходный Request нельзя пересобрать с тем же потоком.
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  const response = await handler(new Request(target, {
    method: request.method,
    headers: request.headers,
    body,
  }));

  // CORS на любой ответ, включая ошибки: иначе браузер покажет «нет связи»
  // вместо настоящей причины.
  const headers = new Headers(response.headers);
  const extra = corsHeaders();
  for (const name of Object.keys(extra)) headers.set(name, extra[name]);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
