/**
 * Маршрутизация единой функции.
 *
 * Подключается бандлером (newsletter/scripts/bundle.mjs) в конец файла,
 * где уже объявлены обработчики: subscribeApi, confirmApi, unsubscribeApi,
 * digestApi. Каждый из них — обычный модуль с экспортами POST/GET/OPTIONS.
 */
const ROUTES = {
  '/api/newsletter/subscribe': subscribeApi,
  '/api/newsletter/confirm': confirmApi,
  '/api/newsletter/unsubscribe': unsubscribeApi,
  '/api/newsletter/digest': digestApi,
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Обработчик совместим с двумя способами вызова, которые использует Vercel:
 *   • Web-стиль (Next.js App Router, Edge): приходит Request, ждём Response.
 *   • Node-стиль (framework: node): приходят (req, res), ответ пишется в res.
 *
 * Режим определяется по аргументам, а не по настройкам: если второго
 * аргумента нет, это Web-запрос. Так функция не зависит от того, как именно
 * платформа её собрала.
 */
export default async function handler(request, response) {
  const isNodeStyle = response && typeof response.end === 'function';

  if (isNodeStyle) {
    const response2 = await handle(await toWebRequest(request));
    await sendNodeResponse(response, response2);
    return;
  }

  return handle(request);
}

/** Node IncomingMessage → Web Request. */
async function toWebRequest(req) {
  const host = req.headers.host ?? 'localhost';
  const url = `https://${host}${req.url}`;
  const method = (req.method ?? 'GET').toUpperCase();

  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  return new Request(url, { method, headers: req.headers, body });
}

/** Web Response → Node ServerResponse. */
async function sendNodeResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => res.setHeader(key, value));
  const buffer = Buffer.from(await webResponse.arrayBuffer());
  res.end(buffer.length ? buffer : undefined);
}

async function handle(request) {
  const url = new URL(request.url);
  // Завершающий слэш не должен влиять на выбор маршрута.
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/api') {
    return jsonResponse(200, { name: 'masortim-newsletter', endpoints: Object.keys(ROUTES) });
  }

  const route = ROUTES[path];
  if (!route) return jsonResponse(404, { error: 'not_found', path });

  const method = request.method.toUpperCase();
  const action = route[method] ?? route[method === 'HEAD' ? 'GET' : method];
  if (typeof action !== 'function') {
    const allowed = ['GET', 'POST', 'OPTIONS'].filter((name) => typeof route[name] === 'function');
    return new Response(JSON.stringify({ error: 'method_not_allowed', allowed }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Allow: allowed.join(', '),
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    return await action(request);
  } catch (error) {
    console.error(`route ${path} failed`, error);
    return jsonResponse(500, { error: 'server_error' });
  }
}
