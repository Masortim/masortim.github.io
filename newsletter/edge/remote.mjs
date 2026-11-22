/**
 * Загрузчик для деплоя без git-интеграции.
 *
 * Обычный путь — `vercel deploy` из каталога `newsletter/edge`: тогда
 * собранный `index.mjs` уезжает целиком. Но если деплой создаётся через
 * API с ограничением на размер поля, передать 38 КБ бандла нельзя.
 *
 * Этот файл решает задачу иначе: при первом запросе он скачивает бандл
 * из репозитория, импортирует его и дальше работает как обычная функция.
 * Версия берётся из ветки `main` (как при git-интеграции) или из SHA
 * в NEWSLETTER_BUNDLE_REF, если нужна жёсткая фиксация.
 *
 * Если GitHub недоступен или отдал не тот файл, функция честно отвечает
 * 503 `bundle_unavailable`, а не 500.
 */

// Что считается прод-версией API. По умолчанию — бандл из `main`:
// ровно то, что уехало бы при обычной git-интеграции Vercel. Нужна
// жёсткая фиксация — задайте NEWSLETTER_BUNDLE_REF с SHA коммита.
const REF = (process.env.NEWSLETTER_BUNDLE_REF ?? 'main').trim();
const REPO = 'Masortim/masortim.github.io';
const PATH = 'newsletter/edge/index.mjs';

let loaded = null;

function unavailable(reason) {
  console.error(`bundle unavailable: ${reason}`);
  return new Response(JSON.stringify({ error: 'bundle_unavailable' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function load() {
  if (loaded) return loaded;
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${PATH}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'masortim-newsletter' } });
  if (!response.ok) throw new Error(`github ${response.status}`);
  const source = await response.text();
  // Дешёвая проверка, что скачали именно бандл, а не страницу ошибки.
  if (!source.includes('newsletter/health') || !source.includes('export default')) {
    throw new Error('unexpected payload');
  }
  const module = await import(`data:text/javascript;utf8,${encodeURIComponent(source)}`);
  if (typeof module.default !== 'function') throw new Error('no default export');
  loaded = module.default;
  return loaded;
}

export default async function handler(request, response) {
  try {
    const run = await load();
    return await run(request, response);
  } catch (error) {
    return unavailable(error && error.message ? error.message : 'unknown');
  }
}
