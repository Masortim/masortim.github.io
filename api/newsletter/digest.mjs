/**
 * GET /api/newsletter/digest
 *
 * Еженедельный выпуск. Вызывается Vercel Cron (см. vercel.json) и вручную
 * с заголовком Authorization: Bearer ${CRON_SECRET}.
 *
 * Параметры:
 *   ?since=YYYY-MM-DD  — отправлять записи начиная с даты (по умолчанию три последние)
 *   ?dry_run=1         — показать получателей, ничего не отправляя
 *
 * Записи берутся с сайта (те же страницы diary/<slug>/index.html, что и у RSS),
 * поэтому новый каталог заметки попадает в выпуск автоматически.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { confirmedSubscribers } from '../../newsletter/lib/subscribers.mjs';
import { digestEmail, send } from '../../newsletter/lib/email.mjs';
import { collectNotes } from '../../newsletter/lib/notes.mjs';

const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function authorized(request) {
  const secret = process.env.CRON_SECRET ?? '';
  // Если секрет не настроен, эндпоинт закрыт: рассылка не должна быть
  // доступна всем желающим, даже в режиме dry-run.
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) return json(401, { error: 'unauthorized' });

  const url = new URL(request.url);
  const since = url.searchParams.get('since') ?? '';
  const dryRun = url.searchParams.get('dry_run') === '1';

  let notes;
  try {
    notes = await collectNotes({ site: SITE });
  } catch (error) {
    console.error('digest: failed to load notes', error);
    return json(502, { error: 'notes_unavailable' });
  }

  const fresh = since ? notes.filter((n) => n.date >= since) : notes.slice(0, 3);
  if (!fresh.length) return json(200, { ok: true, sent: 0, reason: 'no_notes' });

  const store = createStore();
  const subscribers = await confirmedSubscribers(store);

  if (dryRun) {
    return json(200, {
      ok: true,
      dryRun: true,
      notes: fresh.map((n) => ({ slug: n.slug, date: n.date, title: n.titleRu })),
      recipients: subscribers.map((s) => ({ email: s.email, lang: s.lang })),
    });
  }

  let sent = 0;
  const failed = [];
  for (const subscriber of subscribers) {
    const lang = subscriber.lang === 'en' ? 'en' : 'ru';
    const message = digestEmail({
      email: subscriber.email,
      lang,
      token: subscriber.token,
      notes: fresh.map((n) => ({
        slug: n.slug,
        title: lang === 'en' ? n.titleEn : n.titleRu,
        dek: lang === 'en' ? n.dekEn : n.dekRu,
      })),
    });
    const result = await send(message);
    if (result.ok) sent += 1;
    else failed.push({ email: subscriber.email, error: result.error });
  }

  for (const f of failed) console.error(`digest: ${f.email}: ${f.error}`);
  return json(200, { ok: true, sent, failed: failed.length, notes: fresh.length });
}
