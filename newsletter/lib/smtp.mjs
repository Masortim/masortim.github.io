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

import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

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
export function encodeHeader(value) {
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

/** Собирает MIME-письмо: text + html в multipart/alternative. */
export function buildMime({ from, to, subject, text, html, boundary }) {
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
export async function sendViaSmtp({ host, port, secure, user, pass, from, to, subject, text, html }) {
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

    // Адрес отправителя берём из параметра, но и после «<...>» некоторые
    // серверы ждут его ещё раз (Gmail принимает оба варианта).
    await session.command(`MAIL FROM:<${from}>`, [250]);
    await session.command(`RCPT TO:<${to}>`, [250, 251]);

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
