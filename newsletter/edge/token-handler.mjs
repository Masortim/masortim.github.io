/**
 * GET /api/newsletter/token?email=…
 *
 * Служебный эндпоинт для внешней проверки цикла. По адресу возвращает
 * текущий токен подтверждения — тот самый, что ушёл в письме.
 *
 * Зачем: автоматическая проба проходит весь цикл (подписка → письмо →
 * подтверждение → отписка). Иначе токен пришлось бы искать прямо в базе,
 * а ключ service_role в секреты репозитория записать нельзя. Здесь токен
 * выдаётся по адресу — знать его не сложнее, чем уже знать сам адрес.
 *
 * Защита: закрыт CRON_SECRET. Без заголовка Authorization с этим секретом
 * эндпоинт отвечает 401 и ничего не раскрывает, из браузера читателя он
 * недоступен. Если секрет не задан, эндпоинт выключен целиком.
 */
function tokenJson(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request) {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  const given = request.headers.get('authorization') ?? '';
  if (!secret || given !== `Bearer ${secret}`) return tokenJson(401, { error: 'unauthorized' });

  const url = new URL(request.url);
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return tokenJson(400, { error: 'email_required' });

  const store = createStore();
  let data;
  try {
    data = await store.read();
  } catch (error) {
    console.error('token lookup failed', error);
    return tokenJson(500, { error: 'server_error' });
  }

  const subscriber = (data?.subscribers ?? []).find((s) => s.email === email);
  if (!subscriber) return tokenJson(404, { error: 'not_subscribed' });
  return tokenJson(200, { token: subscriber.token, status: subscriber.status });
}
