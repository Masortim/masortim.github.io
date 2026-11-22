#!/usr/bin/env node
/**
 * Отправляет выпуск с новыми записями подтверждённым подписчикам.
 *
 * Запуск вручную:  node newsletter/scripts/send-digest.mjs --dry-run
 *                  node newsletter/scripts/send-digest.mjs --since 2026-11-01
 *
 * В CI: шаг «Send Newsletter Digest» раз в неделю. Записи берутся из тех же
 * страниц diary/<slug>/index.html, что и RSS, поэтому список актуален.
 *
 * --dry-run показывает, что и кому уйдёт, ничего не отправляя и не меняя
 * хранилище. Без флага письма уходят по-настоящему.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from '../lib/store.mjs';
import { confirmedSubscribers } from '../lib/subscribers.mjs';
import { digestEmail, send } from '../lib/email.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIARY = join(ROOT, 'diary');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sinceIndex = args.indexOf('--since');
const since = sinceIndex >= 0 ? args[sinceIndex + 1] : '';

function toText(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : '';
}

function spanByLanguage(block, lang) {
  return pick(block, new RegExp(`<span data-language-content="${lang}"[^>]*>([\\s\\S]*?)<\\/span>`));
}

/** Читает заметки: дата, slug, заголовок и вступление на двух языках. */
async function collectNotes() {
  const notes = [];
  for (const entry of await readdir(DIARY, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(DIARY, entry.name, 'index.html');
    if (!existsSync(file)) continue;
    const html = await readFile(file, 'utf8');
    const meta = pick(html, /<p class="note-meta">([\s\S]*?)<\/p>/);
    const date = toText(pick(meta, /<span>([\s\S]*?)<\/span>/));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const titleBlock = pick(html, /<h1>([\s\S]*?)<\/h1>/);
    const dekBlock = pick(html, /<p class="note-dek">([\s\S]*?)<\/p>/);
    const titleRu = toText(spanByLanguage(titleBlock, 'ru'));
    const titleEn = toText(spanByLanguage(titleBlock, 'en'));
    const dekRu = toText(spanByLanguage(dekBlock, 'ru'));
    const dekEn = toText(spanByLanguage(dekBlock, 'en'));
    if (!titleRu || !dekRu) continue;
    notes.push({ slug: entry.name, date, titleRu, titleEn: titleEn || titleRu, dekRu, dekEn: dekEn || dekRu });
  }
  return notes.sort((a, b) => (a.date < b.date ? 1 : -1));
}

const notes = await collectNotes();
const fresh = since ? notes.filter((n) => n.date >= since) : notes.slice(0, 3);

if (!fresh.length) {
  console.log('send-digest: новых записей нет — выпуск не отправляется.');
  process.exit(0);
}

console.log(`send-digest: записей в выпуске — ${fresh.length}`);
for (const n of fresh) console.log(`  ${n.date}  ${n.slug}  «${n.titleRu}»`);

const store = createStore();
const subscribers = await confirmedSubscribers(store);
console.log(`send-digest: подтверждённых подписчиков — ${subscribers.length} (хранилище: ${store.kind})`);

if (dryRun) {
  console.log('send-digest: --dry-run, письма не отправляются.');
  for (const s of subscribers) console.log(`  → ${s.email} (${s.lang})`);
  process.exit(0);
}

if (!subscribers.length) {
  console.log('send-digest: отправлять некому.');
  process.exit(0);
}

let sent = 0;
const failed = [];
for (const subscriber of subscribers) {
  const lang = subscriber.lang === 'en' ? 'en' : 'ru';
  const message = digestEmail({
    email: subscriber.email,
    lang,
    token: subscriber.token,
    notes: fresh.map((n) => ({
      slug: n.slug,
      title: lang === 'en' ? n.titleEn : n.titleRu,
      dek: lang === 'en' ? n.dekEn : n.dekRu,
    })),
  });
  const result = await send(message);
  if (result.ok) sent += 1;
  else failed.push({ email: subscriber.email, error: result.error });
}

console.log(`send-digest: отправлено ${sent}, ошибок ${failed.length}`);
for (const f of failed) console.error(`  ✗ ${f.email}: ${f.error}`);

// Ненулевой код только если не ушло вообще ничего: частичные сбои Resend
// (один битый адрес) не должны валить еженедельный workflow.
process.exit(sent === 0 && failed.length > 0 ? 1 : 0);
