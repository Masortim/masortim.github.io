import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribe, confirm, unsubscribe, confirmedSubscribers, memoryStore, isValidEmail, newToken } from '../lib/subscribers.mjs';
import { confirmationEmail, welcomeEmail, digestEmail } from '../lib/email.mjs';

test('подписка нового адреса требует подтверждения', async () => {
  const store = memoryStore();
  const out = await subscribe({ store, email: 'Reader@Example.COM', lang: 'en' });
  assert.equal(out.action, 'confirm');
  assert.equal(out.subscriber.email, 'reader@example.com');
  assert.equal(out.subscriber.status, 'pending');
  assert.equal(out.subscriber.lang, 'en');
  assert.ok(out.subscriber.token.length > 20);
  // подтверждённых пока нет
  assert.equal((await confirmedSubscribers(store)).length, 0);
});

test('повторная подписка до подтверждения переотправляет письмо', async () => {
  const store = memoryStore();
  await subscribe({ store, email: 'a@b.co', lang: 'ru' });
  const second = await subscribe({ store, email: 'A@B.CO', lang: 'ru' });
  assert.equal(second.action, 'resend');
});

test('подтверждение по токену переводит в confirmed', async () => {
  const store = memoryStore();
  const { subscriber } = await subscribe({ store, email: 'a@b.co', lang: 'ru' });
  const done = await confirm({ store, token: subscriber.token });
  assert.equal(done.result, 'confirmed');
  assert.equal(done.subscriber.status, 'confirmed');
  assert.equal((await confirmedSubscribers(store)).length, 1);
  // повторное подтверждение идемпотентно
  assert.equal((await confirm({ store, token: subscriber.token })).result, 'already');
});

test('подтверждённый адрес при повторной подписке не получает писем', async () => {
  const store = memoryStore();
  const { subscriber } = await subscribe({ store, email: 'a@b.co', lang: 'ru' });
  await confirm({ store, token: subscriber.token });
  assert.equal((await subscribe({ store, email: 'a@b.co' })).action, 'already');
});

test('отписка исключает адрес из рассылки', async () => {
  const store = memoryStore();
  const { subscriber } = await subscribe({ store, email: 'a@b.co', lang: 'ru' });
  await confirm({ store, token: subscriber.token });
  const out = await unsubscribe({ store, token: subscriber.token });
  assert.equal(out.result, 'unsubscribed');
  assert.equal((await confirmedSubscribers(store)).length, 0);
  assert.equal((await unsubscribe({ store, token: subscriber.token })).result, 'already');
});

test('отписавшийся может вернуться, язык обновляется', async () => {
  const store = memoryStore();
  const { subscriber } = await subscribe({ store, email: 'a@b.co', lang: 'ru' });
  await confirm({ store, token: subscriber.token });
  await unsubscribe({ store, token: subscriber.token });
  const back = await subscribe({ store, email: 'a@b.co', lang: 'en' });
  assert.equal(back.action, 'reactivate');
  assert.equal(back.subscriber.lang, 'en');
  assert.equal(back.subscriber.status, 'pending');
});

test('неизвестные токены не подтверждают и не отписывают', async () => {
  const store = memoryStore();
  assert.equal((await confirm({ store, token: 'nope' })).result, 'not_found');
  assert.equal((await unsubscribe({ store, token: 'nope' })).result, 'not_found');
});

test('валидация адресов', () => {
  for (const good of ['a@b.co', 'first.last+tag@mail.example.org']) assert.ok(isValidEmail(good), good);
  for (const bad of ['', 'no-at', 'a@b', 'a@@b.co', 'a b@c.co', 'a@b.c']) assert.ok(!isValidEmail(bad), bad);
});

test('токены уникальны', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(newToken());
  assert.equal(seen.size, 200);
});

test('письма содержат ссылки подтверждения, отписки и записи', () => {
  const c = confirmationEmail({ email: 'a@b.co', lang: 'ru', token: 'T' });
  assert.match(c.subject, /Подтвердите/);
  assert.match(c.text, /\/api\/newsletter\/confirm\?token=T/);
  const en = confirmationEmail({ email: 'a@b.co', lang: 'en', token: 'T' });
  assert.match(en.subject, /Confirm/);

  const w = welcomeEmail({ email: 'a@b.co', lang: 'ru', token: 'T' });
  assert.match(w.text, /\/api\/newsletter\/unsubscribe\?token=T/);

  const d = digestEmail({ email: 'a@b.co', lang: 'en', token: 'T', notes: [{ slug: 'conferences', title: 'An event calendar', dek: 'Shows events.' }] });
  assert.match(d.subject, /new note/i);
  assert.match(d.text, /\/diary\/conferences\/\?lang=en/);
  assert.match(d.html, /An event calendar/);
});

test('HTML в письмах экранируется', () => {
  const d = digestEmail({ email: 'a@b.co', lang: 'ru', token: 'T', notes: [{ slug: 'x', title: '<script>alert(1)</script>', dek: 'ok' }] });
  assert.ok(!d.html.includes('<script>'));
  assert.ok(d.html.includes('&lt;script&gt;'));
});
