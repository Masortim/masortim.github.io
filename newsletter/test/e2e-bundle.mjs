// Сквозной прогон бандла: подписка → подтверждение → отписка.
// Supabase из песочницы недоступен, поэтому REST подменяется фейком в памяти,
// а вся остальная цепочка (роутер, логика, письма) — настоящая.
const rows = new Map();
const emails = [];

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));

  if (url.hostname === 'api.resend.com') {
    emails.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: 'test-' + emails.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.hostname.endsWith('supabase.co')) {
    const method = (init.method ?? 'GET').toUpperCase();
    if (url.pathname.endsWith('/newsletter_subscribers')) {
      if (method === 'GET') {
        return new Response(JSON.stringify([...rows.values()]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'POST') {
        const [row] = JSON.parse(init.body);
        const prev = rows.get(row.email) ?? {};
        rows.set(row.email, {
          ...prev,
          created_at: prev.created_at ?? new Date().toISOString(),
          ...row,
          confirmed_at: row.confirmed_at ?? prev.confirmed_at ?? null,
          unsubscribed_at: row.unsubscribed_at ?? prev.unsubscribed_at ?? null,
        });
        return new Response('', { status: 201 });
      }
      if (method === 'DELETE') {
        // PostgREST-фильтр ?email=eq.<адрес>
        const filter = url.searchParams.get('email') ?? '';
        const target = filter.replace(/^eq\./, '');
        for (const key of [...rows.keys()]) {
          if (key === target) rows.delete(key);
        }
        return new Response(null, { status: 204 });
      }
    }
    throw new Error('unhandled ' + method + ' ' + url.pathname);
  }

  return realFetch(input, init);
};

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.RESEND_API_KEY = 'fake-resend';
process.env.NEWSLETTER_API_BASE = 'https://masortim-newsletter.vercel.app';
// Этот прогон проверяет Resend-транспорт (фейк api.resend.com ниже), поэтому
// транспорт задаём явно: от адреса отправителя он уже не зависит.
process.env.NEWSLETTER_TRANSPORT = 'resend';
process.env.NEWSLETTER_FROM = 'Masortim <onboarding@resend.dev>';
delete process.env.NEWSLETTER_SMTP_PASS;

const { default: handler } = await import('/home/user/masortim.github.io/newsletter/edge/index.mjs');

const req = (path, opts = {}) => handler(new Request('https://masortim-newsletter.vercel.app' + path, opts));
const post = (path, body) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const ok = (label, condition) => console.log(`${condition ? '✓' : '✗'} ${label}`);

// 1. Подписка
const sub = await post('/api/newsletter/subscribe', { email: 'Reader@Example.COM ', lang: 'ru' });
ok(`подписка отвечает 200 (${sub.status})`, sub.status === 200);
const row = [...rows.values()][0];
ok(`адрес нормализован: ${row.email}`, row.email === 'reader@example.com');
ok(`статус pending: ${row.status}`, row.status === 'pending');
ok(`письмо отправлено: «${emails[0]?.subject}»`, emails.length === 1);

// 2. Ссылка подтверждения должна вести на Vercel, а не на GitHub Pages
const link = emails[0].text.match(/https:\/\/\S+confirm\?token=\S+/)?.[0];
ok(`ссылка ведёт на API: ${link.split('?')[0]}`, link.startsWith('https://masortim-newsletter.vercel.app/api/newsletter/confirm'));

const token = new URL(link).searchParams.get('token');
const conf = await req('/api/newsletter/confirm?token=' + encodeURIComponent(token));
ok(`подтверждение редиректит: ${conf.headers.get('location')}`,
  conf.status === 302 && conf.headers.get('location').includes('state=confirmed'));
ok(`статус confirmed`, [...rows.values()][0].status === 'confirmed');
ok(`приветственное письмо: «${emails[1]?.subject}»`, emails.length === 2);

// 3. Повторное подтверждение
const again = await req('/api/newsletter/confirm?token=' + encodeURIComponent(token));
ok(`повторное подтверждение: ${again.headers.get('location').split('?')[1]}`,
  again.headers.get('location').includes('state=already'));

// 4. Отписка по ссылке из приветственного письма
const unsubLink = emails[1].text.match(/https:\/\/\S+unsubscribe\?token=\S+/)[0];
const unsubToken = new URL(unsubLink).searchParams.get('token');
const unsub = await req('/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken));
ok(`отписка: ${unsub.headers.get('location').split('?')[1]}`,
  unsub.headers.get('location').includes('state=unsubscribed'));
ok(`строка удалена из базы (${rows.size})`, rows.size === 0);

// 5. Повторная подписка отписавшегося — для базы это новый адрес, язык EN
await post('/api/newsletter/subscribe', { email: 'reader@example.com', lang: 'en' });
const back = [...rows.values()][0];
ok(`повторная подписка: статус ${back.status}, язык ${back.lang}`, back.status === 'pending' && back.lang === 'en');
ok(`токен выпущен заново`, back.token !== token);

// 6. Уже подтверждённый адрес не получает лишних писем
const before = emails.length;
rows.get('reader@example.com').status = 'confirmed';
const dup = await post('/api/newsletter/subscribe', { email: 'reader@example.com', lang: 'ru' });
ok(`подтверждённый адрес: 200, письма нет`, dup.status === 200 && emails.length === before);

// 7. Неверный адрес
const bad = await post('/api/newsletter/subscribe', { email: 'not-an-email', lang: 'ru' });
ok(`невалидный адрес: 400`, bad.status === 400 && (await bad.json()).error === 'invalid_email');

// 8. Неизвестный токен
const unknown = await req('/api/newsletter/confirm?token=unknown-token');
ok(`неизвестный токен: state=invalid`, unknown.headers.get('location').includes('state=invalid'));

// 9. Digest закрыт секретом
ok(`digest без секрета: 401`, (await req('/api/newsletter/digest')).status === 401);

// 10. CORS preflight
const pre = await req('/api/newsletter/subscribe', { method: 'OPTIONS' });
ok(`preflight: ${pre.status}, origin ${pre.headers.get('access-control-allow-origin')}`,
  pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://masortim.github.io');

console.log(`\nписем за прогон: ${emails.length}, строк в таблице: ${rows.size}`);
