// Сквозной прогон бандла: подписка → подтверждение → отписка.
// Supabase из песочницы недоступен, поэтому REST подменяется фейком в памяти,
// а вся остальная цепочка (роутер, логика, письма) — настоящая.
const rows = new Map();
const emails = [];
// Состояние выпуска: одна строка id='digest'.
const state = new Map();

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
    if (url.pathname.endsWith('/newsletter_state')) {
      if (method === 'GET') {
        return new Response(JSON.stringify([...state.values()]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'POST') {
        const [row] = JSON.parse(init.body);
        state.set(row.id, { ...(state.get(row.id) ?? {}), ...row });
        return new Response('', { status: 201 });
      }
    }
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

// Ссылку из письма может открыть почтовый клиент заранее — сам по себе
// заход ничего не подтверждает.
const prefetch = await req('/api/newsletter/confirm?token=' + encodeURIComponent(token));
ok(`предзагрузка ведёт на страницу с кнопкой: ${prefetch.headers.get('location')}`,
  prefetch.status === 302 && prefetch.headers.get('location').includes(`confirm=${token}`));
ok(`предзагрузка не меняет статус: ${[...rows.values()][0].status}`,
  [...rows.values()][0].status === 'pending');

const conf = await post('/api/newsletter/confirm', { token });
ok(`подтверждение по POST: ${conf.status}`,
  conf.status === 200 && (await conf.json()).result === 'confirmed');
ok(`статус confirmed`, [...rows.values()][0].status === 'confirmed');
ok(`приветственное письмо: «${emails[1]?.subject}»`, emails.length === 2);

// 3. Повторное подтверждение
const again = await post('/api/newsletter/confirm', { token });
ok(`повторное подтверждение: ${(await again.json()).result}`,
  again.status === 200 && (await post('/api/newsletter/confirm', { token }).then((r) => r.status)) === 200);

// 4. Отписка по ссылке из приветственного письма
const unsubLink = emails[1].text.match(/https:\/\/\S+unsubscribe\?token=\S+/)[0];
const unsubToken = new URL(unsubLink).searchParams.get('token');
const unsubPage = await req('/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken));
ok(`ссылка отписки ведёт на страницу: ${unsubPage.headers.get('location')}`,
  unsubPage.headers.get('location').includes(`unsubscribe=${unsubToken}`));
const unsub = await post('/api/newsletter/unsubscribe', { token: unsubToken });
const unsubBody = await unsub.json();
ok(`отписка по POST: ${unsub.status} ${unsubBody.result}`,
  unsub.status === 200 && unsubBody.result === 'unsubscribed');
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
const unknown = await post('/api/newsletter/confirm', { token: 'unknown-token' });
ok(`неизвестный токен: ${unknown.status}`, unknown.status === 404);

// 9. Служебный эндпоинт токена закрыт секретом и отдаёт токен по ключу
// Проба в Actions проходит подтверждение именно через него.
const tokenNoSecret = await req('/api/newsletter/token?email=reader@example.com');
ok(`token без секрета: ${tokenNoSecret.status}`, tokenNoSecret.status === 401);
process.env.CRON_SECRET = 'test-secret';
const tokenWithSecret = await req('/api/newsletter/token?email=reader@example.com', {
  headers: { Authorization: 'Bearer test-secret' },
});
const tokenBody = await tokenWithSecret.json();
ok(`token с секретом: ${tokenWithSecret.status}, статус ${tokenBody.status}`,
  tokenWithSecret.status === 200 && tokenBody.token === rows.get('reader@example.com').token);
const tokenGone = await req('/api/newsletter/token?email=nobody@example.com', {
  headers: { Authorization: 'Bearer test-secret' },
});
ok(`token для чужого адреса: ${tokenGone.status}`, tokenGone.status === 404);
delete process.env.CRON_SECRET;

// 10. Digest закрыт секретом
ok(`digest без секрета: 401`, (await req('/api/newsletter/digest')).status === 401);

// 11. Выпуск: проба одному адресу, защита недели, только новые записи
// Заметки для digest приходят с сайта — подменяем, чтобы прогон не зависел
// от сети. Формат тот же, что отдаёт collectNotes.
const siteNotes = [
  { slug: 'fresh', date: '2099-01-05', titleRu: 'Свежая', titleEn: 'Fresh', dekRu: 'д', dekEn: 'd' },
  { slug: 'older', date: '2099-01-01', titleRu: 'Старая', titleEn: 'Old', dekRu: 'д', dekEn: 'd' },
];
globalThis.fetch = ((inner) => async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === 'masortim.github.io' && url.pathname === '/feed.xml') {
    return new Response(`<rss>${siteNotes.map((n) => `<link>https://masortim.github.io/diary/${n.slug}/?lang=ru</link>`).join('')}</rss>`, { status: 200 });
  }
  if (url.hostname === 'masortim.github.io' && url.pathname.startsWith('/diary/')) {
    const slug = url.pathname.split('/')[2];
    const note = siteNotes.find((n) => n.slug === slug);
    return new Response(
      `<html><p class="note-meta"><span>${note.date}</span></p>`
      + `<h1><span data-language-content="ru">${note.titleRu}</span></h1>`
      + `<p class="note-dek"><span data-language-content="ru">${note.dekRu}</span></p></html>`,
      { status: 200 },
    );
  }
  return inner(input, init);
})(globalThis.fetch);

process.env.CRON_SECRET = 'test-secret';
state.clear();
state.set('digest', { id: 'digest', last_digest_at: null, last_digest_iso_date: null, last_note_date: null });

const beforeTest = emails.length;
const testTo = await req('/api/newsletter/digest?test_to=probe%40example.com', {
  headers: { Authorization: 'Bearer test-secret' },
});
const testBody = await testTo.json();
// Первый выпуск по правилу берёт только самую свежую запись, а не архив.
ok(`проба выпуска: sent=${testBody.sent}, заметок=${(testBody.notes ?? []).length}`,
  testTo.status === 200 && testBody.sent === 1 && (testBody.notes ?? []).length === 1
  && testBody.notes[0].slug === 'fresh');
ok(`проба ушла только на probe@example.com`, emails.length === beforeTest + 1 && emails.at(-1).to?.[0] === 'probe@example.com');
ok(`проба не сдвинула дату выпуска`, !state.get('digest')?.last_digest_at);

// Первый настоящий выпуск — должен уйти и запомнить дату.
rows.clear();
rows.set('real@example.com', {
  email: 'real@example.com', lang: 'ru', status: 'confirmed', token: 'tok',
  created_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), unsubscribed_at: null,
});
const first = await req('/api/newsletter/digest', { headers: { Authorization: 'Bearer test-secret' } });
const firstBody = await first.json();
ok(`первый выпуск: sent=${firstBody.sent}, заметок=${firstBody.notes}`,
  first.status === 200 && firstBody.sent === 1 && firstBody.notes === 1);
ok(`дата выпуска запомнена: ${state.get('digest')?.last_note_date}`,
  state.get('digest')?.last_note_date === '2099-01-05');

// Немедленный повтор — молчит.
const second = await req('/api/newsletter/digest', { headers: { Authorization: 'Bearer test-secret' } });
const secondBody = await second.json();
ok(`повтор в ту же неделю: sent=${secondBody.sent}, reason=${secondBody.reason}`,
  secondBody.sent === 0 && secondBody.reason === 'duplicate_week');

// Через неделю и без новых записей — честное «новых нет», письма нет.
state.set('digest', {
  id: 'digest',
  last_digest_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
  last_note_date: '2099-01-05',
});
const beforeIdle = emails.length;
const idle = await req('/api/newsletter/digest', { headers: { Authorization: 'Bearer test-secret' } });
const idleBody = await idle.json();
ok(`новых заметок нет: reason=${idleBody.reason}`, idleBody.sent === 0 && idleBody.reason === 'no_new_notes');
ok(`письма не отправлены`, emails.length === beforeIdle);
delete process.env.CRON_SECRET;

// 12. CORS preflight
const pre = await req('/api/newsletter/subscribe', { method: 'OPTIONS' });
ok(`preflight: ${pre.status}, origin ${pre.headers.get('access-control-allow-origin')}`,
  pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://masortim.github.io');

console.log(`\nписем за прогон: ${emails.length}, строк в таблице: ${rows.size}`);
