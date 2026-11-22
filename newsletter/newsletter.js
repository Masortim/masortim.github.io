/*
 * Форма подписки на email-рассылку.
 *
 * ВАЖНО: файл на ES5 по той же причине, что diary.js и archive.js:
 * встроенный браузер QuiteRSS — старый QtWebKit, современный синтаксис для
 * него ошибка разбора. Проверяется scripts/check-es5.mjs.
 */
(function () {
  var form = document.querySelector('#newsletter-form');
  var input = document.querySelector('#newsletter-email');
  var submit = document.querySelector('#newsletter-submit');
  var notice = document.querySelector('#newsletter-notice');

  var MESSAGES = {
    ru: {
      invalid: 'Похоже, в адресе опечатка. Проверьте его, пожалуйста.',
      sending: 'Отправляю письмо с подтверждением…',
      sent: 'Готово. Проверьте почту: пришло письмо со ссылкой подтверждения.',
      failed: 'Не получилось отправить письмо. Попробуйте ещё раз через минуту.',
      offline: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
      confirmed: 'Подписка подтверждена. Спасибо!',
      already: 'Этот адрес уже подтверждён — письма будут приходить.',
      unsubscribed: 'Вы отписаны. Больше писем не будет.',
      invalidToken: 'Ссылка не подошла. Возможно, она устарела — подпишитесь заново.',
      error: 'Что-то пошло не так. Попробуйте позже.',
      network: 'Нет связи с сервером.',
    },
    en: {
      invalid: 'That address looks mistyped. Please check it.',
      sending: 'Sending the confirmation email…',
      sent: 'Done. Check your inbox for the confirmation link.',
      failed: 'The email could not be sent. Please try again in a minute.',
      offline: 'No connection to the server. Check your network and try again.',
      confirmed: 'Subscription confirmed. Thank you!',
      already: 'This address is already confirmed — the emails will arrive.',
      unsubscribed: 'You are unsubscribed. No more emails.',
      invalidToken: 'This link did not work. It may be out of date — please subscribe again.',
      error: 'Something went wrong. Please try again later.',
      network: 'No connection to the server.',
    },
  };

  function currentLanguage() {
    return document.documentElement.lang === 'en' ? 'en' : 'ru';
  }

  function showNotice(text, kind) {
    if (!notice) return;
    notice.textContent = text;
    notice.className = 'newsletter-notice newsletter-notice--' + (kind || 'info');
    notice.hidden = false;
  }

  function hideNotice() {
    if (notice) notice.hidden = true;
  }

  function setBusy(busy) {
    if (!submit) return;
    submit.disabled = busy;
    submit.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  /** Сообщения о результате перехода по ссылке из письма (?state=…). */
  function reportState() {
    var search = window.location.search || '';
    if (search.indexOf('state=') === -1) return;
    var match = /[?&]state=([a-z]+)/.exec(search);
    if (!match) return;
    var state = match[1];
    var texts = MESSAGES[currentLanguage()];
    var map = {
      confirmed: ['confirmed', 'ok'],
      already: ['already', 'ok'],
      unsubscribed: ['unsubscribed', 'ok'],
      invalid: ['invalidToken', 'error'],
      error: ['error', 'error'],
    };
    var entry = map[state];
    if (entry) showNotice(texts[entry[0]], entry[1]);
  }

  if (form && input) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = input.value.replace(/^\s+|\s+$/g, '');
      var texts = MESSAGES[currentLanguage()];

      // Проверяем до запроса: пустой или явно битый адрес серверу не нужен.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        showNotice(texts.invalid, 'error');
        input.focus();
        return;
      }

      hideNotice();
      setBusy(true);
      showNotice(texts.sending, 'info');

      // fetch может отсутствовать в старых движках — тогда форма просто
      // отправляется обычным способом, и пользователь видит результат
      // на странице, куда его перенаправит сервер.
      if (typeof window.fetch !== 'function') {
        form.removeEventListener('submit', arguments.callee);
        form.submit();
        return;
      }

      window.fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, lang: currentLanguage() }),
      }).then(function (response) {
        return response.json().then(function (payload) {
          return { status: response.status, payload: payload };
        });
      }).then(function (result) {
        setBusy(false);
        if (result.status === 200) {
          showNotice(texts.sent, 'ok');
          input.value = '';
        } else if (result.status === 400) {
          showNotice(texts.invalid, 'error');
        } else {
          showNotice(texts.failed, 'error');
        }
      }).catch(function () {
        setBusy(false);
        showNotice(texts.offline, 'error');
      });
    });
  }

  // Сообщение зависит от языка — перерисовываем при переключении.
  var languageButtons = document.querySelectorAll('[data-language-choice]');
  for (var i = 0; i < languageButtons.length; i += 1) {
    languageButtons[i].addEventListener('click', function () {
      hideNotice();
      reportState();
    });
  }

  reportState();
}());
