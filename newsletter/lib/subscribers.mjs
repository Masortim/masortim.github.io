/**
 * Логика списка подписчиков: подписка, подтверждение, отписка.
 *
 * Всё, что не зависит от HTTP, живёт здесь, чтобы API-функции оставались
 * тонкими, а сценарии можно было прогнать тестами без сети.
 */

import { randomBytes } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'ru';
}

export function newToken() {
  return randomBytes(24).toString('base64url');
}

function emptyData() {
  return { version: 1, subscribers: [] };
}

/**
 * Подписка. Возвращает одно из:
 *   { action: 'confirm', subscriber } — новый адрес, нужно письмо с подтверждением;
 *   { action: 'resend', subscriber }  — адрес есть, но не подтверждён, письмо повторяем;
 *   { action: 'already', subscriber } — уже подтверждён, ничего не отправляем;
 *   { action: 'reactivate', subscriber } — был отписан, снова подписался.
 */
export async function subscribe({ store, email, lang, now = new Date() }) {
  const address = normalizeEmail(email);
  if (!isValidEmail(address)) {
    const error = new Error('invalid_email');
    error.code = 'invalid_email';
    throw error;
  }

  const data = (await store.read()) ?? emptyData();
  if (!Array.isArray(data.subscribers)) data.subscribers = [];

  const existing = data.subscribers.find((s) => s.email === address);

  if (!existing) {
    const subscriber = {
      email: address,
      lang: normalizeLanguage(lang),
      status: 'pending',
      token: newToken(),
      createdAt: now.toISOString(),
    };
    data.subscribers.push(subscriber);
    await store.write(data);
    return { action: 'confirm', subscriber };
  }

  // Язык обновляем: читатель мог переключиться на сайте.
  existing.lang = normalizeLanguage(lang);

  if (existing.status === 'confirmed') {
    await store.write(data);
    return { action: 'already', subscriber: existing };
  }

  if (existing.status === 'unsubscribed') {
    existing.status = 'pending';
    existing.token = newToken();
    existing.unsubscribedAt = null;
    await store.write(data);
    return { action: 'reactivate', subscriber: existing };
  }

  // pending: могли не дойти или потерять письмо — отправляем снова,
  // но токен оставляем прежним, чтобы старое письмо тоже работало.
  if (!existing.token) existing.token = newToken();
  await store.write(data);
  return { action: 'resend', subscriber: existing };
}

/**
 * Подтверждение по токену.
 *   { result: 'confirmed', subscriber } | { result: 'already' } | { result: 'not_found' }
 */
export async function confirm({ store, token, now = new Date() }) {
  const data = (await store.read()) ?? emptyData();
  const subscriber = (data.subscribers ?? []).find((s) => s.token === token);
  if (!subscriber) return { result: 'not_found' };

  if (subscriber.status === 'confirmed') {
    return { result: 'already', subscriber };
  }

  subscriber.status = 'confirmed';
  subscriber.confirmedAt = now.toISOString();
  await store.write(data);
  return { result: 'confirmed', subscriber };
}

/**
 * Отписка по токену.
 *   { result: 'unsubscribed', subscriber } | { result: 'already' } | { result: 'not_found' }
 */
export async function unsubscribe({ store, token, now = new Date() }) {
  const data = (await store.read()) ?? emptyData();
  const subscriber = (data.subscribers ?? []).find((s) => s.token === token);
  if (!subscriber) return { result: 'not_found' };

  if (subscriber.status === 'unsubscribed') {
    return { result: 'already', subscriber };
  }

  subscriber.status = 'unsubscribed';
  subscriber.unsubscribedAt = now.toISOString();
  await store.write(data);
  return { result: 'unsubscribed', subscriber };
}

/** Подтверждённые подписчики — единственные, кому уходит выпуск. */
export async function confirmedSubscribers(store) {
  const data = (await store.read()) ?? emptyData();
  return (data.subscribers ?? []).filter((s) => s.status === 'confirmed');
}

export function memoryStore(initial) {
  let data = initial ?? emptyData();
  return {
    kind: 'memory',
    async read() { return JSON.parse(JSON.stringify(data)); },
    async write(next) { data = JSON.parse(JSON.stringify(next)); return true; },
  };
}
