/**
 * Чтение заметок с сайта для выпусков рассылки.
 *
 * В Vercel-функции нет локальных файлов репозитория, поэтому заметки
 * загружаются по HTTP с самого сайта. Разбор тот же, что у RSS-генератора:
 * h1, note-dek, note-meta — на двух языках.
 */

const NOTE_RE = /href="\/diary\/([\w-]+)\/?"/g;

/** Убирает теги и нормализует пробелы. */
export function toText(html) {
  return String(html)
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

/** Разбирает одну страницу заметки в объект выпуска. */
export function parseNote(slug, html) {
  const meta = pick(html, /<p class="note-meta">([\s\S]*?)<\/p>/);
  const date = toText(pick(meta, /<span>([\s\S]*?)<\/span>/));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const titleBlock = pick(html, /<h1>([\s\S]*?)<\/h1>/);
  const dekBlock = pick(html, /<p class="note-dek">([\s\S]*?)<\/p>/);
  const titleRu = toText(spanByLanguage(titleBlock, 'ru'));
  const dekRu = toText(spanByLanguage(dekBlock, 'ru'));
  if (!titleRu || !dekRu) return null;

  return {
    slug,
    date,
    titleRu,
    titleEn: toText(spanByLanguage(titleBlock, 'en')) || titleRu,
    dekRu,
    dekEn: toText(spanByLanguage(dekBlock, 'en')) || dekRu,
  };
}

/**
 * Список заметок, свежие сверху. Slugs приходят из фида: он собирается из
 * тех же страниц, что и сайт, поэтому список всегда актуален.
 */
export async function collectNotes({ site, limit = 20 } = {}) {
  const base = (site ?? 'https://masortim.github.io').replace(/\/$/, '');
  const feedResponse = await fetch(`${base}/feed.xml`);
  if (!feedResponse.ok) throw new Error(`feed.xml: ${feedResponse.status}`);
  const feed = await feedResponse.text();

  const slugs = [...new Set([...feed.matchAll(NOTE_RE)].map((m) => m[1]))].slice(0, limit);
  const notes = [];
  for (const slug of slugs) {
    const response = await fetch(`${base}/diary/${slug}/`);
    if (!response.ok) continue;
    const note = parseNote(slug, await response.text());
    if (note) notes.push(note);
  }
  return notes.sort((a, b) => (a.date < b.date ? 1 : -1));
}

<!-- probe trigger -->
