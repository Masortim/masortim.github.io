/**
 * Логика еженедельного выпуска.
 *
 * Вынесена из обработчика, чтобы правила отправки можно было проверить
 * тестами без сети: что уходит только новое, что в одну неделю выпуск
 * бывает один раз и что пробный прогон не трогает живых подписчиков.
 *
 * Правила:
 *
 *   1. Выпуск — раз в неделю. Если прошлый ушёл меньше семи дней назад,
 *      повторный запуск ничего не отправляет (duplicate_week). Это защита
 *      от двух вещей сразу: от страховочного запуска в понедельник после
 *      удачного воскресного и от повторного срабатывания cron на стороне
 *      Vercel, которое та допускает.
 *
 *   2. В письмо идут только новые записи — свежее даты прошлого выпуска.
 *      Нет ничего нового — письма нет (no_new_notes). Повторять «три
 *      последние» нельзя: подписчик получал один и тот же выпуск дважды.
 *
 *   3. Первый выпуск (истории нет) отправляет только самые свежие записи,
 *      а не весь архив: иначе человеку прилетит письмо про 2021 год.
 *
 *   4. Пробный режим (test_to) отправляет настоящее письмо ровно одному
 *      адресу и не двигает дату выпуска. Так внешняя проверка видит
 *      реальную доставку, а живые подписчики ничего лишнего не получают.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Сколько записей максимум попадает в выпуск. */
const MAX_NOTES = 3;

/** Сколько записей берёт первый выпуск, когда истории ещё нет. */
const FIRST_DIGEST_NOTES = 1;

function toIsoDate(value) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * Решает, что отправить.
 *
 * Возвращает одно из:
 *   { action: 'dry', notes, recipients } — только показать, без отправки;
 *   { action: 'send', notes, recipients, state } — отправить и запомнить state;
 *   { action: 'week', reason: 'duplicate_week' } — в эту неделю уже был выпуск;
 *   { action: 'none', reason: 'no_notes' | 'no_new_notes' | 'no_subscribers' }.
 */
export function planDigest({ notes, subscribers, state, now = new Date(), testTo = '', dryRun = false }) {
  const allNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
  if (!allNotes.length) return { action: 'none', reason: 'no_notes' };

  // Свежие сверху — на это опираются срезы ниже.
  const sorted = [...allNotes].sort((a, b) => (a.date < b.date ? 1 : -1));

  const lastAt = state?.lastDigestAt ? new Date(state.lastDigestAt) : null;
  // Дата прошлого выпуска: колонка ISO-даты надёжнее, чем разбор timestamp.
  // Если её нет (старая строка), выводим из времени отправки.
  const lastDate = toIsoDate(state?.lastNoteDate)
    ?? (lastAt && !Number.isNaN(lastAt.getTime()) ? lastAt.toISOString().slice(0, 10) : null);

  // Пробный прогон: собрать письмо по тем же правилам, но без памяти недели
  // и без изменения состояния.
  if (testTo) {
    const sample = lastDate
      ? sorted.filter((n) => n.date > lastDate).slice(0, MAX_NOTES)
      : sorted.slice(0, FIRST_DIGEST_NOTES);
    // Новых записей нет — всё равно шлём пробу, иначе нечем проверить
    // доставку. Берём самую свежую запись, письмо помечается как пробное.
    const notesForTest = sample.length ? sample : sorted.slice(0, 1);
    return {
      action: 'test',
      notes: notesForTest,
      recipients: [{ email: testTo, lang: 'ru' }],
      state: null,
      sample: !sample.length,
    };
  }

  // Правило недели: повторный запуск в те же семь дней молчит.
  if (lastAt && !Number.isNaN(lastAt.getTime()) && now.getTime() - lastAt.getTime() < WEEK_MS) {
    return { action: 'week', reason: 'duplicate_week', lastDigestAt: lastAt.toISOString() };
  }

  const recipients = Array.isArray(subscribers) ? subscribers : [];
  if (!recipients.length) return { action: 'none', reason: 'no_subscribers' };

  const fresh = lastDate
    ? sorted.filter((n) => n.date > lastDate)
    : sorted.slice(0, FIRST_DIGEST_NOTES);

  if (!fresh.length) {
    return {
      action: 'none',
      reason: lastDate ? 'no_new_notes' : 'no_notes',
      lastNoteDate: lastDate,
      recipients: recipients.length,
    };
  }

  const chosen = fresh.slice(0, MAX_NOTES);
  return {
    action: dryRun ? 'dry' : 'send',
    notes: chosen,
    recipients,
    // Запоминаем самую свежую из отправленных записей: следующая неделя
    // возьмёт только то, что появилось после неё.
    state: {
      lastDigestAt: now.toISOString(),
      lastDigestIsoDate: now.toISOString().slice(0, 10),
      lastNoteDate: chosen[0].date,
    },
  };
}

/** Тексты для разных исходов: без «ошибки» там, где всё в порядке. */
export const DIGEST_REASONS = {
  no_notes: 'заметок для выпуска нет',
  no_new_notes: 'новых заметок нет — письмо не отправлено',
  no_subscribers: 'подписчиков нет — письмо не отправлено',
  duplicate_week: 'выпуск за эту неделю уже отправлен',
};
