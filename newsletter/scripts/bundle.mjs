#!/usr/bin/env node
/**
 * Собирает серверную часть рассылки в один файл для Vercel.
 *
 * Зачем: проект на Vercel создан в режиме `framework: node`, где из корня
 * собирается ОДНА функция. Vercel не разворачивает `api/` в отдельные роуты,
 * а коннектор деплоя принимает файлы поштучно. Поэтому модули склеиваются
 * в один самодостаточный `index.mjs`: его видно целиком, он не зависит от
 * структуры каталогов и проверяется локально до отправки.
 *
 * В репозитории источники остаются раздельными — склейка нужна только
 * для артефакта деплоя.
 *
 * Использование: node newsletter/scripts/bundle.mjs [--out путь]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/** Модули в порядке зависимостей. */
const MODULES = [
  { name: '__store', file: 'newsletter/lib/store.mjs' },
  { name: '__subscribers', file: 'newsletter/lib/subscribers.mjs', external: ['node:crypto'] },
  { name: '__email', file: 'newsletter/lib/email.mjs' },
  { name: '__notes', file: 'newsletter/lib/notes.mjs' },
  { name: '__subscribeApi', file: 'api/newsletter/subscribe.mjs' },
  { name: '__confirmApi', file: 'api/newsletter/confirm.mjs' },
  { name: '__unsubscribeApi', file: 'api/newsletter/unsubscribe.mjs' },
  { name: '__digestApi', file: 'api/newsletter/digest.mjs' },
];

const IMPORT_RE = /^import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm;
const EXPORT_FN_RE = /^export\s+(async\s+function|function|const|let)\s+([A-Za-z_$][\w$]*)/gm;

/** Убирает import-строки и префиксы export, собирает список экспортов. */
function stripModule(source) {
  const exports = new Set();
  let body = source.replace(EXPORT_FN_RE, (_, kind, name) => {
    exports.add(name);
    return `${kind.endsWith('function') ? kind : kind} ${name}`;
  });
  body = body.replace(IMPORT_RE, '');
  // Остатки `export { … }` не используются, но пусть не ломают сборку.
  body = body.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  return { body: body.trim(), exports: [...exports] };
}

async function build() {
  const chunks = [];

  chunks.push(`/**
 * Сгенерировано newsletter/scripts/bundle.mjs — не редактировать вручную.
 *
 * Единая функция Vercel: маршрутизация и все обработчики в одном файле.
 * Исходники: api/newsletter/*.mjs и newsletter/lib/*.mjs.
 */
import { randomBytes } from 'node:crypto';
`);

  for (const mod of MODULES) {
    const raw = await readFile(resolve(ROOT, mod.file), 'utf8');
    const { body, exports } = stripModule(raw);
    chunks.push(`// ─── ${mod.file} ───`);
    chunks.push(`const ${mod.name} = (() => {`);
    chunks.push(body);
    chunks.push(`return { ${exports.join(', ')} };`);
    chunks.push(`})();`);
    chunks.push('');
  }

  // Алиасы: короткие имена вместо обращений к пространствам имён.
  chunks.push(`const { createStore } = __store;
const { subscribe, confirm, unsubscribe, confirmedSubscribers } = __subscribers;
const { confirmationEmail, welcomeEmail, digestEmail, send } = __email;
const { collectNotes } = __notes;
const subscribeApi = __subscribeApi;
const confirmApi = __confirmApi;
const unsubscribeApi = __unsubscribeApi;
const digestApi = __digestApi;
`);

  const router = await readFile(resolve(ROOT, 'newsletter/edge/router.mjs'), 'utf8');
  chunks.push(router.replace(/^import[\s\S]*?;?\s*$/gm, '').trim());

  return chunks.join('\n');
}

const outIndex = process.argv.indexOf('--out');
const target = outIndex > -1 ? process.argv[outIndex + 1] : resolve(ROOT, 'newsletter/edge/index.mjs');
const code = await build();
await writeFile(target, `${code}\n`, 'utf8');
console.log(`собрано: ${target} (${code.length} байт)`);

// vercel.json для деплоя: cron и лимит времени единственной функции.
const deployDir = resolve(ROOT, 'newsletter/edge');
// Только cron: настройки функции задаются в проекте Vercel.
const deployConfig = {
  crons: [{ path: '/api/newsletter/digest', schedule: '0 9 * * 0' }],
};
await writeFile(resolve(deployDir, 'vercel.json'), `${JSON.stringify(deployConfig, null, 2)}\n`, 'utf8');
console.log('собрано: vercel.json');
