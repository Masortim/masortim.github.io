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
  { name: '__smtp', file: 'newsletter/lib/smtp.mjs' },
  { name: '__subscribers', file: 'newsletter/lib/subscribers.mjs' },
  { name: '__email', file: 'newsletter/lib/email.mjs' },
  { name: '__notes', file: 'newsletter/lib/notes.mjs' },
  { name: '__digest', file: 'newsletter/lib/digest.mjs' },
  { name: '__subscribeApi', file: 'api/newsletter/subscribe.mjs' },
  { name: '__confirmApi', file: 'api/newsletter/confirm.mjs' },
  { name: '__unsubscribeApi', file: 'api/newsletter/unsubscribe.mjs' },
  { name: '__digestApi', file: 'api/newsletter/digest.mjs' },
  { name: '__tokenApi', file: 'newsletter/edge/token-handler.mjs' },
];

/**
 * Карта «файл → имя IIFE»: нужна, чтобы импорт одного модуля из другого
 * превратился в обращение к уже собранному блоку. Без этого `__email`
 * внутри своей обёртки не увидел бы `sendViaSmtp` из `__smtp`.
 */
const BY_FILE = new Map(MODULES.map((mod) => [mod.file, mod.name]));

/** Переводит относительный путь импорта в путь от корня репозитория. */
function resolveImport(fromFile, spec) {
  const base = fromFile.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '..') base.pop();
    else if (part !== '.') base.push(part);
  }
  return base.join('/');
}

const IMPORT_RE = /^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

/**
 * Готовит тело модуля к вставке внутрь IIFE: снимает import/export,
 * собирает имена экспортов, чтобы вернуть их из обёртки.
 */
function transformModule(source, file) {
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
  // Встроенные модули Node (node:net, node:tls, node:crypto) должны остаться
  // импортами: их нельзя «вставить» в бандл, но и вырезать нельзя — функция
  // упала бы с «X is not defined» уже на платформе. Разбираем их ПЕРВЫМИ,
  // иначе правило для соседних модулей примет их за свои и выбросит.
  const builtins = [];
  body = body.replace(/^import\s+(\{[^}]*\}|\w+)\s+from\s+['"](node:[^'"]+)['"];?[ \t]*$/gm, (_, names, spec) => {
    builtins.push(`import ${names} from '${spec}';`);
    return '';
  });
  // Импорты из соседних модулей заменяем на деструктуризацию из их IIFE.
  const bridges = [];
  body = body.replace(/^import\s*\{([^}]*)\}\s*from\s+['"]([^'"]+)['"];?[ \t]*$/gm, (_, list, spec) => {
    const target = BY_FILE.get(resolveImport(file, spec));
    if (!target) return '';
    const wanted = list.split(',').map((part) => part.trim()).filter(Boolean)
      .map((part) => part.replace(/\s+as\s+/, ': '));
    bridges.push(`const { ${wanted.join(', ')} } = ${target};`);
    return '';
  });
  body = body.replace(IMPORT_RE, '');
  return { body: body.trim(), exports: [...names], bridges, builtins };
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
 *   GET  /api/newsletter/token       Authorization: Bearer CRON_SECRET (?email=)
 */`,
  ];

  const collectedBuiltins = [];
  for (const mod of MODULES) {
    const raw = await readFile(resolve(ROOT, mod.file), 'utf8');
    const { body, exports, bridges, builtins } = transformModule(raw, mod.file);
    if (!exports.length) {
      throw new Error(`${mod.file}: не найдено ни одного экспорта — проверьте разметку модуля`);
    }
    chunks.push('');
    chunks.push(`// ─── ${mod.file} ───`);
    // Импорты платформы нельзя держать внутри IIFE — они должны быть на
    // верхнем уровне модуля. Копим их и вставим после шапки файла.
    collectedBuiltins.push(...builtins);
    chunks.push(`const ${mod.name} = (() => {`);
    // Мосты к ранее собранным модулям — до тела, чтобы имена были видны.
    if (bridges.length) chunks.push(...bridges);
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

  // Убираем дубли (node:crypto импортируют два модуля) и ставим в начало.
  const unique = [...new Set(collectedBuiltins)];
  chunks.splice(1, 0, unique.join('\n'));
  return chunks.join('\n');
}

const outIndex = process.argv.indexOf('--out');
const target = outIndex > -1 ? process.argv[outIndex + 1] : resolve(ROOT, 'newsletter/edge/index.mjs');
const code = await build();
await writeFile(target, `${code}\n`, 'utf8');
console.log(`собрано: ${target} (${code.length} байт)`);

// vercel.json для деплоя: только cron. Настройки функции задаются в проекте.
// Воскресенье — штатный выпуск, понедельник — страховка: на бесплатном плане
// Vercel cron срабатывает best-effort и с точностью «в течение часа», поэтому
// воскресный запуск может не состояться. Понедельничный его догоняет, а
// правило «один выпуск в неделю» внутри функции не даёт отправить дважды.
const deployConfig = {
  crons: [
    { path: '/api/newsletter/digest', schedule: '0 9 * * 0' },
    { path: '/api/newsletter/digest', schedule: '0 9 * * 1' },
  ],
};
await writeFile(
  resolve(ROOT, 'newsletter/edge/vercel.json'),
  `${JSON.stringify(deployConfig, null, 2)}\n`,
  'utf8',
);
console.log('собрано: newsletter/edge/vercel.json');
