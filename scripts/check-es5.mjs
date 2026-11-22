#!/usr/bin/env node
/**
 * Проверяет, что скрипты дневника разбираются как ES5.
 *
 * Зачем: встроенный браузер RSS-ридера QuiteRSS — это старый QtWebKit.
 * Современный синтаксис (`?.`, стрелочные функции, `async/await`, `let`)
 * для него ошибка разбора, и тогда файл не выполняется целиком: страница
 * из английского фида открывалась на русском, потому что переключение
 * языка живёт в diary.js.
 *
 * Проверка идёт настоящим парсером (acorn), а не регулярными выражениями:
 * регулярки путаются на словах в комментариях и строках.
 *
 * Запуск: node scripts/check-es5.mjs
 * Зависимость acorn берётся из graph/node_modules (там её ставит `npm ci`).
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['diary/diary.js', 'diary/archive.js', 'newsletter/newsletter.js', 'newsletter/config.js'];

const require = createRequire(import.meta.url);
let acorn;
try {
  acorn = require('../graph/node_modules/acorn');
} catch {
  acorn = require('acorn');
}

let failed = false;
for (const file of FILES) {
  const source = await readFile(join(ROOT, file), 'utf8');
  try {
    acorn.parse(source, { ecmaVersion: 5, sourceType: 'script' });
    console.log(`✓ ${file}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${file}: не ES5 — ${error.message}`);
  }
}

if (failed) {
  console.error('check-es5: QuiteRSS (QtWebKit) не выполнит эти файлы, и переключение языка не сработает.');
  process.exit(1);
}
