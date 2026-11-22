/**
 * Хранилище подписчиков в Supabase (таблица public.newsletter_subscribers).
 *
 * Почему Supabase, а не файл в GitHub: каждая подписка — это строка в таблице,
 * а не коммит. Нет гонок за файл, нет истории из тысяч коммитов, и всё видно
 * в SQL-редакторе проекта.
 *
 * Таблица закрыта RLS: политик нет, доступ только у service_role. Поэтому
 * ключ живёт исключительно в переменных окружения серверных функций и
 * никогда не попадает в браузер.
 *
 * Если переменные не заданы (локальный запуск, тесты), используется память
 * процесса: сценарии отрабатывают, но между запросами ничего не сохраняется.
 */

const TABLE = 'newsletter_subscribers';

export function createStore(options = {}) {
  const url = options.url ?? process.env.SUPABASE_URL ?? '';
  const key = options.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !key) return createMemoryStore();
  return createSupabaseStore({ url: url.replace(/\/$/, ''), key });
}

/** Память процесса: локальная разработка и тесты. */
function createMemoryStore() {
  let data = { version: 1, subscribers: [] };
  return {
    kind: 'memory',
    async read() {
      return JSON.parse(JSON.stringify(data));
    },
    async write(next) {
      data = JSON.parse(JSON.stringify(next));
      return true;
    },
  };
}

/**
 * Supabase через PostgREST. Интерфейс намеренно повторяет файловое хранилище
 * (read/write одной структуры), чтобы логика в subscribers.mjs не знала,
 * где именно лежат данные.
 *
 * read() отдаёт { version, subscribers } в том же формате, что и раньше;
 * write() применяет разницу: новые записи добавляет, изменённые обновляет.
 */
function createSupabaseStore({ url, key }) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  function toSubscriber(row) {
    return {
      email: row.email,
      lang: row.lang,
      status: row.status,
      token: row.token,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at ?? undefined,
      unsubscribedAt: row.unsubscribed_at ?? undefined,
    };
  }

  function toRow(subscriber) {
    return {
      email: subscriber.email,
      lang: subscriber.lang ?? 'ru',
      status: subscriber.status ?? 'pending',
      token: subscriber.token,
      confirmed_at: subscriber.confirmedAt ?? null,
      unsubscribed_at: subscriber.unsubscribedAt ?? null,
    };
  }

  async function request(path, init = {}) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`supabase ${init.method ?? 'GET'} ${path} failed: ${response.status} ${detail.slice(0, 200)}`);
    }
    return response;
  }

  let snapshot = new Map();

  return {
    kind: 'supabase',

    async read() {
      const response = await request(`${TABLE}?select=*&order=created_at.asc`);
      const rows = await response.json();
      snapshot = new Map(rows.map((row) => [row.email, row]));
      return { version: 1, subscribers: rows.map(toSubscriber) };
    },

    /**
     * Синхронизирует таблицу с переданным состоянием: обновляет существующие
     * строки и добавляет отсутствующие. Удаления не поддерживаются — история
     * подписок остаётся в таблице (статус unsubscribed), это осознанно.
     */
    async write(next) {
      const subscribers = Array.isArray(next?.subscribers) ? next.subscribers : [];
      for (const subscriber of subscribers) {
        const row = toRow(subscriber);
        // email — первичный ключ дедупликации; upsert по нему.
        await request(`${TABLE}?on_conflict=email`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([row]),
        });
      }
      return true;
    },
  };
}
