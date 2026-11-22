/**
 * GET /api/newsletter/unsubscribe?token=…
 *
 * Отписывает адрес и уводит читателя на страницу с результатом.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { unsubscribe } from '../../newsletter/lib/subscribers.mjs';

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
    outcome = await unsubscribe({ store, token });
  } catch (error) {
    console.error('unsubscribe failed', error);
    return redirect('/newsletter/?state=error&lang=ru');
  }

  if (outcome.result === 'not_found') return redirect('/newsletter/?state=invalid&lang=ru');
  const lang = outcome.subscriber?.lang === 'en' ? 'en' : 'ru';
  return redirect(`/newsletter/?state=unsubscribed&lang=${lang}`);
}
