/**
 * Сгенерировано newsletter/scripts/bundle.mjs — не редактировать вручную.
 *
 * Единая функция Vercel: маршрутизация и все обработчики в одном файле.
 * Исходники: api/newsletter/*.mjs и newsletter/lib/*.mjs.
 *
 * Адреса:
 *   POST /api/newsletter/subscribe   { email, lang }
 *   GET  /api/newsletter/confirm     ?token=
 *   GET  /api/newsletter/unsubscribe ?token=
 *   GET  /api/newsletter/digest      Authorization: Bearer CRON_SECRET
 */
import { randomBytes } from 'node:crypto';

// ─── newsletter/lib/store.mjs ───
const __store = (() => {
/**
 * Хранилище подписчиков в Supabase (таблица public.newsletter_subscribers).
 *
 * Почему Supabase, а не файл в GitHub: каждая подписка — это строка в таблице,
 * а не коммит. Нет гонок за файл, нет истории из тысяч коммитов, и всё видно
 * в SQL-редакторе проекта.
 *
 * Таблица закрыта RLS: политик нет, доступ только у service_role. Поэтому
 * ключ живёт исключительно в переменных окружения серверных функций и
 * никогда не попадает в браузер.
 *
 * Если переменные не заданы (локальный запуск, тесты), используется память
 * процесса: сценарии отрабатывают, но между запросами ничего не сохраняется.
 */

const TABLE = 'newsletter_subscribers';

function createStore(options = {}) {
  const url = options.url ?? process.env.SUPABASE_URL ?? '';
  const key = options.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !key) return createMemoryStore();
  return createSupabaseStore({ url: url.replace(/\/$/, ''), key });
}

/** Память процесса: локальная разработка и тесты. */
function createMemoryStore() {
  let data = { version: 1, subscribers: [] };
  return {
    kind: 'memory',
    async read() {
      return JSON.parse(JSON.stringify(data));
    },
    async write(next) {
      data = JSON.parse(JSON.stringify(next));
      return true;
    },
  };
}

/**
 * Supabase через PostgREST. Интерфейс намеренно повторяет файловое хранилище
 * (read/write одной структуры), чтобы логика в subscribers.mjs не знала,
 * где именно лежат данные.
 *
 * read() отдаёт { version, subscribers } в том же формате, что и раньше;
 * write() применяет разницу: новые записи добавляет, изменённые обновляет.
 */
function createSupabaseStore({ url, key }) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  function toSubscriber(row) {
    return {
      email: row.email,
      lang: row.lang,
      status: row.status,
      token: row.token,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at ?? undefined,
      unsubscribedAt: row.unsubscribed_at ?? undefined,
    };
  }

  function toRow(subscriber) {
    return {
      email: subscriber.email,
      lang: subscriber.lang ?? 'ru',
      status: subscriber.status ?? 'pending',
      token: subscriber.token,
      confirmed_at: subscriber.confirmedAt ?? null,
      unsubscribed_at: subscriber.unsubscribedAt ?? null,
    };
  }

  async function request(path, init = {}) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`supabase ${init.method ?? 'GET'} ${path} failed: ${response.status} ${detail.slice(0, 200)}`);
    }
    return response;
  }

  let snapshot = new Map();

  return {
    kind: 'supabase',

    async read() {
      const response = await request(`${TABLE}?select=*&order=created_at.asc`);
      const rows = await response.json();
      snapshot = new Map(rows.map((row) => [row.email, row]));
      return { version: 1, subscribers: rows.map(toSubscriber) };
    },

    /**
     * Синхронизирует таблицу с переданным состоянием: обновляет существующие
     * строки и добавляет отсутствующие. Удаления не поддерживаются — история
     * подписок остаётся в таблице (статус unsubscribed), это осознанно.
     */
    async write(next) {
      const subscribers = Array.isArray(next?.subscribers) ? next.subscribers : [];
      for (const subscriber of subscribers) {
        const row = toRow(subscriber);
        // email — первичный ключ дедупликации; upsert по нему.
        await request(`${TABLE}?on_conflict=email`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([row]),
        });
      }
      return true;
    },
  };
}

return { createStore };
})();

// ─── newsletter/lib/subscribers.mjs ───
const __subscribers = (() => {
/**
 * Логика списка подписчиков: подписка, подтверждение, отписка.
 *
 * Всё, что не зависит от HTTP, живёт здесь, чтобы API-функции оставались
 * тонкими, а сценарии можно было прогнать тестами без сети.
 */



const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email);
}

function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'ru';
}

function newToken() {
  return randomBytes(24).toString('base64url');
}

function emptyData() {
  return { version: 1, subscribers: [] };
}

/**
 * Подписка. Возвращает одно из:
 *   { action: 'confirm', subscriber } — новый адрес, нужно письмо с подтверждением;
 *   { action: 'resend', subscriber }  — адрес есть, но не подтверждён, письмо повторяем;
 *   { action: 'already', subscriber } — уже подтверждён, ничего не отправляем;
 *   { action: 'reactivate', subscriber } — был отписан, снова подписался.
 */
async function subscribe({ store, email, lang, now = new Date() }) {
  const address = normalizeEmail(email);
  if (!isValidEmail(address)) {
    const error = new Error('invalid_email');
    error.code = 'invalid_email';
    throw error;
  }

  const data = (await store.read()) ?? emptyData();
  if (!Array.isArray(data.subscribers)) data.subscribers = [];

  const existing = data.subscribers.find((s) => s.email === address);

  if (!existing) {
    const subscriber = {
      email: address,
      lang: normalizeLanguage(lang),
      status: 'pending',
      token: newToken(),
      createdAt: now.toISOString(),
    };
    data.subscribers.push(subscriber);
    await store.write(data);
    return { action: 'confirm', subscriber };
  }

  // Язык обновляем: читатель мог переключиться на сайте.
  existing.lang = normalizeLanguage(lang);

  if (existing.status === 'confirmed') {
    await store.write(data);
    return { action: 'already', subscriber: existing };
  }

  if (existing.status === 'unsubscribed') {
    existing.status = 'pending';
    existing.token = newToken();
    existing.unsubscribedAt = null;
    await store.write(data);
    return { action: 'reactivate', subscriber: existing };
  }

  // pending: могли не дойти или потерять письмо — отправляем снова,
  // но токен оставляем прежним, чтобы старое письмо тоже работало.
  if (!existing.token) existing.token = newToken();
  await store.write(data);
  return { action: 'resend', subscriber: existing };
}

/**
 * Подтверждение по токену.
 *   { result: 'confirmed', subscriber } | { result: 'already' } | { result: 'not_found' }
 */
async function confirm({ store, token, now = new Date() }) {
  const data = (await store.read()) ?? emptyData();
  const subscriber = (data.subscribers ?? []).find((s) => s.token === token);
  if (!subscriber) return { result: 'not_found' };

  if (subscriber.status === 'confirmed') {
    return { result: 'already', subscriber };
  }

  subscriber.status = 'confirmed';
  subscriber.confirmedAt = now.toISOString();
  await store.write(data);
  return { result: 'confirmed', subscriber };
}

/**
 * Отписка по токену.
 *   { result: 'unsubscribed', subscriber } | { result: 'already' } | { result: 'not_found' }
 */
async function unsubscribe({ store, token, now = new Date() }) {
  const data = (await store.read()) ?? emptyData();
  const subscriber = (data.subscribers ?? []).find((s) => s.token === token);
  if (!subscriber) return { result: 'not_found' };

  if (subscriber.status === 'unsubscribed') {
    return { result: 'already', subscriber };
  }

  subscriber.status = 'unsubscribed';
  subscriber.unsubscribedAt = now.toISOString();
  await store.write(data);
  return { result: 'unsubscribed', subscriber };
}

/** Подтверждённые подписчики — единственные, кому уходит выпуск. */
async function confirmedSubscribers(store) {
  const data = (await store.read()) ?? emptyData();
  return (data.subscribers ?? []).filter((s) => s.status === 'confirmed');
}

function memoryStore(initial) {
  let data = initial ?? emptyData();
  return {
    kind: 'memory',
    async read() { return JSON.parse(JSON.stringify(data)); },
    async write(next) { data = JSON.parse(JSON.stringify(next)); return true; },
  };
}

return { normalizeEmail, isValidEmail, normalizeLanguage, newToken, subscribe, confirm, unsubscribe, confirmedSubscribers, memoryStore };
})();

// ─── newsletter/lib/email.mjs ───
const __email = (() => {
/**
 * Тексты писем (двуязычные) и их отправка через Resend.
 *
 * Письма намеренно простые: один столбец, системный шрифт, без картинок.
 * Так они не ломаются в почтовых клиентах и выглядят как текст дневника.
 */

const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

/**
 * Адрес серверных функций. Сайт на GitHub Pages, функции на Vercel, поэтому
 * ссылки подтверждения и отписки должны вести на Vercel, а не на SITE.
 * Если переменная не задана (локальный прогон), берётся тот же origin.
 */
const API = (process.env.NEWSLETTER_API_BASE ?? SITE).replace(/\/$/, '');
const FROM = process.env.NEWSLETTER_FROM ?? 'Masortim <digest@masortim.github.io>';

const COPY = {
  ru: {
    confirmSubject: 'Подтвердите подписку на дневник разработчика',
    confirmLead: 'Кто-то (надеемся, что вы) подписался на новые записи дневника разработчика.',
    confirmAction: 'Подтвердить подписку',
    confirmIgnore: 'Если это были не вы, просто проигнорируйте письмо — адрес не попадёт в список.',
    confirmedSubject: 'Подписка на дневник разработчика оформлена',
    confirmedLead: 'Готово. Дальше каждое воскресенье буду присылать новые записи.',
    unsubscribe: 'Отписаться',
    unsubscribeLead: 'Отписаться от рассылки можно в любой момент:',
    digestSubject: (count) => count === 1 ? 'Новая запись в дневнике разработчика' : `Новые записи в дневнике разработчика: ${count}`,
    digestLead: 'Свежее за неделю.',
    digestRead: 'Читать',
  },
  en: {
    confirmSubject: 'Confirm your subscription to the developer diary',
    confirmLead: 'Someone (hopefully you) subscribed to new notes from the developer diary.',
    confirmAction: 'Confirm subscription',
    confirmIgnore: 'If this was not you, just ignore this email — the address will not be added.',
    confirmedSubject: 'Your developer diary subscription is confirmed',
    confirmedLead: 'Done. Every Sunday I will send you the new notes.',
    unsubscribe: 'Unsubscribe',
    unsubscribeLead: 'You can unsubscribe at any time:',
    digestSubject: (count) => count === 1 ? 'A new note in the developer diary' : `New notes in the developer diary: ${count}`,
    digestLead: 'Fresh this week.',
    digestRead: 'Read',
  },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Общий каркас письма: заголовок, абзацы, кнопка и подвал. */
function layout(bodyHtml, footerHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f6f1">
<div style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border:1px solid #e2ded2;font:17px/1.6 Georgia,serif;color:#111">
${bodyHtml}
<hr style="margin:28px 0 16px;border:0;border-top:1px solid #e2ded2">
<p style="margin:0;font:13px/1.5 Arial,sans-serif;color:#666">${footerHtml}</p>
</div></body></html>`;
}

function button(url, label) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#e8590c;color:#fff;font:600 16px/1 Arial,sans-serif;text-decoration:none;border-radius:4px">${escapeHtml(label)}</a></p>`;
}

/** Письмо с просьбой подтвердить подписку (double opt-in). */
function confirmationEmail({ email, lang, token }) {
  const t = COPY[lang] ?? COPY.ru;
  const url = `${API}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: t.confirmSubject,
    text: `${t.confirmLead}\n\n${t.confirmAction}: ${url}\n\n${t.confirmIgnore}`,
    html: layout(`<p>${escapeHtml(t.confirmLead)}</p>${button(url, t.confirmAction)}<p style="color:#666;font-size:15px">${escapeHtml(t.confirmIgnore)}</p>`,
      `<a href="${SITE}/newsletter/">masortim.github.io</a>`),
  };
}

/** Письмо после успешного подтверждения — с ссылкой на отписку. */
function welcomeEmail({ email, lang, token }) {
  const t = COPY[lang] ?? COPY.ru;
  const unsubscribe = `${API}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: t.confirmedSubject,
    text: `${t.confirmedLead}\n\n${t.unsubscribeLead} ${unsubscribe}`,
    html: layout(`<p>${escapeHtml(t.confirmedLead)}</p><p style="color:#666;font-size:15px">${escapeHtml(t.unsubscribeLead)} <a href="${escapeHtml(unsubscribe)}">${escapeHtml(t.unsubscribe)}</a></p>`,
      `<a href="${SITE}/newsletter/">masortim.github.io</a>`),
  };
}

/** Выпуск с новыми записями. */
function digestEmail({ email, lang, token, notes }) {
  const t = COPY[lang] ?? COPY.ru;
  const items = notes
    .map((note) => {
      const url = `${SITE}/diary/${note.slug}/?lang=${lang}`;
      return `<h2 style="margin:24px 0 6px;font:400 22px/1.25 Georgia,serif"><a href="${escapeHtml(url)}" style="color:#111">${escapeHtml(note.title)}</a></h2>
<p style="margin:0 0 6px">${escapeHtml(note.dek)}</p>
<p style="margin:0"><a href="${escapeHtml(url)}" style="color:#e8590c;font:600 15px Arial,sans-serif">${escapeHtml(t.digestRead)} →</a></p>`;
    })
    .join('\n');
  const unsubscribe = `${API}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: t.digestSubject(notes.length),
    text: `${t.digestLead}\n\n${notes.map((n) => `${n.title}\n${n.dek}\n${SITE}/diary/${n.slug}/?lang=${lang}`).join('\n\n')}\n\n${t.unsubscribeLead} ${unsubscribe}`,
    html: layout(`<p>${escapeHtml(t.digestLead)}</p>${items}`,
      `${escapeHtml(t.unsubscribeLead)} <a href="${escapeHtml(unsubscribe)}">${escapeHtml(t.unsubscribe)}</a>`),
  };
}

/**
 * Отправка через Resend. Возвращает { ok, id, error } — вызывающий код сам
 * решает, что делать с ошибкой, чтобы один недоставленный адрес не ронял
 * весь выпуск.
 */
async function send(message, options = {}) {
  const key = options.apiKey ?? process.env.RESEND_API_KEY ?? '';
  if (!key) return { ok: false, error: 'RESEND_API_KEY не задан' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.from ?? FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, error: `${response.status} ${detail.slice(0, 200)}` };
  }
  const payload = await response.json();
  return { ok: true, id: payload.id };
}

const EMAIL_COPY = COPY;

return { confirmationEmail, welcomeEmail, digestEmail, send, EMAIL_COPY };
})();

// ─── newsletter/lib/notes.mjs ───
const __notes = (() => {
/**
 * Чтение заметок с сайта для выпусков рассылки.
 *
 * В Vercel-функции нет локальных файлов репозитория, поэтому заметки
 * загружаются по HTTP с самого сайта. Разбор тот же, что у RSS-генератора:
 * h1, note-dek, note-meta — на двух языках.
 */

const NOTE_RE = /href="\/diary\/([\w-]+)\/?"/g;

/** Убирает теги и нормализует пробелы. */
function toText(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : '';
}

function spanByLanguage(block, lang) {
  return pick(block, new RegExp(`<span data-language-content="${lang}"[^>]*>([\\s\\S]*?)<\\/span>`));
}

/** Разбирает одну страницу заметки в объект выпуска. */
function parseNote(slug, html) {
  const meta = pick(html, /<p class="note-meta">([\s\S]*?)<\/p>/);
  const date = toText(pick(meta, /<span>([\s\S]*?)<\/span>/));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const titleBlock = pick(html, /<h1>([\s\S]*?)<\/h1>/);
  const dekBlock = pick(html, /<p class="note-dek">([\s\S]*?)<\/p>/);
  const titleRu = toText(spanByLanguage(titleBlock, 'ru'));
  const dekRu = toText(spanByLanguage(dekBlock, 'ru'));
  if (!titleRu || !dekRu) return null;

  return {
    slug,
    date,
    titleRu,
    titleEn: toText(spanByLanguage(titleBlock, 'en')) || titleRu,
    dekRu,
    dekEn: toText(spanByLanguage(dekBlock, 'en')) || dekRu,
  };
}

/**
 * Список заметок, свежие сверху. Slugs приходят из фида: он собирается из
 * тех же страниц, что и сайт, поэтому список всегда актуален.
 */
async function collectNotes({ site, limit = 20 } = {}) {
  const base = (site ?? 'https://masortim.github.io').replace(/\/$/, '');
  const feedResponse = await fetch(`${base}/feed.xml`);
  if (!feedResponse.ok) throw new Error(`feed.xml: ${feedResponse.status}`);
  const feed = await feedResponse.text();

  const slugs = [...new Set([...feed.matchAll(NOTE_RE)].map((m) => m[1]))].slice(0, limit);
  const notes = [];
  for (const slug of slugs) {
    const response = await fetch(`${base}/diary/${slug}/`);
    if (!response.ok) continue;
    const note = parseNote(slug, await response.text());
    if (note) notes.push(note);
  }
  return notes.sort((a, b) => (a.date < b.date ? 1 : -1));
}

return { toText, parseNote, collectNotes };
})();

// ─── api/newsletter/subscribe.mjs ───
const __subscribeApi = (() => {
/**
 * POST /api/newsletter/subscribe
 * Тело: { email, lang }
 *
 * Заводит подписку со статусом pending и отправляет письмо с подтверждением.
 * Ответ всегда одинаковый для нового и существующего адреса — так форма
 * не превращается в способ проверять, кто подписан.
 */




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
async function OPTIONS() {
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

async function POST(request) {
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

  // Уже подтверждён — письмо не шлём, но и не раскрываем статус.
  if (outcome.action === 'already') return json(200, { ok: true });

  const message = confirmationEmail({
    email: outcome.subscriber.email,
    lang: outcome.subscriber.lang,
    token: outcome.subscriber.token,
  });
  const result = await send(message);
  if (!result.ok) {
    console.error('confirmation email failed', result.error);
    return json(502, { error: 'email_failed' });
  }

  return json(200, { ok: true });
}

function GET() {
  return json(405, { error: 'method_not_allowed', hint: `see ${SITE}/newsletter/` });
}

return { OPTIONS, POST, GET };
})();

// ─── api/newsletter/confirm.mjs ───
const __confirmApi = (() => {
/**
 * GET /api/newsletter/confirm?token=…
 *
 * Подтверждает подписку и уводит читателя на страницу с результатом.
 * Страница сама показывает нужный язык по ?lang=.
 */




const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

function redirect(path) {
  return new Response(null, { status: 302, headers: { Location: `${SITE}${path}`, 'Cache-Control': 'no-store' } });
}

async function GET(request) {
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

return { GET };
})();

// ─── api/newsletter/unsubscribe.mjs ───
const __unsubscribeApi = (() => {
/**
 * GET /api/newsletter/unsubscribe?token=…
 *
 * Отписывает адрес и уводит читателя на страницу с результатом.
 */



const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

function redirect(path) {
  return new Response(null, { status: 302, headers: { Location: `${SITE}${path}`, 'Cache-Control': 'no-store' } });
}

async function GET(request) {
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

return { GET };
})();

// ─── api/newsletter/digest.mjs ───
const __digestApi = (() => {
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

async function GET(request) {
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

return { GET };
})();

/*
 * Псевдонимы для роутера.
 *
 * Бандлер вставляет этот блок после модулей: каждый модуль лежит в своей
 * IIFE, поэтому одноимённые константы (SITE есть почти в каждом файле)
 * не конфликтуют. Здесь наружу достаются только нужные имена.
 */

const { createStore } = __store;
const { subscribe, confirm, unsubscribe, confirmedSubscribers } = __subscribers;
const { confirmationEmail, welcomeEmail, digestEmail, send } = __email;
const { collectNotes } = __notes;

const subscribeApi = __subscribeApi;
const confirmApi = __confirmApi;
const unsubscribeApi = __unsubscribeApi;
const digestApi = __digestApi;


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
          account: list.map((item) => `${item.name} (${item.status})`),
          match: match ? match.status : null,
          verified: Boolean(match)
            && (match.status === 'verified'
              || (match.status === 'partially_verified' && sending === 'enabled')),
        };
      } else {
        // 401/403 означают, что ключ не принят; прочие коды — проблема на стороне Resend.
        const rejected = response.status === 401 || response.status === 403;
        domains = {
          checked: true,
          keyValid: !rejected,
          verified: false,
          error: `resend ${response.status}`,
        };
      }
    } catch (error) {
      domains = { checked: true, verified: false, error: 'network' };
    }
  }

  // Домен годится, если он подтверждён в Resend или это тестовый resend.dev.
  const senderUsable = testSender || domains.verified === true;
  // Ключ считается рабочим, если Resend его не отверг (401/403).
  const keyUsable = Boolean(key) && domains.keyValid !== false;

  const checks = {
    supabaseUrl: Boolean(env('SUPABASE_URL')),
    supabaseKey: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
    resendKey: Boolean(key),
    resendKeyAccepted: domains.keyValid ?? null,
    fromSet: Boolean(from),
    fromAddress: from || `${sender} (значение по умолчанию)`,
    senderDomain: domain,
    senderMode: testSender ? 'test' : 'domain',
    fromDomainStatus: testSender ? 'not_required (общий домен resend.dev)' : domains.match ?? null,
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

