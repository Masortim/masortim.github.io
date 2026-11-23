/**
 * Сквозной прогон бандла через SMTP: фейковый SMTP-сервер + фейковый Supabase.
 *
 * Зачем: рассылка должна уходить с адреса автора (alex.typeface@gmail.com),
 * а не с песочницы Resend. Здесь проверяется вся цепочка — подписка, письмо,
 * подтверждение, приветствие, отписка с удалением строки, — не выходя в сеть.
 */
import net from 'node:net';

const messages = [];
const server = net.createServer((socket) => {
  let buffer = ''; let inData = false;
  socket.write('220 test.local ESMTP\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    if (inData) {
      const end = buffer.indexOf('\r\n.\r\n');
      if (end === -1) return;
      messages.push(buffer.slice(0, end));
      buffer = buffer.slice(end + 5); inData = false;
      socket.write('250 Ok\r\n');
    }
    let i;
    while ((i = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
      if (!line) continue;
      if (line.startsWith('EHLO')) { socket.write('250 test.local\r\n'); continue; }
      if (line === 'AUTH LOGIN') { socket.write('334 VXNlcm5hbWU6\r\n'); continue; }
      if (line === Buffer.from('alex.typeface@gmail.com').toString('base64')) { socket.write('334 UGFzc3dvcmQ6\r\n'); continue; }
      // Пароль приложения Google показывается группами по 4 символа; клиент
      // обязан убрать пробелы, иначе получит 535.
      if (line === Buffer.from('abcdefghijklmnop').toString('base64')) { socket.write('235 ok\r\n'); continue; }
      if (line.startsWith('MAIL FROM')) { socket.write('250 Ok\r\n'); continue; }
      if (line.startsWith('RCPT TO')) { socket.write('250 Ok\r\n'); continue; }
      if (line === 'DATA') { inData = true; socket.write('354 go\r\n'); continue; }
      if (line === 'QUIT') { socket.write('221 Bye\r\n'); continue; }
    }
  });
  socket.on('error', () => {});
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

// Supabase-фейк
const rows = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname.endsWith('supabase.co')) {
    const method = (init.method ?? 'GET').toUpperCase();
    if (url.pathname.endsWith('/newsletter_subscribers')) {
      if (method === 'GET') return new Response(JSON.stringify([...rows.values()]), { status: 200 });
      if (method === 'POST') {
        const [row] = JSON.parse(init.body);
        const prev = rows.get(row.email) ?? {};
        rows.set(row.email, { ...prev, created_at: prev.created_at ?? new Date().toISOString(), ...row });
        return new Response('', { status: 201 });
      }
      if (method === 'DELETE') {
        const target = (url.searchParams.get('email') ?? '').replace(/^eq\./, '');
        rows.delete(target);
        return new Response(null, { status: 204 });
      }
    }
  }
  return realFetch(input, init);
};

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
process.env.NEWSLETTER_SMTP_PASS = 'abcd efgh ijkl mnop';
process.env.NEWSLETTER_SMTP_HOST = '127.0.0.1';
process.env.NEWSLETTER_SMTP_PORT = String(port);
process.env.NEWSLETTER_SMTP_USER = 'alex.typeface@gmail.com';
process.env.NEWSLETTER_FROM = 'Masortim <alex.typeface@gmail.com>';
process.env.NEWSLETTER_API_BASE = 'https://masortim-newsletter.vercel.app';
process.env.NEWSLETTER_TRANSPORT = 'smtp';
process.env.RESEND_API_KEY = '';

const { default: handler } = await import('../edge/index.mjs');
const req = (p, o = {}) => handler(new Request('https://masortim-newsletter.vercel.app' + p, o));
const post = (p, b) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const failures = [];
const ok = (l, c) => {
  if (!c) failures.push(l);
  console.log(`${c ? '✓' : '✗'} ${l}`);
};

const sub = await post('/api/newsletter/subscribe', { email: 'reader@example.com', lang: 'ru' });
ok(`подписка 200 (${sub.status})`, sub.status === 200);
ok(`письмо ушло по SMTP (${messages.length})`, messages.length === 1);
const decoded = Buffer.from(messages[0].match(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/)[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
ok('в письме есть ссылка подтверждения', /confirm\?token=/.test(decoded));
ok('From — адрес автора', /From: Masortim <alex\.typeface@gmail\.com>/.test(messages[0]));

const token = rows.get('reader@example.com').token;
const conf = await req('/api/newsletter/confirm?token=' + token);
ok(`подтверждение (${conf.headers.get('location')?.split('?')[1]})`, conf.headers.get('location').includes('state=confirmed'));
ok(`второе письмо (${messages.length})`, messages.length === 2);

const unsub = await req('/api/newsletter/unsubscribe?token=' + token);
ok(`отписка (${unsub.headers.get('location')?.split('?')[1]})`, unsub.headers.get('location').includes('state=unsubscribed'));
ok(`строка удалена (${rows.size})`, rows.size === 0);

server.close();
if (failures.length) {
  console.error(`\nпровалено: ${failures.length}`);
  process.exit(1);
}
console.log('\nвсе проверки пройдены');
