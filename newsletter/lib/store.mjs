/**
 * Хранилище подписчиков.
 *
 * Хранить список адресов в публичном репозитории нельзя, поэтому источник
 * правды — приватный GitHub-репозиторий с одним файлом subscribers.json.
 * Доступ идёт через Contents API тем же токеном, что у Actions (GITHUB_TOKEN
 * scope «repo» не выдаётся автоматически, поэтому нужен PAT в секрете
 * NEWSLETTER_STORE_TOKEN).
 *
 * Формат файла:
 *   { "version": 1, "subscribers": [
 *       { "email": "...", "lang": "ru", "status": "pending|confirmed|unsubscribed",
 *         "token": "...", "createdAt": "...", "confirmedAt": "...", "unsubscribedAt": "..." }
 *   ] }
 *
 * Если хранилище не настроено (локальный запуск, тесты), используется
 * память процесса — этого достаточно, чтобы отработать сценарии.
 */

const API = 'https://api.github.com';

export function createStore(options = {}) {
  const repo = options.repo ?? process.env.NEWSLETTER_STORE_REPO ?? '';
  const token = options.token ?? process.env.NEWSLETTER_STORE_TOKEN ?? '';
  const path = options.path ?? process.env.NEWSLETTER_STORE_PATH ?? 'subscribers.json';
  const branch = options.branch ?? process.env.NEWSLETTER_STORE_BRANCH ?? 'main';

  if (!repo || !token) return createMemoryStore();

  return createGitHubStore({ repo, token, path, branch });
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

/** Приватный репозиторий через Contents API. */
function createGitHubStore({ repo, token, path, branch }) {
  const base = `${API}/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'masortim-newsletter',
  };

  async function readRaw() {
    const response = await fetch(`${base}?ref=${encodeURIComponent(branch)}`, { headers });
    if (response.status === 404) return { data: { version: 1, subscribers: [] }, sha: null };
    if (!response.ok) throw new Error(`store read failed: ${response.status}`);
    const payload = await response.json();
    const text = Buffer.from(payload.content, 'base64').toString('utf8');
    return { data: JSON.parse(text), sha: payload.sha };
  }

  return {
    kind: 'github',
    async read() {
      const { data } = await readRaw();
      return data;
    },
    async write(next) {
      const { sha } = await readRaw();
      const body = {
        message: `newsletter: обновление списка подписчиков (${new Date().toISOString()})`,
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8').toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      };
      const response = await fetch(base, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`store write failed: ${response.status}`);
      return true;
    },
  };
}
