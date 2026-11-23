/**
 * POST /api/newsletter/subscribe
 * Тело: { email, lang }
 *
 * Заводит подписку со статусом pending и отправляет письмо с подтверждением.
 * Ответ всегда одинаковый для нового и существующего адреса — так форма
 * не превращается в способ проверять, кто подписан.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { subscribe } from '../../newsletter/lib/subscribers.mjs';
import { confirmationEmail, send } from '../../newsletter/lib/email.mjs';

const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

const ALLOWED_ORIGIN = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/** Preflight: сайт на GitHub Pages и API на Vercel — разные домены. */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const store = createStore();
  let outcome;
  try {
    outcome = await subscribe({ store, email: body.email, lang: body.lang });
  } catch (error) {
    if (error.code === 'invalid_email') return json(400, { error: 'invalid_email' });
    console.error('subscribe failed', error);
    return json(500, { error: 'server_error' });
  }

  // Уже подтверждён — письма не будет, и страница должна сказать это прямо,
  // а не обещать «проверьте почту». Без этого повторная подписка всякий раз
  // уверяла, что письмо отправлено, хотя сервер молча ничего не слал.
  //
  // Флаг already не выдаёт лишнего: он значит лишь «этот адрес уже в списке
  // подтверждённых», а это и так видно по самому факту подписки.
  if (outcome.action === 'already') return json(200, { ok: true, already: true, sent: false });

  const message = confirmationEmail({
    email: outcome.subscriber.email,
    lang: outcome.subscriber.lang,
    token: outcome.subscriber.token,
  });
  const result = await send(message);
  if (!result.ok) {
    console.error('confirmation email failed', result.error);
    // upstream — код и имя ошибки транспорта без адресов. Он нужен, чтобы
    // отличить «пароль приложения неверен» от «адрес не принят сервером».
    return json(502, {
      error: 'email_failed',
      upstream: result.status ? `${result.status} ${result.name || 'unknown'}` : (result.name || 'no_request'),
    });
  }

  // resent — письмо уже отправлялось на этот адрес, но подтверждения не
  // было: шлём второе, с тем же токеном, чтобы работало и первое.
  const resent = outcome.action === 'resend';
  return json(200, { ok: true, sent: true, resent });
}

export function GET() {
  return json(405, { error: 'method_not_allowed', hint: `see ${SITE}/newsletter/` });
}
