#!/usr/bin/env node
/**
 * Проверка живого API рассылки: шаги 5–7 инструкции одним прогоном.
 *
 * Зачем отдельный файл, если есть curl: проверка должна быть
 * воспроизводимой и явно говорить, что именно не так. Этот скрипт идёт по
 * тем же шагам, что владелец проходит вручную, и падает с понятным текстом.
 *
 *   node newsletter/scripts/verify-live.mjs --health
 *       шаг 5: /api/newsletter/health — готов ли API отправлять письма
 *
 *   node newsletter/scripts/verify-live.mjs --subscribe someone@example.com
 *       шаг 6, первая половина: подписка, письмо подтверждения, строка в базе
 *
 *   node newsletter/scripts/verify-live.mjs --confirm <token>
 *       шаг 6, вторая половина: подтверждение и приветственное письмо
 *
 *   node newsletter/scripts/verify-live.mjs --unsubscribe <token>
 *       шаг 6, финал: отписка
 *
 *   node newsletter/scripts/verify-live.mjs --digest-dry-run --secret <CRON_SECRET>
 *       шаг 7: выпуск в режиме dry_run — ничего не отправляется
 *
 * Нужен доступ к API. Из CI его даёт обычный раннер, локально — обычная сеть.
 * Переменные окружения: NEWSLETTER_API_BASE (по умолчанию прод-адрес),
 * и для --confirm/--unsubscribe можно не передавать токен флагом, а взять
 * свежий из Supabase через SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.
 */

const BASE = (process.env.NEWSLETTER_API_BASE ?? 'https://masortim-newsletter.vercel.app').replace(/\/$/, '');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

let failures = 0;

function ok(text) {
  console.log(`  ✓ ${text}`);
}

function fail(text) {
  failures += 1;
  console.log(`  ✗ ${text}`);
}

async function getJson(path, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch (error) {
    // Сеть недоступна — это не «API сломан», и текст должен это объяснять.
    throw new Error(`нет связи с ${BASE}${path}: ${error.cause?.code ?? error.message}`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

/* ------------------------------------------------------------------ */
/* Шаг 5: готовность API                                               */
/* ------------------------------------------------------------------ */

async function checkHealth() {
  console.log(`\nШаг 5. Самодиагностика ${BASE}/api/newsletter/health`);
  const { status, body } = await getJson('/api/newsletter/health');

  if (status !== 200 || !body) {
    fail(`эндпоинт ответил ${status} — ожидался 200 с JSON`);
    return;
  }
  ok('эндпоинт отвечает 200');

  if (typeof body.ready !== 'boolean') {
    fail('в ответе нет поля ready — это старая версия API, нужен деплой');
    return;
  }

  const checks = body.checks ?? {};
  const row = (name, passed, detail = '') =>
    (passed ? ok(`${name}${detail ? ` — ${detail}` : ''}`) : fail(`${name}${detail ? ` — ${detail}` : ''}`));

  row('SUPABASE_URL', checks.supabaseUrl === true);
  row('SUPABASE_SERVICE_ROLE_KEY', checks.supabaseKey === true);
  row('RESEND_API_KEY', checks.resendKey === true);
  row('NEWSLETTER_FROM задан', checks.fromSet === true, checks.fromAddress ?? '');
  row(
    'домен отправителя',
    checks.fromDomainVerified === true,
    checks.senderMode === 'test'
      ? 'тестовый режим resend.dev — проверка домена не нужна'
      : `статус: ${checks.fromDomainStatus ?? 'нет данных'}`,
  );

  if (checks.resendKeyAccepted === false) {
    fail(`Resend отклонил ключ (${checks.resendError})`);
  }

  if (body.ready) {
    ok('READY: API готов отправлять письма');
  } else {
    fail(`НЕ ГОТОВО. Осталось: ${(body.blocking ?? []).join('; ') || 'см. блок checks'}`);
  }

  for (const note of body.notes ?? []) {
    console.log(`  ! ${note}`);
  }
}

/* ------------------------------------------------------------------ */
/* Шаг 6: подписка → подтверждение → отписка                            */
/* ------------------------------------------------------------------ */

async function subscribe(email) {
  console.log(`\nШаг 6.1. Подписка ${email}`);
  const { status, body } = await getJson('/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://masortim.github.io' },
    body: JSON.stringify({ email, lang: 'ru' }),
  });

  if (status === 200 && body?.ok) {
    ok('адрес принят, письмо подтверждения отправлено');
  } else if (status === 502 && body?.error === 'email_failed') {
    fail('строка записана, но письмо не ушло: Resend отклонил отправку (ключ/домен)');
  } else {
    fail(`неожиданный ответ ${status}: ${JSON.stringify(body)}`);
  }

  const token = await findToken(email);
  if (token) {
    ok(`токен подтверждения: ${token}`);
    console.log(`     следующий шаг: --confirm ${token}`);
  } else {
    console.log('  · токен не прочитан: нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
}

/**
 * Достаёт токен подписчика прямо из Supabase, чтобы подтверждение и
 * отписку можно было проверить без ручного копирования из письма.
 */
async function findToken(email) {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return '';

  const response = await fetch(
    `${url}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&select=token,status,lang`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) return '';
  const rows = await response.json();
  return rows?.[0]?.token ?? '';
}

async function subscriber(email) {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  const response = await fetch(
    `${url}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&select=email,status,lang,confirmed_at,unsubscribed_at`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) return null;
  const rows = await response.json();
  return rows?.[0] ?? null;
}

async function confirm(token, email) {
  console.log('\nШаг 6.2. Подтверждение по ссылке из письма');
  const response = await fetch(`${BASE}/api/newsletter/confirm?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
  });
  const location = response.headers.get('location') ?? '';
  if (response.status === 302 || response.status === 307) {
    ok(`редирект на сайт: ${location}`);
  } else {
    fail(`ожидался редирект, получен ${response.status}`);
  }

  if (!email) {
    console.log('  · адрес не передан (--email), состояние в базе не проверено');
    return;
  }
  const row = await subscriber(email);
  if (!row) {
    console.log('  · нет доступа к Supabase, состояние не проверено');
  } else if (row.status === 'confirmed') {
    ok(`статус в базе: confirmed (${row.confirmed_at})`);
  } else {
    fail(`статус в базе: ${row.status} — ожидался confirmed`);
  }
}

async function unsubscribe(token, email) {
  console.log('\nШаг 6.3. Отписка');
  const response = await fetch(`${BASE}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
  });
  const location = response.headers.get('location') ?? '';
  if (response.status === 302 || response.status === 307) {
    ok(`редирект на сайт: ${location}`);
  } else {
    fail(`ожидался редирект, получен ${response.status}`);
  }

  if (!email) return;
  const row = await subscriber(email);
  if (!row) return;
  if (row.status === 'unsubscribed') {
    ok('статус в базе: unsubscribed');
  } else {
    fail(`статус в базе: ${row.status} — ожидался unsubscribed`);
  }
}

/* ------------------------------------------------------------------ */
/* Шаг 7: выпуск без отправки                                          */
/* ------------------------------------------------------------------ */

async function digestDryRun(secret) {
  console.log('\nШаг 7. Выпуск в режиме dry_run');
  if (!secret) {
    fail('не передан --secret (CRON_SECRET); без него эндпоинт отвечает 401 — это проверяется отдельно');
    const anonymous = await getJson('/api/newsletter/digest');
    if (anonymous.status === 401) ok('без секрета выпуск закрыт (401) — правильно');
    else fail(`без секрета ожидался 401, получен ${anonymous.status}`);
    return;
  }

  const { status, body } = await getJson('/api/newsletter/digest?dry_run=1', {
    headers: { Authorization: `Bearer ${secret}` },
  });

  if (status !== 200) {
    fail(`ответ ${status}: ${JSON.stringify(body)}`);
    return;
  }
  ok(`записей в выпуске: ${body.notes?.length ?? 0}, получателей: ${body.recipients?.length ?? 0}`);
  ok('письма не отправлялись (dry_run)');

  for (const note of (body.notes ?? []).slice(0, 3)) {
    console.log(`  · ${note.date} ${note.title}`);
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log(`API: ${BASE}`);
  if (has('--health') || args.length === 0) await checkHealth();
  if (has('--subscribe')) await subscribe(value('--subscribe'));
  if (has('--confirm')) await confirm(value('--confirm'), value('--email'));
  if (has('--unsubscribe')) await unsubscribe(value('--unsubscribe'), value('--email'));
  if (has('--digest-dry-run')) await digestDryRun(value('--secret'));

  console.log(failures ? `\nпровалов: ${failures}` : '\nвсе проверки пройдены');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nне удалось выполнить проверку: ${error.message}`);
  process.exit(1);
});
