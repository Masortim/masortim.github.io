/**
 * GET  /api/newsletter/confirm?token=…  — ссылка из письма: подтверждает
 *      подписку и уводит читателя на страницу с результатом.
 * POST /api/newsletter/confirm  { token } — тот же шаг, но со страницы:
 *      она сама показывает сообщение, поэтому отвечаем JSON, без редиректа.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { confirm } from '../../newsletter/lib/subscribers.mjs';
import { send, welcomeEmail } from '../../newsletter/lib/email.mjs';

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
 * Общий шаг подтверждения для GET и POST.
 * Возвращает { status, payload } — его и отдаёт каждый маршрут по-своему.
 */
async function runConfirm(token) {
  if (!token) return { status: 400, payload: { error: 'not_found' } };

  const store = createStore();
  let outcome;
  try {
    outcome = await confirm({ store, token });
  } catch (error) {
    console.error('confirm failed', error);
    return { status: 500, payload: { error: 'server_error' } };
  }

  if (outcome.result === 'not_found') return { status: 404, payload: { error: 'not_found' } };

  const lang = outcome.subscriber?.lang === 'en' ? 'en' : 'ru';
  if (outcome.result === 'confirmed') {
    const result = await send(welcomeEmail({ email: outcome.subscriber.email, lang, token }));
    if (!result.ok) console.error('welcome email failed', result.error);
    return { status: 200, payload: { result: 'confirmed', lang } };
  }
  return { status: 200, payload: { result: 'already', lang } };
}

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const { status, payload } = await runConfirm(token);
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
  const { status, payload } = await runConfirm(String(body?.token ?? ''));
  return json(status, payload);
}
