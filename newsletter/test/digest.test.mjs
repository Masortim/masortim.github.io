/**
 * Правила выпуска: раз в неделю, только новые записи, проба — одному адресу.
 *
 * Тесты закрывают конкретные поломки, которые уже случались:
 *
 *   • один и тот же выпуск ушёл дважды за десять минут (прогоны пробы
 *     45097469793 и 45097687957) — потому что память об отправке не
 *     хранилась нигде;
 *   • «три последние записи» повторялись каждую неделю, даже если новых
 *     не было.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDigest } from '../lib/digest.mjs';

const notes = [
  { slug: 'a', date: '2026-11-20', titleRu: 'A', titleEn: 'A', dekRu: 'a', dekEn: 'a' },
  { slug: 'b', date: '2026-11-10', titleRu: 'B', titleEn: 'B', dekRu: 'b', dekEn: 'b' },
  { slug: 'c', date: '2021-12-28', titleRu: 'C', titleEn: 'C', dekRu: 'c', dekEn: 'c' },
];
const subscribers = [
  { email: 'reader@example.com', lang: 'ru', status: 'confirmed', token: 't' },
];
const empty = { lastDigestAt: null, lastDigestIsoDate: null, lastNoteDate: null };

test('первый выпуск берёт только самую свежую запись, а не весь архив', () => {
  const plan = planDigest({ notes, subscribers, state: empty, now: new Date('2026-11-23T09:00:00Z') });
  assert.equal(plan.action, 'send');
  assert.deepEqual(plan.notes.map((n) => n.slug), ['a']);
  assert.equal(plan.state.lastNoteDate, '2026-11-20');
});

test('через неделю уходит только новая запись', () => {
  const state = {
    lastDigestAt: '2026-11-23T09:00:00Z',
    lastNoteDate: '2026-11-20',
  };
  const withNew = [...notes, { slug: 'd', date: '2026-11-29', titleRu: 'D', titleEn: 'D', dekRu: 'd', dekEn: 'd' }];
  const plan = planDigest({
    notes: withNew,
    subscribers,
    state,
    now: new Date('2026-11-30T09:00:00Z'),
  });
  assert.equal(plan.action, 'send');
  assert.deepEqual(plan.notes.map((n) => n.slug), ['d']);
});

test('повторный запуск на той же неделе молчит', () => {
  const state = { lastDigestAt: '2026-11-23T09:00:00Z', lastNoteDate: '2026-11-20' };
  // Через десять минут — как было в реальности.
  const plan = planDigest({
    notes,
    subscribers,
    state,
    now: new Date('2026-11-23T09:10:00Z'),
  });
  assert.equal(plan.action, 'week');
  assert.equal(plan.reason, 'duplicate_week');
});

test('страховочный запуск в понедельник не дублирует воскресный', () => {
  const sunday = planDigest({ notes, subscribers, state: empty, now: new Date('2026-11-29T09:00:00Z') });
  assert.equal(sunday.action, 'send');
  const monday = planDigest({
    notes,
    subscribers,
    state: sunday.state,
    now: new Date('2026-11-30T09:00:00Z'),
  });
  assert.equal(monday.action, 'week', 'понедельничная страховка продублировала выпуск');
});

test('нет новых записей — письмо не уходит и причина называется честно', () => {
  const state = { lastDigestAt: '2026-11-16T09:00:00Z', lastNoteDate: '2026-11-20' };
  const older = notes.filter((n) => n.date <= '2026-11-20');
  const plan = planDigest({ notes: older, subscribers, state, now: new Date('2026-11-23T09:00:00Z') });
  assert.equal(plan.action, 'none');
  assert.equal(plan.reason, 'no_new_notes');
});

test('нет заметок вовсе — reason=no_notes, а не «нет новых»', () => {
  const plan = planDigest({ notes: [], subscribers, state: empty, now: new Date('2026-11-23T09:00:00Z') });
  assert.equal(plan.action, 'none');
  assert.equal(plan.reason, 'no_notes');
});

test('нет подписчиков — письмо не отправляется', () => {
  const plan = planDigest({ notes, subscribers: [], state: empty, now: new Date('2026-11-23T09:00:00Z') });
  assert.equal(plan.action, 'none');
  assert.equal(plan.reason, 'no_subscribers');
});

test('dry_run показывает план, но ничего не отправляет', () => {
  const plan = planDigest({ notes, subscribers, state: empty, now: new Date('2026-11-23T09:00:00Z'), dryRun: true });
  assert.equal(plan.action, 'dry');
  assert.ok(plan.notes.length > 0);
  // Состояние в плане есть — это «что было бы записано», — но сохраняет его
  // только обработчик и только для action==='send'. Отправки здесь нет.
  assert.deepEqual(plan.recipients.map((r) => r.email), ['reader@example.com']);
});

test('test_to отправляет одному адресу и не трогает дату выпуска', () => {
  const plan = planDigest({
    notes,
    subscribers,
    state: { lastDigestAt: '2026-11-23T09:00:00Z', lastNoteDate: '2026-11-20' },
    now: new Date('2026-11-23T09:10:00Z'),
    testTo: 'probe@example.com',
  });
  assert.equal(plan.action, 'test');
  assert.deepEqual(plan.recipients, [{ email: 'probe@example.com', lang: 'ru' }]);
  assert.equal(plan.state, null, 'проба не должна двигать дату выпуска');
});

test('test_to работает и когда новых записей нет — берёт последнюю как образец', () => {
  const state = { lastDigestAt: '2026-11-16T09:00:00Z', lastNoteDate: '2026-11-20' };
  const plan = planDigest({
    notes: notes.filter((n) => n.date <= '2026-11-20'),
    subscribers,
    state,
    now: new Date('2026-11-23T09:00:00Z'),
    testTo: 'probe@example.com',
  });
  assert.equal(plan.action, 'test');
  assert.equal(plan.sample, true);
  assert.equal(plan.notes.length, 1);
});

test('в выпуск попадает не больше трёх записей', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    slug: `n${i}`,
    date: `2026-11-2${i}`,
    titleRu: `N${i}`,
    titleEn: `N${i}`,
    dekRu: 'd',
    dekEn: 'd',
  }));
  const state = { lastDigestAt: '2026-11-01T09:00:00Z', lastNoteDate: '2026-11-01' };
  const plan = planDigest({ notes: many, subscribers, state, now: new Date('2026-11-30T09:00:00Z') });
  assert.equal(plan.action, 'send');
  assert.equal(plan.notes.length, 3);
  // Берутся самые свежие.
  assert.deepEqual(plan.notes.map((n) => n.slug), ['n5', 'n4', 'n3']);
  assert.equal(plan.state.lastNoteDate, '2026-11-25');
});
