/*
 * Псевдонимы для роутера.
 *
 * Бандлер вставляет этот блок после модулей: каждый модуль лежит в своей
 * IIFE, поэтому одноимённые константы (SITE есть почти в каждом файле)
 * не конфликтуют. Здесь наружу достаются только нужные имена.
 */

const { createStore } = __store;
const { subscribe, confirm, unsubscribe, confirmedSubscribers } = __subscribers;
const { confirmationEmail, welcomeEmail, digestEmail, send } = __email;
const { collectNotes } = __notes;

const subscribeApi = __subscribeApi;
const confirmApi = __confirmApi;
const unsubscribeApi = __unsubscribeApi;
const digestApi = __digestApi;
