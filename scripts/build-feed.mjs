#!/usr/bin/env node
/**
 * Собирает два RSS-фида дневника из HTML-страниц заметок: русский и английский.
 *
 * Источник правды — сами страницы `diary/<slug>/index.html`. Скрипт не требует
 * ручного списка записей: любая новая заметка с корректной разметкой попадёт
 * в оба фида при следующей сборке (в CI — на каждый пуш в main).
 *
 * Из каждой заметки берётся:
 *   - <h1> (RU и EN)                 → заголовок записи;
 *   - <p class="note-dek"> (RU и EN)  → описание;
 *   - <p class="note-meta"><span>дата  → дата публикации;
 *   - ссылка на GitHub (если есть)    → в <description>.
 *
 * Результат: `feed.xml` (RU) и `feed-en.xml` (EN). Заметка попадает в фид,
 * только если у неё есть заголовок и вступление на нужном языке, — поэтому
 * частично переведённые записи не просачиваются в чужой фид.
 *
 * Запуск: node scripts/build-feed.mjs [--site https://masortim.github.io]
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIARY_DIR = join(ROOT, 'diary');

const args = process.argv.slice(2);
const siteArgIndex = args.indexOf('--site');
const SITE = (siteArgIndex >= 0 ? args[siteArgIndex + 1] : 'https://masortim.github.io').replace(/\/$/, '');

const FEED_TITLE_RU = 'Дневник разработчика · Masortim';
const FEED_TITLE_EN = 'Developer Diary · Masortim';
const AUTHOR = 'Masortim';
const MAX_ITEMS = 20;

/** Описание каждого фида: одно на язык, без смешения. */
const FEEDS = [
  {
    lang: 'ru',
    file: 'feed.xml',
    title: FEED_TITLE_RU,
    description: 'Заметки о проектах, инструментах и решениях в процессе разработки.',
    stackPrefix: 'Стек',
    repoPrefix: 'Репозиторий',
  },
  {
    lang: 'en',
    file: 'feed-en.xml',
    title: FEED_TITLE_EN,
    description: 'Notes on projects, tools, and decisions made while building.',
    stackPrefix: 'Stack',
    repoPrefix: 'Repository',
  },
];

/** Декодирует HTML-сущности, которые могут встречаться в тексте заметки. */
function decodeEntities(input) {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Убирает теги и нормализует пробелы: в фиде нужен чистый текст. */
function toText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Экранирует текст для XML. */
function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Достаёт первое совпадение по регулярному выражению или пустую строку. */
function pick(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : '';
}

/** Возвращает содержимое <span data-language-content="lang"> внутри блока. */
function spanByLanguage(block, lang) {
  const regex = new RegExp(`<span data-language-content="${lang}"[^>]*>([\\s\\S]*?)<\\/span>`);
  return pick(block, regex);
}

/** Читает одну заметку и превращает её в объект пункта фида. */
function parseNote(slug, html) {
  // В разметке RU- и EN-варианты лежат рядом внутри одного <h1>/<p>, поэтому
  // сначала находим сам блок, а уже в нём — нужный языковой <span>.
  const titleRu = toText(spanByLanguage(pick(html, /<h1>([\s\S]*?)<\/h1>/), 'ru'));
  const titleEn = toText(spanByLanguage(pick(html, /<h1>([\s\S]*?)<\/h1>/), 'en'));
  const dekBlock = pick(html, /<p class="note-dek">([\s\S]*?)<\/p>/);
  const dekRu = toText(spanByLanguage(dekBlock, 'ru'));
  const dekEn = toText(spanByLanguage(dekBlock, 'en'));
  const metaRaw = pick(html, /<p class="note-meta">([\s\S]*?)<\/p>/);
  const metaSpans = [...metaRaw.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => toText(m[1]));
  const dateRaw = metaSpans[0] || '';
  const stack = metaSpans[1] || '';
  const repo = pick(metaRaw, /<a href="([^"]+)"/);

  if (!titleRu || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return null;

  const url = `${SITE}/diary/${slug}/`;

  return {
    slug,
    url,
    titleRu,
    titleEn,
    dekRu,
    dekEn,
    date: dateRaw,
    // Полдень UTC, чтобы дата не «съезжала» в соседний день при любом часовом поясе.
    pubDate: new Date(`${dateRaw}T12:00:00Z`),
    stack,
    repo,
  };
}

/**
 * Описание пункта на языке фида. EN-запись попадает в английский фид, только
 * если у неё есть и заголовок, и вступление: иначе лучше не показывать запись
 * совсем, чем смешивать языки в одном канале.
 */
function describe(note, feed) {
  const title = feed.lang === 'en' ? note.titleEn : note.titleRu;
  const dek = feed.lang === 'en' ? note.dekEn : note.dekRu;
  if (!title || !dek) return null;

  const parts = [dek];
  if (note.stack) parts.push(`${feed.stackPrefix}: ${note.stack}.`);
  if (note.repo) parts.push(`${feed.repoPrefix}: ${note.repo}`);
  return { title, description: parts.join(' ') };
}

/** Читает все заметки из diary/<slug>/index.html. */
async function collectNotes() {
  const entries = await readdir(DIARY_DIR, { withFileTypes: true });
  const notes = [];
  const skipped = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(DIARY_DIR, entry.name, 'index.html');
    if (!existsSync(file)) continue;

    const html = await readFile(file, 'utf8');
    const note = parseNote(entry.name, html);
    if (note) notes.push(note);
    else skipped.push(entry.name);
  }

  notes.sort((a, b) => b.pubDate - a.pubDate || a.slug.localeCompare(b.slug));
  return { notes, skipped };
}

/** RFC 822: формат даты, обязательный для RSS 2.0. */
function rfc822(date) {
  return date.toUTCString();
}

function buildFeed(notes, feed) {
  const items = notes
    .map((note) => {
      const described = describe(note, feed);
      return described ? { note, ...described } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_ITEMS);

  if (!items.length) return null;

  const lastBuild = rfc822(items[0].note.pubDate);

  const itemXml = items
    .map(({ note, title, description }) => {
      const categories = note.stack
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `      <category>${escapeXml(s)}</category>`)
        .join('\n');

      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(note.url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(note.url)}</guid>`,
        `      <pubDate>${rfc822(note.pubDate)}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        categories,
        '    </item>',
      ]
        .filter((line) => line !== '')
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <link>${escapeXml(`${SITE}/`)}</link>
    <description>${escapeXml(feed.description)}</description>
    <language>${feed.lang}</language>
    <managingEditor>${escapeXml(AUTHOR)}</managingEditor>
    <webMaster>${escapeXml(AUTHOR)}</webMaster>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>scripts/build-feed.mjs</generator>
    <atom:link href="${escapeXml(`${SITE}/${feed.file}`)}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${escapeXml(`${SITE}/feed-icon.svg`)}</url>
      <title>${escapeXml(feed.title)}</title>
      <link>${escapeXml(`${SITE}/`)}</link>
    </image>
    <copyright>© ${new Date().getFullYear()} ${escapeXml(AUTHOR)}</copyright>
${itemXml}
  </channel>
</rss>
`;
}

const { notes, skipped } = await collectNotes();

if (!notes.length) {
  console.error('build-feed: не найдено ни одной заметки с корректной разметкой — фиды не созданы.');
  process.exit(1);
}

for (const feed of FEEDS) {
  const xml = buildFeed(notes, feed);
  if (!xml) {
    console.warn(`build-feed: для «${feed.lang}» нет заметок с заголовком и вступлением — ${feed.file} не создан.`);
    continue;
  }
  await writeFile(join(ROOT, feed.file), xml, 'utf8');
  const count = Math.min(notes.filter((n) => describe(n, feed)).length, MAX_ITEMS);
  console.log(`build-feed: ${feed.file} (${feed.lang}) — записей ${count}`);
}

console.log(`build-feed: самая свежая запись — ${notes[0].date} (${notes[0].slug})`);
if (skipped.length) {
  console.warn(`build-feed: пропущены каталоги без нужной разметки — ${skipped.join(', ')}`);
}
