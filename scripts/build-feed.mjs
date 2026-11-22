#!/usr/bin/env node
/**
 * Собирает RSS-фид дневника из HTML-страниц заметок.
 *
 * Источник правды — сами страницы `diary/<slug>/index.html`. Скрипт не требует
 * ручного списка записей: любая новая заметка с корректной разметкой попадёт
 * в фид при следующей сборке (в CI — на каждый пуш в main).
 *
 * Из каждой заметки берётся:
 *   - <title>                         → заголовок пункта (для уведомлений);
 *   - <h1> (RU)                       → заголовок записи;
 *   - <p class="note-dek"> (RU)       → описание;
 *   - <p class="note-meta"><span>дата  → дата публикации;
 *   - ссылка на GitHub (если есть)    → в <description>.
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
const FEED_DESC = 'Заметки о проектах, инструментах и решениях в процессе разработки. / Notes on projects, tools, and decisions made while building.';
const FEED_LANG = 'ru';
const AUTHOR = 'Masortim';
const MAX_ITEMS = 20;

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

/** Читает одну заметку и превращает её в объект пункта фида. */
function parseNote(slug, html) {
  const titleRu = toText(pick(html, /<h1><span data-language-content="ru">([\s\S]*?)<\/span>/));
  const titleEn = toText(pick(html, /<h1><span data-language-content="en"[^>]*>([\s\S]*?)<\/span>/));
  const dekRu = toText(pick(html, /<p class="note-dek"><span data-language-content="ru">([\s\S]*?)<\/span>/));
  const dekEn = toText(pick(html, /<p class="note-dek"><span data-language-content="en"[^>]*>([\s\S]*?)<\/span>/));
  const metaRaw = pick(html, /<p class="note-meta">([\s\S]*?)<\/p>/);
  const metaSpans = [...metaRaw.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => toText(m[1]));
  const dateRaw = metaSpans[0] || '';
  const stack = metaSpans[1] || '';
  const repo = pick(metaRaw, /<a href="([^"]+)"/);

  if (!titleRu || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return null;

  const url = `${SITE}/diary/${slug}/`;
  const descriptionParts = [dekRu];
  if (stack) descriptionParts.push(`Стек: ${stack}.`);
  if (repo) descriptionParts.push(`Репозиторий: ${repo}`);

  return {
    slug,
    titleRu,
    titleEn,
    url,
    date: dateRaw,
    // Полдень UTC, чтобы дата не «съезжала» в соседний день при любом часовом поясе.
    pubDate: new Date(`${dateRaw}T12:00:00Z`),
    description: descriptionParts.filter(Boolean).join(' '),
    stack,
    repo,
  };
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

function buildFeed(notes) {
  const items = notes.slice(0, MAX_ITEMS);

  const lastBuild = items.length ? rfc822(items[0].pubDate) : rfc822(new Date());

  const itemXml = items
    .map((note) => {
      const title = note.titleEn
        ? `${note.titleRu} / ${note.titleEn}`
        : note.titleRu;
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
        `      <description>${escapeXml(note.description)}</description>`,
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
    <title>${escapeXml(FEED_TITLE_RU)}</title>
    <link>${escapeXml(`${SITE}/`)}</link>
    <description>${escapeXml(FEED_DESC)}</description>
    <language>${FEED_LANG}</language>
    <managingEditor>${escapeXml(AUTHOR)}</managingEditor>
    <webMaster>${escapeXml(AUTHOR)}</webMaster>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>scripts/build-feed.mjs</generator>
    <atom:link href="${escapeXml(`${SITE}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${escapeXml(`${SITE}/feed-icon.svg`)}</url>
      <title>${escapeXml(FEED_TITLE_RU)}</title>
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
  console.error('build-feed: не найдено ни одной заметки с корректной разметкой — фид не создан.');
  process.exit(1);
}

await writeFile(join(ROOT, 'feed.xml'), buildFeed(notes), 'utf8');

console.log(`build-feed: записей в фиде — ${Math.min(notes.length, MAX_ITEMS)} из ${notes.length}`);
console.log(`build-feed: самая свежая запись — ${notes[0].date} (${notes[0].slug})`);
if (skipped.length) {
  console.warn(`build-feed: пропущены каталоги без нужной разметки — ${skipped.join(', ')}`);
}
