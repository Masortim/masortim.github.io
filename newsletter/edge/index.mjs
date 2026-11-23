/**
 * Сгенерировано newsletter/scripts/bundle.mjs — не редактировать вручную.
 *
 * Единая функция рассылки: маршрутизация и все обработчики в одном файле.
 * Исходники: api/newsletter/*.mjs и newsletter/lib/*.mjs.
 *
 * Адреса:
 *   POST /api/newsletter/subscribe   { email, lang }
 *   GET  /api/newsletter/confirm     ?token=
 *   GET  /api/newsletter/unsubscribe ?token=
 *   GET  /api/newsletter/digest      Authorization: Bearer CRON_SECRET
 *   GET  /api/newsletter/token       Authorization: Bearer CRON_SECRET (?email=)
 *
 * Публикуется вместе с сайтом как /newsletter/bundle.js: Supabase Edge
 * Functions импортирует его как модуль (у площадки нет загрузки файлов).
 */
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
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
// Состояние рассылки: когда ушёл прошлый выпуск. Отдельная таблица, а не
// файл и не переменная: серверных функций несколько, они не помнят ничего
// между вызовами, а выпуск должен уходить ровно один раз в неделю.
const STATE_TABLE = 'newsletter_state';
const STATE_ID = 'digest';

function createStore(options = {}) {
  const url = options.url ?? process.env.SUPABASE_URL ?? '';
  const key = options.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !key) return createMemoryStore();
  return createSupabaseStore({ url: url.replace(/\/$/, ''), key });
}

/** Память процесса: локальная разработка и тесты. */
function createMemoryStore() {
  let data = { version: 1, subscribers: [] };
  let state = { lastDigestAt: null, lastDigestIsoDate: null, lastNoteDate: null };
  return {
    kind: 'memory',
    async readState() {
      return { ...state };
    },
    async writeState(next) {
      state = { ...state, ...next };
      return true;
    },
    async read() {
      return JSON.parse(JSON.stringify(data));
    },
    async write(next) {
      data = JSON.parse(JSON.stringify(next));
      return true;
    },
    async remove(email) {
      data.subscribers = (data.subscribers ?? []).filter((s) => s.email !== email);
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
 * write() пишет только изменившиеся строки — иначе две одновременные
 * подписки перезаписывали бы друг друга, и одно письмо с подтверждением
 * молча терялось. remove() удаляет строку по адресу.
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

  // Снимок последнего чтения: по нему видно, какие строки изменились.
  let snapshot = new Map();

  return {
    kind: 'supabase',

    /**
     * Состояние рассылки. Если таблицы нет или строки нет — считаем, что
     * выпусков ещё не было; это не ошибка, а первый запуск.
     */
    async readState() {
      const response = await request(`${STATE_TABLE}?id=eq.${STATE_ID}&select=*`);
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return { lastDigestAt: null, lastDigestIsoDate: null, lastNoteDate: null };
      return {
        lastDigestAt: row.last_digest_at ?? null,
        lastDigestIsoDate: row.last_digest_iso_date ?? null,
        lastNoteDate: row.last_note_date ?? null,
      };
    },

    async writeState(next) {
      await request(`${STATE_TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          id: STATE_ID,
          last_digest_at: next.lastDigestAt ?? null,
          last_digest_iso_date: next.lastDigestIsoDate ?? null,
          last_note_date: next.lastNoteDate ?? null,
          updated_at: new Date().toISOString(),
        }]),
      });
      return true;
    },

    async read() {
      const response = await request(`${TABLE}?select=*&order=created_at.asc`);
      const rows = await response.json();
      snapshot = new Map(rows.map((row) => [row.email, row]));
      return { version: 1, subscribers: rows.map(toSubscriber) };
    },

    /**
     * Пишет только изменившиеся строки: сравнивает с прошлым чтением.
     * Раньше здесь переписывались все подписчики подряд, поэтому запрос,
     * прочитавший состояние до чужой подписки, затирал её токен — человек
     * получал письмо со ссылкой, которая уже не подтверждала ничего.
     */
    async write(next) {
      const subscribers = Array.isArray(next?.subscribers) ? next.subscribers : [];
      for (const subscriber of subscribers) {
        const row = toRow(subscriber);
        const previous = snapshot.get(row.email);
        const unchanged = previous
          && ['lang', 'status', 'token', 'confirmed_at', 'unsubscribed_at']
            .every((field) => (previous[field] ?? null) === (row[field] ?? null));
        if (unchanged) continue;
        // email — первичный ключ дедупликации; upsert по нему.
        await request(`${TABLE}?on_conflict=email`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([row]),
        });
        snapshot.set(row.email, row);
      }
      return true;
    },

    /** Удаление по адресу — для отписки. */
    async remove(email) {
      const address = String(email ?? '');
      await request(`${TABLE}?email=eq.${encodeURIComponent(address)}`, { method: 'DELETE' });
      snapshot.delete(address);
      return true;
    },
  };
}

return { createStore };
})();

// ─── newsletter/lib/smtp.mjs ───
const __smtp = (() => {
/**
 * Отправка писем по SMTP — без внешних зависимостей.
 *
 * Зачем свой клиент: серверная часть собирается в один самодостаточный файл
 * (newsletter/scripts/bundle.mjs), поэтому тянуть nodemailer нельзя — он
 * потянул бы за собой дерево модулей, которого на Vercel не будет.
 *
 * Зачем SMTP вообще: рассылка должна уходить с адреса автора
 * (alex.typeface@gmail.com), а не с песочницы Resend, которая доставляет
 * письма только владельцу аккаунта. Своего домена нет, проверять DNS нечего,
 * поэтому остаётся штатный SMTP Gmail с паролем приложения.
 *
 * Что поддерживается: 465 (TLS сразу), 587 (STARTTLS), 25 (без шифрования —
 * только для локальных отладочных серверов), AUTH LOGIN и AUTH PLAIN.
 * Этого достаточно для Gmail, Яндекс.Почты и Mail.ru.
 */




const TIMEOUT = 20_000;

/**
 * Читает ответы SMTP из сокета.
 *
 * Ответ заканчивается строкой «NNN текст» (код + пробел). Строки с дефисом
 * после кода — продолжение, их склеиваем. Сокет подменяется при STARTTLS,
 * поэтому подписка на данные живёт здесь, а не на конкретном соединении.
 */
function createReader() {
  let buffer = '';
  let waiters = [];
  let current = null;
  let failure = null;

  function settle() {
    if (!waiters.length) return;
    const lines = buffer.split('\r\n');
    const tail = lines[lines.length - 1];
    // Держим неполную строку в буфере, остальное разбираем.
    if (tail !== '' && !/^\d{3} /.test(tail)) return;
    const last = [...lines].reverse().find((line) => /^\d{3} /.test(line));
    if (!last) return;
    const index = lines.indexOf(last);
    const used = lines.slice(0, index + 1);
    buffer = lines.slice(index + 1).join('\r\n');
    const response = {
      code: Number(last.slice(0, 3)),
      text: used.map((line) => line.slice(4)).join('\n'),
    };
    const resolve = waiters.shift();
    resolve(response);
  }

  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    settle();
  };

  return {
    attach(socket) {
      if (current) current.removeListener('data', onData);
      current = socket;
      socket.on('data', onData);
      socket.on('error', (error) => {
        failure = error;
        const pending = waiters;
        waiters = [];
        for (const reject of pending) reject(error);
      });
    },
    /** Ответ на последнюю отправленную команду. */
    read() {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        waiters.push(resolve);
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w !== resolve);
          reject(new Error(`smtp: сервер не ответил за ${TIMEOUT / 1000} с`));
        }, TIMEOUT);
        const wrapped = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        waiters[waiters.length - 1] = wrapped;
        settle();
      });
    },
    reset() {
      buffer = '';
      failure = null;
    },
  };
}

function createSession(socket, { host }) {
  const reader = createReader();
  reader.attach(socket);
  let current = socket;

  return {
    reader,
    get socket() {
      return current;
    },
    /** Команда + ответ; expected — список допустимых кодов. */
    async command(line, expected) {
      current.write(`${line}\r\n`);
      const response = await reader.read();
      if (expected && !expected.includes(response.code)) {
        const error = new Error(`smtp ${response.code}: ${response.text}`);
        error.code = 'smtp_rejected';
        error.status = response.code;
        throw error;
      }
      return response;
    },
    /** Команда, у которой ответ читает вызывающий (DATA). */
    write(line) {
      current.write(`${line}\r\n`);
    },
    /** TLS поверх открытого соединения (STARTTLS). */
    async upgrade() {
      const secured = tlsConnect({ socket: current, servername: host });
      await new Promise((resolve, reject) => {
        secured.once('secureConnect', resolve);
        secured.once('error', reject);
      });
      current = secured;
      reader.reset();
      reader.attach(secured);
      return secured;
    },
  };
}

function connectSocket({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tlsConnect({ host, port, servername: host })
      : netConnect({ host, port });
    const event = secure ? 'secureConnect' : 'connect';
    socket.setTimeout(TIMEOUT);
    socket.once(event, () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error(`smtp: ${host}:${port} не отвечает`)));
  });
}

/** Кодирует значение заголовка по RFC 2047, если там не ASCII. */
function encodeHeader(value) {
  const text = String(value ?? '');
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

/**
 * Домен для Message-ID. Адрес приходит в виде «Имя <user@host>», поэтому
 * вытаскиваем часть после @ и отбрасываем угловые скобки: иначе получается
 * «@host>>», и строгие фильтры считают такое письмо подделкой.
 */
function messageDomain(from) {
  const match = String(from ?? '').match(/@([^>\s,;]+)/);
  return match ? match[1] : 'localhost';
}

/**
 * Голый адрес из значения заголовка From.
 *
 * Заголовок и конверт — разные вещи: в заголовке допустимо
 * «Masortim <alex.typeface@gmail.com>», а в MAIL FROM принимается только
 * адрес. Если отдать туда заголовок целиком, получается
 * «MAIL FROM:<Masortim <alex.typeface@gmail.com>>», и Gmail отвечает
 * 555 5.5.4 Unsupported option — именно эта ошибка и валила подписку.
 */
function envelopeAddress(from) {
  const text = String(from ?? '').trim();
  const angled = text.match(/<([^<>]+)>/);
  if (angled) return angled[1].trim();
  const bare = text.match(/[^\s<>,;"]+@[^\s<>,;"]+/);
  return bare ? bare[0] : text;
}

/** Собирает MIME-письмо: text + html в multipart/alternative. */
function buildMime({ from, to, subject, text, html, boundary }) {
  const mixed = boundary ?? `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const encodeBody = (value) => {
    const body = Buffer.from(String(value ?? ''), 'utf8').toString('base64');
    // base64 режем по 76 символов — так требуют правила переноса строк.
    return body.replace(/(.{76})/g, '$1\r\n');
  };
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}@${messageDomain(from)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(text),
    `--${mixed}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(html),
    `--${mixed}--`,
    '',
  ];
  return lines.join('\r\n');
}

/** Точка в начале строки в теле DATA означает конец письма — экранируем. */
function dotStuff(message) {
  return message.replace(/^\./gm, '..');
}

/**
 * Отправляет одно письмо.
 * Возвращает { ok: true, id } либо { ok: false, status, name, error }.
 * Ошибки не бросает: вызывающий код сам решает, что делать с недоставкой.
 */
async function sendViaSmtp({ host, port, secure, user, pass, from, to, subject, text, html }) {
  const useTlsFromStart = secure ?? port === 465;
  const options = { host, port, secure: useTlsFromStart };

  let session;
  let socket;
  try {
    socket = await connectSocket(options);
    session = createSession(socket, { host });

    const greeting = await session.reader.read();
    if (greeting.code !== 220) {
      throw new Error(`smtp ${greeting.code}: ${greeting.text}`);
    }

    const ehloHost = 'masortim.github.io';
    const ehlo = await session.command(`EHLO ${ehloHost}`, [250]);

    if (!useTlsFromStart) {
      // STARTTLS — только если сервер сам его объявил в EHLO. Локальные
      // отладочные серверы его не умеют и просто молчат на эту команду.
      const offersStartTls = /STARTTLS/i.test(ehlo.text);
      if (offersStartTls) {
        const starttls = await session.command('STARTTLS', [220]);
        await session.upgrade();
        await session.command(`EHLO ${ehloHost}`, [250]);
      }
    }

    if (user && pass) {
      // AUTH LOGIN понимают Gmail, Яндекс и Mail.ru; PLAIN — запасной вариант.
      const auth = await session.command('AUTH LOGIN', null);
      if (auth.code === 334) {
        await session.command(Buffer.from(user, 'utf8').toString('base64'), [334]);
        const done = await session.command(Buffer.from(pass, 'utf8').toString('base64'), null);
        if (done.code !== 235) {
          const error = new Error(`smtp ${done.code}: ${done.text}`);
          error.code = 'smtp_auth';
          error.status = done.code;
          throw error;
        }
      } else if (auth.code === 504 || auth.code === 502) {
        const plain = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
        const done = await session.command(`AUTH PLAIN ${plain}`, null);
        if (done.code !== 235) {
          const error = new Error(`smtp ${done.code}: ${done.text}`);
          error.code = 'smtp_auth';
          error.status = done.code;
          throw error;
        }
      } else {
        const error = new Error(`smtp ${auth.code}: ${auth.text}`);
        error.code = 'smtp_auth';
        error.status = auth.code;
        throw error;
      }
    }

    // В конверте — только адрес: «Masortim <a@b>» здесь недопустим.
    const envelopeFrom = envelopeAddress(from);
    await session.command(`MAIL FROM:<${envelopeFrom}>`, [250]);
    await session.command(`RCPT TO:<${envelopeAddress(to)}>`, [250, 251]);

    const data = await session.command('DATA', [354]);
    if (data.code !== 354) {
      throw new Error(`smtp ${data.code}: ${data.text}`);
    }

    // Тело отправляем целиком, а ответ на завершающую точку читаем отдельно:
    // сервер отвечает только после неё, поэтому ждать внутри command нельзя.
    const mime = buildMime({ from, to, subject, text, html });
    session.write(`${dotStuff(mime)}\r\n.`);
    const result = await session.reader.read();
    if (result.code !== 250) {
      const error = new Error(`smtp ${result.code}: ${result.text}`);
      error.code = 'smtp_rejected';
      error.status = result.code;
      throw error;
    }

    try {
      await session.command('QUIT', null);
    } catch {
      // Сервер может закрыть соединение сразу после QUIT — это норма.
    }

    return { ok: true, id: `smtp-${Date.now().toString(36)}` };
  } catch (error) {
    const status = typeof error.status === 'number' ? error.status : null;
    const name = error.code === 'smtp_auth'
      ? 'auth_failed'
      : status === 550 || status === 553 || status === 554
        ? 'recipient_rejected'
        : status
          ? 'smtp_error'
          : 'network';
    return { ok: false, status, name, error: String(error.message ?? error) };
  } finally {
    try {
      (session?.socket ?? socket)?.destroy();
    } catch {
      // соединение могло быть уже закрыто
    }
  }
}

return { encodeHeader, envelopeAddress, buildMime, sendViaSmtp };
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
 *
 * Строка удаляется из списка, а не помечается unsubscribed: адрес, который
 * человек попросил забыть, не должен оставаться в базе. Раньше запись со
 * статусом unsubscribed блокировала автоматические проверки — временный
 * пробный адрес навсегда занимал единственно возможное значение.
 */
async function unsubscribe({ store, token }) {
  const data = (await store.read()) ?? emptyData();
  const subscriber = (data.subscribers ?? []).find((s) => s.token === token);
  if (!subscriber) return { result: 'not_found' };

  if (subscriber.status === 'unsubscribed') {
    return { result: 'already', subscriber };
  }

  data.subscribers = data.subscribers.filter((s) => s !== subscriber);
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
const { sendViaSmtp } = __smtp;
/**
 * Тексты писем (двуязычные) и их отправка через Resend.
 *
 * Письма намеренно простые: один столбец, системный шрифт, без картинок.
 * Так они не ломаются в почтовых клиентах и выглядят как текст дневника.
 */



const SITE = process.env.NEWSLETTER_SITE ?? 'https://masortim.github.io';

/**
 * Куда ведут кнопки в письмах.
 *
 * Только на САЙТ, никогда на домен функций. Причина: домен функции может
 * быть недоступен у читателя (например, *.vercel.app рвётся у части
 * российских провайдеров на уровне TCP), и тогда кнопка «Подтвердить
 * подписку» из письма не открывалась бы вовсе. Страница /newsletter/ —
 * обычный HTML на GitHub Pages, он открывается всегда, а подтверждение
 * она запрашивает со своего адреса скриптом.
 */
const LINK_BASE = SITE.replace(/\/$/, '');
const FROM = process.env.NEWSLETTER_FROM ?? 'Masortim <alex.typeface@gmail.com>';

const OWNER = 'alex.typeface@gmail.com';

/**
 * Какой транспорт отправляет письма.
 *
 *   smtp   — Gmail (smtp.gmail.com) с паролем приложения. Единственный способ
 *            отправлять от имени alex.typeface@gmail.com без своего домена.
 *   resend — Resend; годится только с проверенным доменом, иначе песочница
 *            доставляет письма исключительно владельцу аккаунта.
 *
 * Выбор по переменным окружения, без правок кода: если задан
 * NEWSLETTER_SMTP_PASS — работает SMTP, иначе Resend.
 */
function transportKind() {
  const mode = (process.env.NEWSLETTER_TRANSPORT ?? '').trim().toLowerCase();
  if (mode === 'smtp' || mode === 'resend') return mode;
  if ((process.env.NEWSLETTER_SMTP_PASS ?? '').trim()) return 'smtp';
  // Адрес отправителя на gmail.com означает именно SMTP: Resend не может
  // отправлять от чужого домена без его подтверждения.
  // FROM приходит как «Имя <user@host>», поэтому здесь @ уместен.
  if (/@gmail\.com[>\s,;]?$/i.test(FROM)) return 'smtp';
  return 'resend';
}

function smtpConfig(options = {}) {
  const host = (options.host ?? process.env.NEWSLETTER_SMTP_HOST ?? 'smtp.gmail.com').trim();
  const port = Number((options.port ?? process.env.NEWSLETTER_SMTP_PORT ?? 465) || 465);
  const user = (options.user ?? process.env.NEWSLETTER_SMTP_USER ?? OWNER).trim();
  // Google показывает пароль приложения группами по четыре символа
  // («abcd efgh ijkl mnop»), и его копируют вместе с пробелами. SMTP ждёт
  // 16 символов без них, поэтому убираем все пробелы, не только по краям.
  const pass = String(options.pass ?? process.env.NEWSLETTER_SMTP_PASS ?? '')
    .replace(/\s+/g, '');
  return { host, port, user, pass };
}

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
  const url = `${LINK_BASE}/newsletter/?confirm=${encodeURIComponent(token)}&lang=${lang}`;
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
  const unsubscribe = `${LINK_BASE}/newsletter/?unsubscribe=${encodeURIComponent(token)}&lang=${lang}`;
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
  const unsubscribe = `${LINK_BASE}/newsletter/?unsubscribe=${encodeURIComponent(token)}&lang=${lang}`;
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
  const kind = options.transport ?? transportKind();
  if (kind === 'smtp') {
    const config = smtpConfig(options);
    if (!config.pass) {
      return { ok: false, status: null, name: 'not_configured', error: 'NEWSLETTER_SMTP_PASS не задан' };
    }
    return sendViaSmtp({
      ...config,
      from: options.from ?? FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  const key = options.apiKey ?? process.env.RESEND_API_KEY ?? '';
  if (!key) return { ok: false, status: null, name: 'not_configured', error: 'RESEND_API_KEY не задан' };

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

/**
 * Ссылки на заметки в фиде.
 *
 * Раньше здесь стояло href="/diary/…" — атрибут ссылки, которого в RSS
 * нет вовсе: адрес записи лежит в элементе <link> и записан абсолютно
 * (https://masortim.github.io/diary/conferences/?lang=ru). Из-за этого
 * список заметок всегда выходил пустым, и недельный выпуск молча ничего
 * не отправлял («записей нет — рассылать нечего»).
 */
const NOTE_RE = /<link>\s*https?:\/\/[^<\/]+\/diary\/([\w-]+)/g;

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

// ─── newsletter/lib/digest.mjs ───
const __digest = (() => {
/**
 * Логика еженедельного выпуска.
 *
 * Вынесена из обработчика, чтобы правила отправки можно было проверить
 * тестами без сети: что уходит только новое, что в одну неделю выпуск
 * бывает один раз и что пробный прогон не трогает живых подписчиков.
 *
 * Правила:
 *
 *   1. Выпуск — раз в неделю. Если прошлый ушёл меньше семи дней назад,
 *      повторный запуск ничего не отправляет (duplicate_week). Это защита
 *      от двух вещей сразу: от страховочного запуска в понедельник после
 *      удачного воскресного и от повторного срабатывания cron на стороне
 *      Vercel, которое та допускает.
 *
 *   2. В письмо идут только новые записи — свежее даты прошлого выпуска.
 *      Нет ничего нового — письма нет (no_new_notes). Повторять «три
 *      последние» нельзя: подписчик получал один и тот же выпуск дважды.
 *
 *   3. Первый выпуск (истории нет) отправляет только самые свежие записи,
 *      а не весь архив: иначе человеку прилетит письмо про 2021 год.
 *
 *   4. Пробный режим (test_to) отправляет настоящее письмо ровно одному
 *      адресу и не двигает дату выпуска. Так внешняя проверка видит
 *      реальную доставку, а живые подписчики ничего лишнего не получают.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Сколько записей максимум попадает в выпуск. */
const MAX_NOTES = 3;

/** Сколько записей берёт первый выпуск, когда истории ещё нет. */
const FIRST_DIGEST_NOTES = 1;

function toIsoDate(value) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * Решает, что отправить.
 *
 * Возвращает одно из:
 *   { action: 'dry', notes, recipients } — только показать, без отправки;
 *   { action: 'send', notes, recipients, state } — отправить и запомнить state;
 *   { action: 'week', reason: 'duplicate_week' } — в эту неделю уже был выпуск;
 *   { action: 'none', reason: 'no_notes' | 'no_new_notes' | 'no_subscribers' }.
 */
function planDigest({ notes, subscribers, state, now = new Date(), testTo = '', dryRun = false }) {
  const allNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
  if (!allNotes.length) return { action: 'none', reason: 'no_notes' };

  // Свежие сверху — на это опираются срезы ниже.
  const sorted = [...allNotes].sort((a, b) => (a.date < b.date ? 1 : -1));

  const lastAt = state?.lastDigestAt ? new Date(state.lastDigestAt) : null;
  // Дата прошлого выпуска: колонка ISO-даты надёжнее, чем разбор timestamp.
  // Если её нет (старая строка), выводим из времени отправки.
  const lastDate = toIsoDate(state?.lastNoteDate)
    ?? (lastAt && !Number.isNaN(lastAt.getTime()) ? lastAt.toISOString().slice(0, 10) : null);

  // Пробный прогон: собрать письмо по тем же правилам, но без памяти недели
  // и без изменения состояния.
  if (testTo) {
    const sample = lastDate
      ? sorted.filter((n) => n.date > lastDate).slice(0, MAX_NOTES)
      : sorted.slice(0, FIRST_DIGEST_NOTES);
    // Новых записей нет — всё равно шлём пробу, иначе нечем проверить
    // доставку. Берём самую свежую запись, письмо помечается как пробное.
    const notesForTest = sample.length ? sample : sorted.slice(0, 1);
    return {
      action: 'test',
      notes: notesForTest,
      recipients: [{ email: testTo, lang: 'ru' }],
      state: null,
      sample: !sample.length,
    };
  }

  // Правило недели: повторный запуск в те же семь дней молчит.
  if (lastAt && !Number.isNaN(lastAt.getTime()) && now.getTime() - lastAt.getTime() < WEEK_MS) {
    return { action: 'week', reason: 'duplicate_week', lastDigestAt: lastAt.toISOString() };
  }

  const recipients = Array.isArray(subscribers) ? subscribers : [];
  if (!recipients.length) return { action: 'none', reason: 'no_subscribers' };

  const fresh = lastDate
    ? sorted.filter((n) => n.date > lastDate)
    : sorted.slice(0, FIRST_DIGEST_NOTES);

  if (!fresh.length) {
    return {
      action: 'none',
      reason: lastDate ? 'no_new_notes' : 'no_notes',
      lastNoteDate: lastDate,
      recipients: recipients.length,
    };
  }

  const chosen = fresh.slice(0, MAX_NOTES);
  return {
    action: dryRun ? 'dry' : 'send',
    notes: chosen,
    recipients,
    // Запоминаем самую свежую из отправленных записей: следующая неделя
    // возьмёт только то, что появилось после неё.
    state: {
      lastDigestAt: now.toISOString(),
      lastDigestIsoDate: now.toISOString().slice(0, 10),
      lastNoteDate: chosen[0].date,
    },
  };
}

/** Тексты для разных исходов: без «ошибки» там, где всё в порядке. */
const DIGEST_REASONS = {
  no_notes: 'заметок для выпуска нет',
  no_new_notes: 'новых заметок нет — письмо не отправлено',
  no_subscribers: 'подписчиков нет — письмо не отправлено',
  duplicate_week: 'выпуск за эту неделю уже отправлен',
};

return { planDigest, DIGEST_REASONS };
})();

// ─── api/newsletter/subscribe.mjs ───
const __subscribeApi = (() => {
const { createStore } = __store;
const { subscribe } = __subscribers;
const { confirmationEmail, send } = __email;
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
    // upstream — код и имя ошибки транспорта без адресов. Он нужен, чтобы
    // отличить «пароль приложения неверен» от «адрес не принят сервером».
    return json(502, {
      error: 'email_failed',
      upstream: result.status ? `${result.status} ${result.name || 'unknown'}` : (result.name || 'no_request'),
    });
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
const { createStore } = __store;
const { confirm } = __subscribers;
const { send, welcomeEmail } = __email;
/**
 * GET  /api/newsletter/confirm?token=…  — ссылка из письма: подтверждает
 *      подписку и уводит читателя на страницу с результатом.
 * POST /api/newsletter/confirm  { token } — тот же шаг, но со страницы:
 *      она сама показывает сообщение, поэтому отвечаем JSON, без редиректа.
 */




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
async function OPTIONS() {
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

async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const { status, payload } = await runConfirm(token);
  if (payload.error === 'not_found') return redirect('/newsletter/?state=invalid&lang=ru');
  if (status === 500) return redirect('/newsletter/?state=error&lang=ru');
  return redirect(`/newsletter/?state=${payload.result}&lang=${payload.lang}`);
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const { status, payload } = await runConfirm(String(body?.token ?? ''));
  return json(status, payload);
}

return { OPTIONS, GET, POST };
})();

// ─── api/newsletter/unsubscribe.mjs ───
const __unsubscribeApi = (() => {
const { createStore } = __store;
const { unsubscribe } = __subscribers;
/**
 * GET  /api/newsletter/unsubscribe?token=…  — ссылка из письма: отписывает
 *      адрес и уводит читателя на страницу с результатом.
 * POST /api/newsletter/unsubscribe  { token } — тот же шаг со страницы:
 *      отвечаем JSON, сообщение показывает сама страница.
 */



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
async function OPTIONS() {
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

async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const { status, payload } = await runUnsubscribe(token);
  if (payload.error === 'not_found') return redirect('/newsletter/?state=invalid&lang=ru');
  if (status === 500) return redirect('/newsletter/?state=error&lang=ru');
  return redirect(`/newsletter/?state=${payload.result}&lang=${payload.lang}`);
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const { status, payload } = await runUnsubscribe(String(body?.token ?? ''));
  return json(status, payload);
}

return { OPTIONS, GET, POST };
})();

// ─── api/newsletter/digest.mjs ───
const __digestApi = (() => {
const { createStore } = __store;
const { confirmedSubscribers, isValidEmail, normalizeEmail } = __subscribers;
const { digestEmail, send } = __email;
const { collectNotes } = __notes;
const { planDigest, DIGEST_REASONS } = __digest;
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

async function GET(request) {
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

return { GET };
})();

// ─── newsletter/edge/token-handler.mjs ───
const __tokenApi = (() => {
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

async function GET(request) {
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
  '/api/newsletter/token': __tokenApi,
};

/**
 * Самодиагностика: открывается в браузере, секретов не раскрывает —
 * только факт «задано / не задано» и адрес отправителя.
 */
/**
 * Проверка права отправки без отправки: тело без адреса Resend не примет,
 * но ключ к этому моменту уже проверен. 401 — ключ негоден или отозван,
 * любой другой ответ — ключ аутентифицировался.
 */
async function probeSending(key) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.status === 401 ? 'invalid' : 'ok';
  } catch (error) {
    // Сеть недоступна — судить о ключе нельзя, не блокируем.
    return 'unknown';
  }
}

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

  // Транспорт: SMTP (Gmail) или Resend. При SMTP ключ Resend не нужен вовсе,
  // а домен отправителя — это gmail.com, который проверять негде и не за чем.
  const smtpPass = env('NEWSLETTER_SMTP_PASS');
  const mode = env('NEWSLETTER_TRANSPORT').toLowerCase();
  // Адрес на gmail.com можно отправить только через SMTP этого ящика:
  // Resend не выдаёт себя за чужой домен. Такой адрес считаем признаком
  // выбранного транспорта, чтобы подсказка говорила «нужен пароль»,
  // а не «нужен ключ Resend».
  // domain — это уже часть после @, поэтому @ в шаблоне не нужен.
  const gmailSender = /^gmail\.com$/i.test(domain);
  const transport = mode === 'smtp' || mode === 'resend'
    ? mode
    : smtpPass || gmailSender ? 'smtp' : 'resend';
  const smtpHost = env('NEWSLETTER_SMTP_HOST') || 'smtp.gmail.com';
  const smtpPort = Number(env('NEWSLETTER_SMTP_PORT') || 465);
  const smtpUser = env('NEWSLETTER_SMTP_USER') || 'alex.typeface@gmail.com';
  const smtpReady = Boolean(smtpPass) && Boolean(smtpUser) && Boolean(smtpHost);

  let domains = { checked: false };
  // При SMTP Resend не участвует в отправке — его проверки не имеют смысла.
  if (key && transport === 'resend') {
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
        const detail = await response.text().catch(() => '');
        // 401/403 означают, что ключ не принят; прочие коды — проблема на стороне Resend.
        const rejected = response.status === 401 || response.status === 403;
        // Ключ «Sending access» — как раз тот, что рекомендует Resend, но список
        // доменов ему закрыт: на GET /domains он отвечает 401 restricted_api_key.
        // Считать такой ключ негодным нельзя — рассылка с ним работает.
        const restricted = rejected && /restricted_api_key|restricted to only send/i.test(detail);
        if (restricted) {
          domains = {
            checked: true,
            keyValid: true,
            scope: 'sending',
            verified: testSender ? true : null,
            match: testSender ? 'not_required' : 'unknown',
          };
        } else {
          domains = {
            checked: true,
            keyValid: !rejected,
            verified: false,
            error: `resend ${response.status}${detail ? ` ${detail.slice(0, 100)}` : ''}`,
          };
        }
      }
    } catch (error) {
      domains = { checked: true, verified: false, error: 'network' };
    }
  }

  // Домен годится, если он подтверждён в Resend или это тестовый resend.dev.
  const senderUsable = transport === 'smtp'
    ? smtpReady
    : testSender || domains.verified === true || domains.scope === 'sending';
  // Ключ считается рабочим, если Resend его не отверг (401/403).
  // При SMTP ключ Resend не нужен: письма идут через почтовый сервер.
  const keyUsable = transport === 'smtp' ? true : Boolean(key) && domains.keyValid !== false;

  const checks = {
    supabaseUrl: Boolean(env('SUPABASE_URL')),
    supabaseKey: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
    transport,
    smtp: {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      passSet: Boolean(smtpPass),
    },
    resendKey: Boolean(key),
    resendKeyAccepted: domains.keyValid ?? null,
    resendKeyScope: domains.scope ?? null,
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
      // Подсказка не привязана к площадке: один и тот же бандл работает и на
      // Vercel, и в Supabase Edge Functions, а переменные задаются там, где
      // развёрнута функция.
      transport === 'smtp' && !smtpPass
        && 'добавьте NEWSLETTER_SMTP_PASS в переменные окружения функции (пароль приложения Gmail) и перевыпустите деплой',
      transport === 'resend' && !checks.resendKey
        && 'добавьте RESEND_API_KEY в переменные окружения функции и перевыпустите деплой',
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
      transport === 'smtp'
        && `письма уходят с ${smtpUser} через ${smtpHost}:${smtpPort} — получателям будет виден адрес отправителя ${sender}`,
      transport === 'resend' && domains.scope === 'sending'
        && 'ключ Resend ограничен правами отправки: список доменов ему закрыт (это норма), письма он отправляет',
      transport === 'resend' && testSender
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

