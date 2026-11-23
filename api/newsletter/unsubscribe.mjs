/**
 * GET  /api/newsletter/unsubscribe?token=…  — ссылка из письма: отписывает
 *      адрес и уводит читателя на страницу с результатом.
 * POST /api/newsletter/unsubscribe  { token } — тот же шаг со страницы:
 *      отвечаем JSON, сообщение показывает сама страница.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { unsubscribe } from '../../newsletter/lib/subscribers.mjs';

const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

function redirect(path) {
  return new Response(null, { status: 302, headers: { Location: `${SITE}${path}`, 'Cache-Control': 'no-store' } });
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': SITE,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/** Preflight: страница и API на разных доменах. */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': SITE,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Общий шаг отписки для GET и POST.
 * Возвращает { status, payload } — маршрут отдаёт его по-своему.
 */
async function runUnsubscribe(token) {
  if (!token) return { status: 400, payload: { error: 'not_found' } };

  const store = createStore();
  let outcome;
  try {
    outcome = await unsubscribe({ store, token });
  } catch (error) {
    console.error('unsubscribe failed', error);
    return { status: 500, payload: { error: 'server_error' } };
  }

  if (outcome.result === 'not_found') return { status: 404, payload: { error: 'not_found' } };

  // Строку убираем из базы: отписавшийся адрес не должен храниться.
  try {
    await store.remove(outcome.subscriber.email);
  } catch (error) {
    console.error('unsubscribe cleanup failed', error);
    return { status: 500, payload: { error: 'server_error' } };
  }

  const lang = outcome.subscriber?.lang === 'en' ? 'en' : 'ru';
  return { status: 200, payload: { result: 'unsubscribed', lang } };
}

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const { status, payload } = await runUnsubscribe(token);
  if (payload.error === 'not_found') return redirect('/newsletter/?state=invalid&lang=ru');
  if (status === 500) return redirect('/newsletter/?state=error&lang=ru');
  return redirect(`/newsletter/?state=${payload.result}&lang=${payload.lang}`);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const { status, payload } = await runUnsubscribe(String(body?.token ?? ''));
  return json(status, payload);
}
