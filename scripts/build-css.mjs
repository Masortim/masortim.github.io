#!/usr/bin/env node
/**
 * Собирает CSS главной и заметок из общих исходников.
 *
 * Зачем. Главная и заметка — разные страницы, но исторически делили два
 * файла стилей. В итоге заметка на телефоне тянула 12 КБ стилей архива,
 * которых на ней нет ни одного, а главная — весь адаптер Tufte для заметок.
 * На медленной мобильной сети это лишние килобайты в критическом пути
 * отрисовки: браузер не покажет страницу, пока не разберёт весь CSS.
 *
 * Что делает. Читает `diary/projects.css` и `diary/diary.css`, раскладывает
 * правила верхнего уровня (и целые @media-блоки) по трём выходным файлам и
 * пишет их:
 *
 *   diary/projects-home.css  — архив: только правила .archive-*, .promo-*,
 *                              .project-card* и общие (.skip-link,
 *                              .visually-hidden, иконки)
 *   diary/diary-home.css     — общие правила из diary.css, нужные главной
 *   diary/projects-note.css  — адаптер Tufte для заметок
 *
 * Правила, нужные обеим страницам (`.fonts-loading`, общий сброс), попадают
 * в оба файла: дублирование в несколько сотен байт дешевле, чем лишний
 * блокирующий запрос.
 *
 * Исходники остаются на месте и не меняются: `diary/projects.css` и
 * `diary/diary.css` по-прежнему подключены к заметкам и к главной — так
 * страница работает и без сборки. Сборка лишь добавляет рядом «нарезанные»
 * файлы, которые подключает CI.
 *
 * Запуск: node scripts/build-css.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Селекторы, по которым правило относят к заметкам. */
const NOTE_TOKENS = [
  '.project-note', 'body.tufte-note', '.note-', 'note-masthead', 'note-controls',
  'note-dek', 'note-meta', 'note-footer', 'note-figure', 'note-sidenote',
  'note-marginnote', 'note-infographic',
];

/** Селекторы архива (главной). */
const ARCHIVE_TOKENS = [
  '.archive', 'project-card', 'project-meta', 'promo', '.project-archive', 'archive-home',
];

/** `body:not(.archive-home)` — правило для заметок, хотя подстрока и обманывает. */
const NOT_ARCHIVE_RE = /:not\(\s*\.archive-home/;

/**
 * Режет файл на правила верхнего уровня вместе с комментариями над ними.
 * Возвращает массив { comment, rule } в порядке следования.
 */
function splitRules(source) {
  const lines = source.split('\n');
  const out = [];
  let i = 0;
  let pending = '';   // комментарий, который относится к следующему правилу

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Комментарий верхнего уровня: копим к следующему правилу.
    if (trimmed.startsWith('/*')) {
      const from = i;
      while (i < lines.length && !lines[i].includes('*/')) i += 1;
      pending += `${lines.slice(from, i + 1).join('\n')}\n`;
      i += 1;
      continue;
    }
    if (trimmed === '') { i += 1; continue; }

    // Заголовок правила: строки до первой `{`. Групповой селектор может
    // занимать несколько строк, поэтому идём вперёд до скобки.
    const headFrom = i;
    while (i < lines.length && !lines[i].includes('{')) i += 1;
    if (i >= lines.length) break;

    // Тело: считаем скобки до баланса 0.
    let depth = 0;
    const bodyFrom = i;
    while (i < lines.length) {
      depth += (lines[i].match(/\{/g) || []).length;
      depth -= (lines[i].match(/\}/g) || []).length;
      if (depth <= 0) break;
      i += 1;
    }
    out.push({
      comment: pending,
      rule: lines.slice(headFrom, i + 1).join('\n'),
    });
    pending = '';
    i += 1;
  }
  if (pending.trim()) out.push({ comment: pending, rule: '' });
  return out;
}

/** Селектор правила (текст до первой `{`), без комментариев. */
function selectorOf(rule) {
  const code = rule.replace(/\/\*[\s\S]*?\*\//g, '');
  const brace = code.indexOf('{');
  return (brace === -1 ? code : code.slice(0, brace)).trim();
}

/** К какому разделу относится один селектор. */
function kindOfSelector(selector) {
  const s = selector.toLowerCase();
  const forNotes = NOT_ARCHIVE_RE.test(s) || NOTE_TOKENS.some((t) => s.includes(t));
  const forArchive = !NOT_ARCHIVE_RE.test(s) && ARCHIVE_TOKENS.some((t) => s.includes(t));
  if (forNotes && forArchive) return 'both';
  if (forNotes) return 'note';
  if (forArchive) return 'archive';
  return 'base';
}

/** К какому разделу относится правило целиком (для @media — по содержимому). */
function kindOfRule(rule) {
  const code = rule.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (code.startsWith('@')) {
    const kinds = new Set();
    for (const m of code.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1].trim();
      if (sel && !sel.startsWith('@') && !sel.startsWith(':')) {
        const k = kindOfSelector(sel);
        if (k !== 'base') kinds.add(k);
      }
    }
    if (kinds.size === 0) return 'base';
    if (kinds.size === 1) return [...kinds][0];
    // Внутри одного @media есть правила для разных страниц (например,
    // prefers-reduced-motion: заметки + промо). Такой блок безопаснее
    // продублировать в оба файла: пара лишних строк дешевле потерянного
    // правила, а дробление @media по селекторам сломало бы порядок.
    return 'both';
  }
  return kindOfSelector(selectorOf(rule));
}

/**
 * Разбивает групповой селектор (`.a, .b, .c { … }`) на отдельные правила,
 * сгруппированные по странице. Без этого группа вида
 *   `.archive-actions .language-switch, .project-note .language-switch { … }`
 * целиком уходила бы в один файл и теряла правила для другой страницы.
 *
 * Возвращает массив { kind, text } — по одному на каждую корзину, в
 * исходном порядке свойств.
 */
function splitGrouped(comment, rule) {
  const code = rule;
  const brace = code.indexOf('{');
  if (brace === -1) return [{ kind: 'base', text: `${comment}${rule}` }];
  const head = code.slice(0, brace);
  const body = code.slice(brace);
  const sels = head.split(',').map((x) => x.trim()).filter(Boolean);
  if (sels.length < 2) return [{ kind: kindOfSelector(head), text: `${comment}${rule}` }];

  const groups = new Map();
  for (const sel of sels) {
    const k = kindOfSelector(sel);
    const key = k === 'both' ? 'both' : k;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sel);
  }
  if (groups.size === 1) {
    const k = [...groups.keys()][0];
    return [{ kind: k, text: `${comment}${rule}` }];
  }
  // комментарий достаётся первой группе, в остальные он не дублируется
  const out = [];
  let first = true;
  for (const [kind, list] of groups) {
    const head2 = list.join(',\n');
    out.push({ kind, text: `${first ? comment : ''}${head2}${body}` });
    first = false;
  }
  return out;
}

/** Раскладывает исходник по корзинам. */
function bucket(source) {
  const res = { base: [], archive: [], note: [], both: [] };
  for (const { comment, rule } of splitRules(source)) {
    if (!rule.trim()) {
      res.base.push(comment.trimEnd());
      continue;
    }
    // Медиазапросы не дробим: их содержимое относится к одной странице целиком
    // либо нужно обеим (общий сброс, prefers-reduced-motion).
    const code = rule.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (code.startsWith('@')) {
      res[kindOfRule(rule)].push(`${comment}${rule}`.trimEnd());
      continue;
    }
    for (const part of splitGrouped(comment, rule)) {
      res[part.kind].push(part.text.trimEnd());
    }
  }
  return res;
}

const HOME_HEADER = `/* Стили главной страницы — СГЕНЕРИРОВАННЫЙ файл, не править руками.

   Источник: diary/projects.css и diary/diary.css. Правьте их, затем
   запускайте \`node scripts/build-css.mjs\` (в CI это делает шаг «Build
   Page Styles»).

   Зачем разделено. Заметка на телефоне тянула 12 КБ стилей архива,
   которых на ней нет ни одного, а главная — весь адаптер Tufte для
   заметок. Теперь каждая страница получает только своё.

   --------------------------------------------------------------------------- */
`;

const NOTE_HEADER = `/* Стили заметок дневника — СГЕНЕРИРОВАННЫЙ файл, не править руками.

   Источник: diary/projects.css и diary/diary.css. Правьте их, затем
   запускайте \`node scripts/build-css.mjs\`.

   --------------------------------------------------------------------------- */
`;

/** Пишет файл из списка кусков. */
async function emit(file, header, parts) {
  const body = parts.filter(Boolean).map((p) => p.trimEnd()).join('\n\n');
  await writeFile(join(ROOT, file), `${header}${body}\n`, 'utf8');
  return { file, bytes: Buffer.byteLength(header + body) };
}

const write = process.argv.includes('--write');

const projectSource = await readFile(join(ROOT, 'diary/projects.css'), 'utf8');
const diarySource = await readFile(join(ROOT, 'diary/diary.css'), 'utf8');

const project = bucket(projectSource);
const diary = bucket(diarySource);

const homeProject = [...project.archive, ...project.base, ...project.both];
const homeDiary = [...diary.archive, ...diary.base, ...diary.both];
const noteProject = [...project.note, ...project.base, ...project.both];
const noteDiary = [...diary.note, ...diary.base, ...diary.both];

if (!write) {
  // Режим проверки: ничего не пишем, только показываем объёмы.
  const size = (parts) => Buffer.byteLength(parts.join('\n\n'));
  console.log(`главная:  projects-home ${size(homeProject)} B + diary-home ${size(homeDiary)} B`);
  console.log(`заметки:  projects-note ${size(noteProject)} B + diary-note ${size(noteDiary)} B`);
  console.log('запустите с --write, чтобы записать файлы');
  process.exit(0);
}

const results = [
  await emit('diary/projects-home.css', HOME_HEADER, homeProject),
  await emit('diary/diary-home.css', HOME_HEADER, homeDiary),
  await emit('diary/projects-note.css', NOTE_HEADER, noteProject),
  await emit('diary/diary-note.css', NOTE_HEADER, noteDiary),
];

for (const r of results) console.log(`✓ ${r.file} — ${r.bytes} B`);
