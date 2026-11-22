#!/usr/bin/env node
/**
 * Собирает серверную часть рассылки в один файл для Vercel.
 *
 * Зачем: проект на Vercel создан в режиме `framework: node`, где из корня
 * собирается ОДНА функция. Vercel не разворачивает `api/` в отдельные роуты,
 * а коннектор деплоя принимает файлы поштучно. Поэтому модули склеиваются
 * в один самодостаточный `index.mjs`.
 *
 * Важно: каждый модуль оборачивается в IIFE и возвращает наружу только
 * свои экспорты. Без обёртки одноимённые `const SITE` из разных модулей
 * оказываются в одной области видимости — это SyntaxError, и функция
 * падает уже на платформе.
 *
 * Использование: node newsletter/scripts/bundle.mjs [--out путь]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/** Модули в порядке зависимостей: имя в бандле → файл. */
const MODULES = [
  { name: '__store', file: 'newsletter/lib/store.mjs' },
  { name: '__subscribers', file: 'newsletter/lib/subscribers.mjs' },
  { name: '__email', file: 'newsletter/lib/email.mjs' },
  { name: '__notes', file: 'newsletter/lib/notes.mjs' },
  { name: '__subscribeApi', file: 'api/newsletter/subscribe.mjs' },
  { name: '__confirmApi', file: 'api/newsletter/confirm.mjs' },
  { name: '__unsubscribeApi', file: 'api/newsletter/unsubscribe.mjs' },
  { name: '__digestApi', file: 'api/newsletter/digest.mjs' },
];

const IMPORT_RE = /^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

/**
 * Готовит тело модуля к вставке внутрь IIFE: снимает import/export,
 * собирает имена экспортов, чтобы вернуть их из обёртки.
 */
function transformModule(source) {
  const names = new Set();
  let body = source.replace(EXPORT_DECL_RE, (_, kind, name) => {
    names.add(name);
    return `${kind} ${name}`;
  });
  body = body.replace(EXPORT_LIST_RE, (_, list) => {
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
    return '';
  });
  body = body.replace(IMPORT_RE, '');
  return { body: body.trim(), exports: [...names] };
}

async function build() {
  const chunks = [
    `/**
 * Сгенерировано newsletter/scripts/bundle.mjs — не редактировать вручную.
 *
 * Единая функция Vercel: маршрутизация и все обработчики в одном файле.
 * Исходники: api/newsletter/*.mjs и newsletter/lib/*.mjs.
 *
 * Адреса:
 *   POST /api/newsletter/subscribe   { email, lang }
 *   GET  /api/newsletter/confirm     ?token=
 *   GET  /api/newsletter/unsubscribe ?token=
 *   GET  /api/newsletter/digest      Authorization: Bearer CRON_SECRET
 */
import { randomBytes } from 'node:crypto';`,
  ];

  for (const mod of MODULES) {
    const raw = await readFile(resolve(ROOT, mod.file), 'utf8');
    const { body, exports } = transformModule(raw);
    if (!exports.length) {
      throw new Error(`${mod.file}: не найдено ни одного экспорта — проверьте разметку модуля`);
    }
    chunks.push('');
    chunks.push(`// ─── ${mod.file} ───`);
    chunks.push(`const ${mod.name} = (() => {`);
    chunks.push(body);
    chunks.push('');
    chunks.push(`return { ${exports.join(', ')} };`);
    chunks.push(`})();`);
  }

  // Псевдонимы: внутри роутера имена выглядят как обычные импорты.
  chunks.push('');
  chunks.push(await readFile(resolve(ROOT, 'newsletter/edge/aliases.mjs'), 'utf8'));
  chunks.push('');
  chunks.push(await readFile(resolve(ROOT, 'newsletter/edge/router.mjs'), 'utf8'));

  return chunks.join('\n');
}

const outIndex = process.argv.indexOf('--out');
const target = outIndex > -1 ? process.argv[outIndex + 1] : resolve(ROOT, 'newsletter/edge/index.mjs');
const code = await build();
await writeFile(target, `${code}\n`, 'utf8');
console.log(`собрано: ${target} (${code.length} байт)`);

// vercel.json для деплоя: только cron. Настройки функции задаются в проекте.
const deployConfig = { crons: [{ path: '/api/newsletter/digest', schedule: '0 9 * * 0' }] };
await writeFile(
  resolve(ROOT, 'newsletter/edge/vercel.json'),
  `${JSON.stringify(deployConfig, null, 2)}\n`,
  'utf8',
);
console.log('собрано: newsletter/edge/vercel.json');
