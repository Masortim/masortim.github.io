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

/**
 * Проверка права отправки без отправки: тело без адреса Resend не примет,
 * но ключ к этому моменту уже проверен. 401 — ключ негоден или отозван,
 * любой другой ответ — ключ аутентифицировался.
 */
async function probeSending(key) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.status === 401 ? 'invalid' : 'ok';
  } catch (error) {
    // Сеть недоступна — судить о ключе нельзя, не блокируем.
    return 'unknown';
  }
}

/**
 * Самодиагностика: открывается в браузере, секретов не раскрывает —
 * только факт «задано / не задано» и адрес отправителя.
 */
async function health() {
  const env = (name) => (process.env[name] ?? '').trim();
  const key = env('RESEND_API_KEY');
  const from = env('NEWSLETTER_FROM');
  const sender = from || 'Masortim <digest@masortim.github.io>';
  const domain = (sender.match(/@([^>\s]+)/) ?? [])[1] ?? '';

  // resend.dev — общий домен Resend для проверки отправки. В списке доменов
  // аккаунта его нет и подтвердить его нельзя, но письма с него уходят (пока
  // только владельцу аккаунта). Поэтому для него проверка домена не нужна.
  const testSender = domain === 'resend.dev';

  let domains = { checked: false };
  if (key) {
    try {
      const response = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (response.ok) {
        const body = await response.json();
        const list = Array.isArray(body.data) ? body.data : [];
        const match = list.find((item) => item && item.name === domain);
        const sending = match?.capabilities?.sending ?? 'enabled';
        domains = {
          checked: true,
          keyValid: true,
          scope: 'full',
          account: list.map((item) => `${item.name} (${item.status})`),
          match: match ? match.status : null,
          verified: Boolean(match)
            && (match.status === 'verified'
              || (match.status === 'partially_verified' && sending === 'enabled')),
        };
      } else {
        const detail = await response.text().catch(() => '');
        // 401/403 означают, что ключ не принят; прочие коды — проблема на стороне Resend.
        const rejected = response.status === 401 || response.status === 403;
        // Ключ «Sending access» — как раз тот, что нужен рассылке, но список
        // доменов ему закрыт: Resend отвечает 401 restricted_api_key. Считать
        // такой ключ негодным нельзя, иначе готовность не наступит никогда.
        // Вместо этого проверяем право отправки отдельным запросом без письма.
        const restricted = rejected && /restricted_api_key|restricted to only send/i.test(detail);
        if (restricted) {
          const sending = await probeSending(key);
          domains = {
            checked: true,
            keyValid: sending !== 'invalid',
            scope: 'sending',
            verified: testSender ? true : null,
            match: testSender ? 'not_required' : 'unknown',
            error: sending === 'invalid' ? 'resend 401 (ключ отклонён и при отправке)' : null,
          };
        } else {
          domains = {
            checked: true,
            keyValid: !rejected,
            scope: null,
            verified: false,
            error: `resend ${response.status}${detail ? ` ${detail.slice(0, 120)}` : ''}`,
          };
        }
      }
    } catch (error) {
      domains = { checked: true, verified: false, error: 'network' };
    }
  }

  // Домен годится, если он подтверждён в Resend, это тестовый resend.dev,
  // или ключ ограничен отправкой и проверить домен физически нельзя —
  // тогда о непроверенном домене предупреждает note, а не блокировка.
  const senderUsable = testSender || domains.verified === true || domains.scope === 'sending';
  // Ключ считается рабочим, если Resend его не отверг (401/403).
  const keyUsable = Boolean(key) && domains.keyValid !== false;

  const checks = {
    supabaseUrl: Boolean(env('SUPABASE_URL')),
    supabaseKey: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
    resendKey: Boolean(key),
    resendKeyAccepted: domains.keyValid ?? null,
    resendKeyScope: domains.scope ?? null,
    fromSet: Boolean(from),
    fromAddress: from || `${sender} (значение по умолчанию)`,
    senderDomain: domain,
    senderMode: testSender ? 'test' : 'domain',
    fromDomainStatus: testSender
      ? 'not_required (общий домен resend.dev)'
      : domains.scope === 'sending'
        ? 'unknown (ключ ограничен отправкой)'
        : domains.match ?? null,
    fromDomainVerified: testSender ? true : domains.verified ?? null,
    resendDomains: domains.account ?? null,
    resendError: domains.error ?? null,
    apiBase: env('NEWSLETTER_API_BASE') || '(не задан)',
    site: env('NEWSLETTER_SITE') || '(не задан)',
    cronSecret: Boolean(env('CRON_SECRET')),
  };

  const ready = checks.supabaseUrl && checks.supabaseKey && keyUsable
    && checks.fromSet && senderUsable;

  return new Response(JSON.stringify({
    ready,
    // Что именно осталось сделать — короткими ключами, без лишних слов.
    blocking: [
      !checks.resendKey && 'добавьте RESEND_API_KEY в Vercel и перевыпустите деплой',
      checks.resendKey && domains.keyValid === false
        && `Resend отклонил ключ (${domains.error}) — выпустите новый в resend.com/api-keys`,
      !checks.supabaseUrl && 'нет SUPABASE_URL',
      !checks.supabaseKey && 'нет SUPABASE_SERVICE_ROLE_KEY',
      checks.resendKey && !checks.fromSet
        && 'задайте NEWSLETTER_FROM: адрес по умолчанию (digest@masortim.github.io) Resend отклонит',
      checks.resendKey && checks.fromSet && !testSender && domains.checked && domains.verified === false
        && (domains.error
          ? `не удалось проверить домен ${domain} в Resend (${domains.error})`
          : domains.match
            ? `домен ${domain} в Resend в статусе ${domains.match}, нужен verified`
            : `домена ${domain} нет в вашем аккаунте Resend`),
    ].filter(Boolean),
    // Не блокируют отправку, но о них надо знать заранее.
    notes: [
      testSender
        && 'тестовый режим: resend.dev доставляет письма только на адрес владельца аккаунта Resend',
      domains.scope === 'sending'
        && 'ключ ограничен правами отправки: список доменов ему закрыт (это норма), письма он отправляет',
      domains.scope === 'sending' && !testSender
        && `домен ${domain} проверить нельзя — Resend отклонит отправку с него, если он не подтверждён`,
      !testSender && !checks.fromSet
        && 'адрес по умолчанию digest@masortim.github.io принадлежит GitHub — Resend его отклонит',
    ].filter(Boolean),
    checks,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

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

  if (path === '/api/newsletter/health') return health();

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
