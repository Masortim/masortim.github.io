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
    async remove(email) {
      data.subscribers = (data.subscribers ?? []).filter((s) => s.email !== email);
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
 * write() пишет только изменившиеся строки — иначе две одновременные
 * подписки перезаписывали бы друг друга, и одно письмо с подтверждением
 * молча терялось. remove() удаляет строку по адресу.
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

  // Снимок последнего чтения: по нему видно, какие строки изменились.
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
     * Пишет только изменившиеся строки: сравнивает с прошлым чтением.
     * Раньше здесь переписывались все подписчики подряд, поэтому запрос,
     * прочитавший состояние до чужой подписки, затирал её токен — человек
     * получал письмо со ссылкой, которая уже не подтверждала ничего.
     */
    async write(next) {
      const subscribers = Array.isArray(next?.subscribers) ? next.subscribers : [];
      for (const subscriber of subscribers) {
        const row = toRow(subscriber);
        const previous = snapshot.get(row.email);
        const unchanged = previous
          && ['lang', 'status', 'token', 'confirmed_at', 'unsubscribed_at']
            .every((field) => (previous[field] ?? null) === (row[field] ?? null));
        if (unchanged) continue;
        // email — первичный ключ дедупликации; upsert по нему.
        await request(`${TABLE}?on_conflict=email`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([row]),
        });
        snapshot.set(row.email, row);
      }
      return true;
    },

    /** Удаление по адресу — для отписки. */
    async remove(email) {
      const address = String(email ?? '');
      await request(`${TABLE}?email=eq.${encodeURIComponent(address)}`, { method: 'DELETE' });
      snapshot.delete(address);
      return true;
    },
  };
}
