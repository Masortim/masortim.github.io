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
export function confirmationEmail({ email, lang, token }) {
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
export function welcomeEmail({ email, lang, token }) {
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
export function digestEmail({ email, lang, token, notes }) {
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
export async function send(message, options = {}) {
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

export const EMAIL_COPY = COPY;
