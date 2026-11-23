/**
 * GET /api/newsletter/digest
 *
 * Еженедельный выпуск. Вызывается Vercel Cron (см. vercel.json) и вручную
 * с заголовком Authorization: Bearer ${CRON_SECRET}.
 *
 * Параметры:
 *   ?since=YYYY-MM-DD  — считать новые записи начиная с этой даты
 *   ?dry_run=1         — показать получателей и записи, ничего не отправляя
 *   ?test_to=адрес     — отправить настоящее письмо ровно этому адресу и
 *                        не запоминать выпуск. Нужен внешней проверке:
 *                        она видит реальную доставку, а живые подписчики
 *                        не получают лишних писем.
 *
 * Правила отправки живут в newsletter/lib/digest.mjs: раз в неделю, только
 * новые записи, повторный запуск молчит.
 */
import { createStore } from '../../newsletter/lib/store.mjs';
import { confirmedSubscribers, isValidEmail, normalizeEmail } from '../../newsletter/lib/subscribers.mjs';
import { digestEmail, send } from '../../newsletter/lib/email.mjs';
import { collectNotes } from '../../newsletter/lib/notes.mjs';
import { planDigest, DIGEST_REASONS } from '../../newsletter/lib/digest.mjs';

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

/** Письмо с записями выпуска на одном языке. */
function buildMessage({ email, lang, token, notes, test = false }) {
  const message = digestEmail({
    email,
    lang,
    token,
    notes: notes.map((n) => ({
      slug: n.slug,
      title: lang === 'en' ? n.titleEn : n.titleRu,
      dek: lang === 'en' ? n.dekEn : n.dekRu,
    })),
  });
  if (!test) return message;
  // Пробное письмо помечаем в теме: иначе человек примет его за настоящий
  // выпуск и решит, что рассылка сломалась или прислала старое.
  return { ...message, subject: `[проба] ${message.subject}` };
}

export async function GET(request) {
  if (!authorized(request)) return json(401, { error: 'unauthorized' });

  const url = new URL(request.url);
  const since = url.searchParams.get('since') ?? '';
  const dryRun = url.searchParams.get('dry_run') === '1';
  const testTo = normalizeEmail(url.searchParams.get('test_to') ?? '');
  if (testTo && !isValidEmail(testTo)) return json(400, { error: 'invalid_test_to' });

  let notes;
  try {
    notes = await collectNotes({ site: SITE });
  } catch (error) {
    console.error('digest: failed to load notes', error);
    return json(502, { error: 'notes_unavailable' });
  }

  // Явный ?since= перекрывает память: ручной запуск за нужный период.
  const dated = since ? notes.filter((n) => n.date >= since) : notes;

  const store = createStore();
  let state = { lastDigestAt: null, lastDigestIsoDate: null, lastNoteDate: null };
  let subscribers = [];
  try {
    if (typeof store.readState === 'function') state = await store.readState();
    // Для пробного прогона список живых подписчиков не нужен вовсе.
    if (!testTo) subscribers = await confirmedSubscribers(store);
  } catch (error) {
    console.error('digest: failed to read state', error);
    return json(500, { error: 'state_unavailable' });
  }

  const plan = planDigest({
    notes: dated,
    subscribers,
    state,
    now: new Date(),
    testTo,
    dryRun,
  });

  if (plan.action === 'none') {
    const reason = plan.reason ?? 'no_notes';
    return json(200, {
      ok: true,
      sent: 0,
      reason,
      message: DIGEST_REASONS[reason] ?? reason,
      lastNoteDate: plan.lastNoteDate ?? null,
      recipients: plan.recipients ?? 0,
    });
  }

  if (plan.action === 'week') {
    return json(200, {
      ok: true,
      sent: 0,
      reason: 'duplicate_week',
      message: DIGEST_REASONS.duplicate_week,
      lastDigestAt: plan.lastDigestAt,
    });
  }

  const summary = plan.notes.map((n) => ({ slug: n.slug, date: n.date, title: n.titleRu }));

  if (plan.action === 'dry') {
    return json(200, {
      ok: true,
      dryRun: true,
      notes: summary,
      recipients: plan.recipients.map((s) => ({ email: s.email, lang: s.lang })),
    });
  }

  let sent = 0;
  const failed = [];
  for (const subscriber of plan.recipients) {
    const lang = subscriber.lang === 'en' ? 'en' : 'ru';
    const message = buildMessage({
      email: subscriber.email,
      lang,
      token: subscriber.token,
      notes: plan.notes,
      test: plan.action === 'test',
    });
    const result = await send(message);
    if (result.ok) sent += 1;
    else failed.push({ email: subscriber.email, error: result.error });
  }

  for (const f of failed) console.error(`digest: ${f.email}: ${f.error}`);

  if (plan.action === 'test') {
    return json(sent ? 200 : 502, {
      ok: sent > 0,
      test: true,
      sent,
      failed: failed.length,
      notes: summary,
      sample: Boolean(plan.sample),
      reason: plan.sample ? 'no_new_notes' : undefined,
      message: plan.sample ? 'новых заметок нет — отправлена проба на последней записи' : undefined,
    });
  }

  // Состояние двигаем только после того, как выпуск действительно ушёл:
  // иначе неудачная отправка «съела» бы неделю и письма не было бы вовсе.
  let stateSaved = true;
  if (sent > 0 && plan.state) {
    try {
      await store.writeState(plan.state);
    } catch (error) {
      stateSaved = false;
      console.error('digest: failed to save state', error);
    }
  }

  return json(200, {
    ok: sent > 0,
    sent,
    failed: failed.length,
    notes: plan.notes.length,
    stateSaved,
  });
}
