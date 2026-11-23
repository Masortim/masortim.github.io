/**
 * Проверка сбора заметок для выпуска.
 *
 * Здесь был тихий баг: парсер искал href="/diary/…", а в RSS адрес записи
 * лежит в элементе <link> и записан абсолютно. Список заметок всегда
 * получался пустым, выпуск отвечал «записей нет — рассылать нечего», и
 * ни одно письмо не уходило — при этом ни один тест не падал, потому что
 * notes.mjs не был покрыт вовсе.
 *
 * Тест берёт настоящий feed.xml из репозитория и настоящую страницу
 * заметки, поэтому ловит именно разъезд с реальным форматом.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectNotes, parseNote, toText } from '../lib/notes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Подменяет сеть: отдаёт файлы сайта вместо HTTP. */
function offlineFetch() {
  return async (url) => {
    const path = new URL(url).pathname.replace(/^\/+/, '');
    const file = path.endsWith('/') || path === '' ? `${path}index.html` : path;
    try {
      const body = await readFile(join(ROOT, file), 'utf8');
      return { ok: true, status: 200, text: async () => body };
    } catch {
      return { ok: false, status: 404, text: async () => '' };
    }
  };
}

test('заметки из настоящего feed.xml находятся', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = offlineFetch();
  try {
    const notes = await collectNotes({ site: 'https://masortim.github.io' });
    assert.ok(notes.length > 0, 'список заметок пуст — выпуск нечего отправлять');
    // Свежие сверху.
    const dates = notes.map((n) => n.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    for (const note of notes) {
      assert.match(note.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(note.titleRu, `у ${note.slug} нет заголовка`);
      assert.ok(note.dekRu, `у ${note.slug} нет описания`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('страница заметки разбирается на дату, заголовок и описание', async () => {
  const html = await readFile(join(ROOT, 'diary', 'conferences', 'index.html'), 'utf8');
  const note = parseNote('conferences', html);
  assert.ok(note, 'заметка не разобрана');
  assert.equal(note.slug, 'conferences');
  assert.match(note.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(note.titleRu.length > 3);
  assert.ok(note.dekRu.length > 3);
  assert.ok(note.titleEn.length > 0);
});

test('страница без разметки заметки не выдумывает данные', () => {
  assert.equal(parseNote('broken', '<html><body>ничего</body></html>'), null);
});

test('toText убирает теги и лишние пробелы', () => {
  assert.equal(toText('<p>привет   <b>мир</b></p>'), 'привет мир');
  assert.equal(toText('a&nbsp;&amp;&nbsp;b'), 'a & b');
});
