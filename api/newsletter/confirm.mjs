/**
 * GET /api/newsletter/confirm?token=…
 *
 * Подтверждает подписку и уводит читателя на страницу с результатом.
 * Страница сама показывает нужный язык по ?lang=.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { confirm } from '../../newsletter/lib/subscribers.mjs';
import { send, welcomeEmail } from '../../newsletter/lib/email.mjs';

const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

function redirect(path) {
  return new Response(null, { status: 302, headers: { Location: `${SITE}${path}`, 'Cache-Control': 'no-store' } });
}

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  if (!token) return redirect('/newsletter/?state=invalid&lang=ru');

  const store = createStore();
  let outcome;
  try {
    outcome = await confirm({ store, token });
  } catch (error) {
    console.error('confirm failed', error);
    return redirect('/newsletter/?state=error&lang=ru');
  }

  if (outcome.result === 'not_found') return redirect('/newsletter/?state=invalid&lang=ru');

  const lang = outcome.subscriber?.lang === 'en' ? 'en' : 'ru';
  if (outcome.result === 'confirmed') {
    const result = await send(welcomeEmail({ email: outcome.subscriber.email, lang, token }));
    if (!result.ok) console.error('welcome email failed', result.error);
    return redirect(`/newsletter/?state=confirmed&lang=${lang}`);
  }
  return redirect(`/newsletter/?state=already&lang=${lang}`);
}
