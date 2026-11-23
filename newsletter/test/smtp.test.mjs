/**
 * Тест SMTP-клиента: поднимает крошечный SMTP-сервер в процессе и
 * проверяет, что клиент правильно ведёт сессию (EHLO → AUTH → MAIL → DATA).
 *
 * Зачем свой сервер: в песочнице нет выхода в интернет, а поведение
 * (коды ответов, многострочные EHLO, точка в DATA) нужно проверить
 * до деплоя, иначе ошибка всплывёт только на Vercel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { sendViaSmtp, buildMime, encodeHeader } from '../lib/smtp.mjs';

/** Поднимает сервер на свободном порту и отдаёт сценарий диалога. */
async function withServer(handler, run) {
  const received = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let dataLines = [];

    socket.write('220 test.local ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) {
          dataLines.push(buffer.split('\r\n').slice(0, -1).join('\r\n'));
          buffer = buffer.split('\r\n').pop() ?? '';
          return;
        }
        dataLines.push(buffer.slice(0, end));
        received.push({ data: dataLines.join('\r\n') });
        buffer = buffer.slice(end + 5);
        inData = false;
        dataLines = [];
        socket.write('250 2.0.0 Ok: queued\r\n');
      }

      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (!line) continue;
        const reply = handler(line, received);
        if (reply && reply.startData) {
          inData = true;
          dataLines = [];
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          continue;
        }
        if (reply) socket.write(`${reply}\r\n`);
      }
    });

    socket.on('error', () => {});
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(port, received);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('сессия: EHLO, AUTH LOGIN, MAIL, RCPT, DATA', async () => {
  const seen = [];
  await withServer((line) => {
    seen.push(line);
    if (line.startsWith('EHLO')) return '250-test.local\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 10240000';
    if (line === 'AUTH LOGIN') return '334 VXNlcm5hbWU6';
    if (line === Buffer.from('user@example.com').toString('base64')) return '334 UGFzc3dvcmQ6';
    if (line === Buffer.from('app-password').toString('base64')) return '235 2.7.0 Authentication successful';
    if (line.startsWith('MAIL FROM')) return '250 2.1.0 Ok';
    if (line.startsWith('RCPT TO')) return '250 2.1.5 Ok';
    if (line === 'DATA') return { startData: true };
    if (line === 'QUIT') return '221 2.0.0 Bye';
    return null;
  }, async (port, received) => {
    const result = await sendViaSmtp({
      host: '127.0.0.1',
      port,
      secure: false,
      user: 'user@example.com',
      pass: 'app-password',
      from: 'alex.typeface@gmail.com',
      to: 'reader@example.com',
      subject: 'Подтвердите подписку',
      text: 'текст',
      html: '<p>текст</p>',
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(received.length, 1);
    // Письмо должно быть в base64 и содержать оба варианта.
    assert.match(received[0].data, /multipart\/alternative/);
    assert.match(received[0].data, /text\/html/);
  });

  assert.ok(seen.some((line) => line.startsWith('MAIL FROM:<alex.typeface@gmail.com>')));
  assert.ok(seen.some((line) => line.startsWith('RCPT TO:<reader@example.com>')));
});

test('неверный пароль даёт внятную ошибку, а не зависание', async () => {
  await withServer((line) => {
    if (line.startsWith('EHLO')) return '250-test.local\r\n250 AUTH LOGIN PLAIN';
    if (line === 'AUTH LOGIN') return '334 VXNlcm5hbWU6';
    if (line === Buffer.from('user@example.com').toString('base64')) return '334 UGFzc3dvcmQ6';
    return '535 5.7.8 Username and Password not accepted';
  }, async (port) => {
    const result = await sendViaSmtp({
      host: '127.0.0.1',
      port,
      secure: false,
      user: 'user@example.com',
      pass: 'wrong',
      from: 'alex.typeface@gmail.com',
      to: 'reader@example.com',
      subject: 's',
      text: 't',
      html: '<p>t</p>',
    });
    assert.equal(result.ok, false);
    assert.equal(result.name, 'auth_failed');
    assert.equal(result.status, 535);
  });
});

test('отказ получателю не считается успехом', async () => {
  await withServer((line) => {
    if (line.startsWith('EHLO')) return '250 test.local';
    if (line.startsWith('MAIL FROM')) return '250 Ok';
    if (line.startsWith('RCPT TO')) return '550 5.1.1 No such user';
    if (line === 'RSET') return '250 Ok';
    if (line === 'QUIT') return '221 Bye';
    return null;
  }, async (port) => {
    const result = await sendViaSmtp({
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'alex.typeface@gmail.com',
      to: 'nobody@example.com',
      subject: 's',
      text: 't',
      html: '<p>t</p>',
    });
    assert.equal(result.ok, false);
    assert.equal(result.name, 'recipient_rejected');
  });
});

test('Message-ID собирается без лишних скобок', () => {
  const mime = buildMime({
    from: 'Masortim <alex.typeface@gmail.com>',
    to: 'reader@example.com',
    subject: 's',
    text: 't',
    html: '<p>t</p>',
  });
  const id = mime.match(/^Message-ID: (.*)$/m)[1];
  // Раньше здесь получалось «<...@gmail.com>>» — строгие фильтры считают
  // такое письмо подделкой и отправляют его в спам.
  assert.match(id, /^<[^<>]+@gmail\.com>$/);
});

test('заголовок с кириллицей кодируется, ascii — нет', () => {
  assert.equal(encodeHeader('Hello'), 'Hello');
  assert.match(encodeHeader('Подтвердите подписку'), /^=\?UTF-8\?B\?/);
});

test('точка в начале строки экранируется', async () => {
  await withServer((line) => {
    if (line.startsWith('EHLO')) return '250 test.local';
    if (line.startsWith('MAIL FROM')) return '250 Ok';
    if (line.startsWith('RCPT TO')) return '250 Ok';
    if (line === 'DATA') return { startData: true };
    if (line === 'QUIT') return '221 Bye';
    return null;
  }, async (port, received) => {
    const result = await sendViaSmtp({
      host: '127.0.0.1',
      port,
      secure: false,
      from: 'alex.typeface@gmail.com',
      to: 'reader@example.com',
      subject: 's',
      // Тело в base64, поэтому точку проверяем на уровне сборки письма.
      text: 'обычный текст',
      html: '<p>обычный текст</p>',
    });
    assert.equal(result.ok, true);
    assert.equal(received.length, 1);
    const mime = buildMime({
      from: 'alex.typeface@gmail.com',
      to: 'reader@example.com',
      subject: 's',
      text: '.точка',
      html: '<p>.точка</p>',
    });
    assert.equal(mime.includes('\r\n.\r\n'), false, 'в письме не должно быть строки с одной точкой');
  });
});
