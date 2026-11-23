/**
 * Проверка собранного бандла.
 *
 * Зачем отдельно от e2e: `node --check` не ловит повторное объявление
 * `const SITE` в одной области видимости — модуль падает только при
 * загрузке. Именно так сломанная сборка уехала на Vercel и отвечала
 * FUNCTION_INVOCATION_FAILED. Здесь модуль действительно импортируется.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const BUNDLE = resolve(ROOT, 'newsletter/edge/index.mjs');

async function buildBundle() {
  await run('node', [resolve(ROOT, 'newsletter/scripts/bundle.mjs')], { cwd: ROOT });
}

test('бандл собирается', async () => {
  await buildBundle();
  const code = await readFile(BUNDLE, 'utf8');
  assert.ok(code.length > 5000, 'файл подозрительно маленький');
});

test('модуль загружается без ошибок области видимости', async () => {
  await buildBundle();
  // Свежий импорт с кэш-обходом: важен именно факт успешной загрузки.
  const url = `${BUNDLE}?t=${Date.now()}`;
  const module = await import(url);
  assert.equal(typeof module.default, 'function', 'handler должен быть функцией');
});

test('каждый модуль обёрнут в IIFE', async () => {
  await buildBundle();
  const code = await readFile(BUNDLE, 'utf8');
  const wrappers = code.match(/^const __\w+ = \(\(\) => \{$/gm) ?? [];
  // Число берём из списка сборки, а не из константы: новый модуль не должен
  // ломать тест, но и молча потеряться не должен.
  const script = await readFile(resolve(ROOT, 'newsletter/scripts/bundle.mjs'), 'utf8');
  const expected = (script.match(/\{ name: '__/g) ?? []).length;
  assert.equal(wrappers.length, expected, `ожидалось ${expected} обёрток, найдено ${wrappers.length}`);
});

test('каждый модуль начинается с обёртки, а не с голого кода', async () => {
  await buildBundle();
  const code = await readFile(BUNDLE, 'utf8');
  // Каждая секция «// ─── путь ───» должна открывать IIFE, иначе константы
  // модуля попадут в общую область видимости.
  const sections = code.split(/^\/\/ ─── (.+) ───$/m).slice(1);
  assert.ok(sections.length >= 16, `секций: ${sections.length}`);
  for (let i = 0; i < sections.length; i += 2) {
    const file = sections[i];
    const body = sections[i + 1] ?? '';
    assert.match(
      body.trimStart().slice(0, 40),
      /^const __\w+ = \(\(\) => \{/,
      `${file}: секция не обёрнута в IIFE`,
    );
  }
  // Настоящая проверка области видимости — успешный импорт в тесте выше:
  // повторный const в одной области даёт SyntaxError ещё при загрузке.
});

test('корневой обработчик отвечает на все маршруты', async () => {
  await buildBundle();
  const { default: handler } = await import(`${BUNDLE}?t=${Date.now()}`);

  const root = await handler(new Request('https://example.test/'));
  assert.equal(root.status, 200);
  const payload = await root.json();
  assert.equal(payload.endpoints.length, 4);

  const unknown = await handler(new Request('https://example.test/api/newsletter/nope'));
  assert.equal(unknown.status, 404);

  // Самодиагностика должна отвечать и честно говорить, что не готово.
  const health = await handler(new Request('https://example.test/api/newsletter/health'));
  assert.equal(health.status, 200);
  const report = await health.json();
  assert.equal(typeof report.ready, 'boolean');
  assert.ok(Array.isArray(report.blocking));
  assert.equal(typeof report.checks.supabaseUrl, 'boolean');
  // Секреты наружу не отдаются — только признаки наличия.
  assert.ok(!JSON.stringify(report).includes('SUPABASE_SERVICE_ROLE_KEY='));

  // Тестовый режим Resend: resend.dev — общий домен, его нет в списке
  // доменов аккаунта, но письма с него уходят. health не должен считать
  // такой адрес «непроверенным», иначе ready не станет true никогда.
  const saved = { ...process.env };
  Object.assign(process.env, {
    RESEND_API_KEY: 're_test_key',
    NEWSLETTER_FROM: 'Masortim <onboarding@resend.dev>',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  });
  const { default: fresh } = await import(`${BUNDLE}?test=${Date.now()}`);
  const testMode = await (await fresh(new Request('https://example.test/api/newsletter/health'))).json();
  assert.equal(testMode.checks.senderMode, 'test');
  assert.equal(testMode.checks.fromDomainVerified, true);
  assert.equal(testMode.ready, true);
  assert.ok(Array.isArray(testMode.notes) && testMode.notes.some((n) => n.includes('только на адрес владельца')));
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);

  // SMTP: письма уходят с адреса автора, ключ Resend не нужен вовсе.
  {
    const envSaved = { ...process.env };
    Object.assign(process.env, {
      NEWSLETTER_SMTP_PASS: 'app-password',
      NEWSLETTER_FROM: 'Masortim <alex.typeface@gmail.com>',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      RESEND_API_KEY: '',
    });
    const { default: smtpHandler } = await import(`${BUNDLE}?smtp=${Date.now()}`);
    const report = await (await smtpHandler(new Request('https://example.test/api/newsletter/health'))).json();
    assert.equal(report.checks.transport, 'smtp');
    assert.equal(report.checks.smtp.user, 'alex.typeface@gmail.com');
    assert.equal(report.checks.smtp.passSet, true);
    assert.equal(report.ready, true, JSON.stringify(report.blocking));
    assert.match(report.checks.fromAddress, /alex\.typeface@gmail\.com/);
    for (const key of Object.keys(process.env)) {
      if (!(key in envSaved)) delete process.env[key];
    }
    Object.assign(process.env, envSaved);
  }

  // Без ключа почты подписка отвечает 502 — важно, что это не 500:
  // значит разбор тела и валидация адреса прошли.
  const bad = await handler(new Request('https://example.test/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nope', lang: 'ru' }),
  }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'invalid_email');
});
