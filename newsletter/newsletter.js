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
      sentAgain: 'Письмо со ссылкой подтверждения отправлено ещё раз — проверьте почту. Если его нет, загляните в «Спам».',
      known: 'Этот адрес уже подтверждён — письма будут приходить. Отписаться можно по ссылке в любом из них.',
      notSent: 'Адрес принят, но письмо отправить не удалось. Попробуйте ещё раз через минуту.',
      failed: 'Не получилось отправить письмо. Попробуйте ещё раз через минуту.',
      offline: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
      confirmed: 'Подписка подтверждена. Спасибо!',
      already: 'Этот адрес уже подтверждён — письма будут приходить.',
      unsubscribed: 'Вы отписаны. Больше писем не будет.',
      invalidToken: 'Ссылка не подошла. Возможно, она устарела — подпишитесь заново.',
      error: 'Что-то пошло не так. Попробуйте позже.',
      network: 'Нет связи с сервером.',
      notConnected: 'Серверная часть рассылки пока не подключена — адрес сохранён не будет.',
      emailPending: 'Адрес принят, но отправка писем ещё настраивается. Подписка оформится, как только почта заработает.',
      confirmQuestion: 'Подтвердить подписку на этом адресе?',
      confirmButton: 'Подтвердить подписку',
      unsubscribeQuestion: 'Отписаться от рассылки на этом адресе?',
      unsubscribeButton: 'Отписаться',
      cancelAnswer: 'Ничего не меняю',
      linkPending: 'Подтверждаю подписку…',
      linkWaiting: 'Связываюсь с сервером — это может занять несколько секунд.',
      rejected: 'Сервер не принял адрес. Проверьте его, пожалуйста.',
    },
    en: {
      invalid: 'That address looks mistyped. Please check it.',
      sending: 'Sending the confirmation email…',
      sent: 'Done. Check your inbox for the confirmation link.',
      sentAgain: 'The confirmation link has been sent again — check your inbox. If it is not there, look in Spam.',
      known: 'This address is already confirmed — the emails will arrive. You can unsubscribe from the link in any of them.',
      notSent: 'The address was accepted, but the email could not be sent. Please try again in a minute.',
      failed: 'The email could not be sent. Please try again in a minute.',
      offline: 'No connection to the server. Check your network and try again.',
      confirmed: 'Subscription confirmed. Thank you!',
      already: 'This address is already confirmed — the emails will arrive.',
      unsubscribed: 'You are unsubscribed. No more emails.',
      invalidToken: 'This link did not work. It may be out of date — please subscribe again.',
      error: 'Something went wrong. Please try again later.',
      network: 'No connection to the server.',
      notConnected: 'The newsletter backend is not connected yet, so the address will not be saved.',
      emailPending: 'The address was accepted, but email delivery is still being set up. Your subscription will complete once it is ready.',
      confirmQuestion: 'Confirm the subscription for this address?',
      confirmButton: 'Confirm subscription',
      unsubscribeQuestion: 'Unsubscribe this address from the newsletter?',
      unsubscribeButton: 'Unsubscribe',
      cancelAnswer: 'Leave it as is',
      linkPending: 'Confirming your subscription…',
      linkWaiting: 'Reaching the server — this may take a few seconds.',
      rejected: 'The server did not accept the address. Please check it.',
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

  /** Ключ запоминания рабочего адреса: чтобы не пробовать битый каждый раз. */
  var BASE_KEY = 'masortim-newsletter-base';

  /**
   * Сколько держим запомненный адрес первым.
   *
   * Раньше он оставался первым навсегда. Это оказалось ловушкой: если у
   * читателя в тот момент не работал основной адрес, запасной запоминался
   * и с тех пор пробовался первым — а запасной это *.vercel.app, который
   * у части провайдеров рвётся на уровне TCP. Страница начинала каждый
   * визит с заведомо мёртвого домена и ждала таймаут.
   *
   * Теперь приоритет запасного живёт пять минут: он нужен, чтобы не
   * биться в сломанный основной адрес во время одного визита, а дальше
   * порядок возвращается к конфигу.
   */
  var BASE_TTL = 5 * 60 * 1000;

  function readBase() {
    try {
      var raw = window.localStorage.getItem(BASE_KEY) || '';
      if (!raw) return '';
      var saved = JSON.parse(raw);
      if (!saved || typeof saved.base !== 'string') return '';
      if (typeof saved.at !== 'number' || Date.now() - saved.at > BASE_TTL) return '';
      return saved.base;
    } catch (error) { return ''; }
  }

  function saveBase(base) {
    try {
      window.localStorage.setItem(BASE_KEY, JSON.stringify({ base: base, at: Date.now() }));
    } catch (error) { /* приватный режим */ }
  }

  /**
   * Адреса API в порядке обхода.
   *
   * Рабочий адрес с прошлого раза идёт первым: если читатель однажды попал
   * на сеть, которая не пропускает *.vercel.app, незачем каждый раз ждать
   * таймаут на нём. Порядок остальных — как в конфиге.
   */
  function apiBases() {
    var list = [];
    var configured = window.NEWSLETTER_API_BASES;
    if (Object.prototype.toString.call(configured) === '[object Array]') {
      for (var i = 0; i < configured.length; i += 1) {
        if (typeof configured[i] === 'string' && configured[i]) list.push(configured[i]);
      }
    } else if (typeof window.NEWSLETTER_API_BASE === 'string' && window.NEWSLETTER_API_BASE) {
      list.push(window.NEWSLETTER_API_BASE);
    }
    var trimmed = [];
    for (var j = 0; j < list.length; j += 1) {
      trimmed.push(list[j].replace(/\/+$/, ''));
    }
    var remembered = readBase();
    if (!remembered) return trimmed;
    var ordered = [];
    for (var k = 0; k < trimmed.length; k += 1) {
      if (trimmed[k] === remembered) ordered.push(trimmed[k]);
    }
    for (var m = 0; m < trimmed.length; m += 1) {
      if (trimmed[m] !== remembered) ordered.push(trimmed[m]);
    }
    return ordered.length ? ordered : trimmed;
  }

  /**
   * Запрос с переходом на следующий адрес.
   *
   * Меняем адрес только при сетевой ошибке (fetch отклонился) или ответе
   * 5xx: 4xx — это осмысленный ответ сервера, его нужно показать как есть.
   * Таймаут свой: у fetch нет встроенного, а провайдер может не прислать
   * RST, а просто проглотить пакеты — тогда без таймаута форма висела бы.
   */
  var REQUEST_TIMEOUT = 12000;

  function fetchOnce(url, options) {
    if (typeof window.AbortController !== 'function') {
      return window.fetch(url, options);
    }
    var controller = new window.AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);
    var config = {};
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) config[key] = options[key];
    }
    config.signal = controller.signal;
    return window.fetch(url, config).then(function (response) {
      window.clearTimeout(timer);
      return response;
    }, function (error) {
      window.clearTimeout(timer);
      throw error;
    });
  }

  function requestWithFailover(bases, path, options) {
    var index = 0;
    function attempt() {
      var base = bases[index];
      return fetchOnce(base + path, options).then(function (response) {
        if (response.status >= 500 && index + 1 < bases.length) {
          index += 1;
          return attempt();
        }
        saveBase(base);
        return response;
      }, function (error) {
        if (index + 1 < bases.length) {
          index += 1;
          return attempt();
        }
        throw error;
      });
    }
    return attempt();
  }

  /** Параметр из адресной строки. */
  function queryParameter(name) {
    var pattern = new RegExp('[?&]' + name + '=([^&]*)');
    var match = pattern.exec(window.location.search || '');
    return match ? decodeURIComponent(match[1]) : '';
  }

  /**
   * Подтверждение и отписка по ссылке из письма.
   *
   * Кнопка в письме ведёт сюда, на страницу сайта, а не на домен функций:
   * домен API у части читателей недоступен (провайдер рвёт соединение), и
   * ссылка из письма не должна от него зависеть. Страница сама зовёт API —
   * тем же путём, что и форма, включая запасной адрес.
   */
  /**
   * Кнопка действия под сообщением: «Подтвердить подписку» или «Отписаться».
   *
   * Раньше страница выполняла действие сразу, едва в адресе появлялся токен.
   * Из-за этого ссылку достаточно было открыть — а такое умеет любой
   * почтовый клиент, который заранее загружает адрес, чтобы показать превью.
   * Стоило такому клиенту прогрузить ссылку, и отписка срабатывала сама:
   * человек нажимал кнопку уже по «мёртвому» токену и получал «ссылка
   * не подошла». Повторное нажатие — то же сообщение, выхода нет.
   *
   * Теперь токен ничего не меняет, пока человек не нажмёт кнопку здесь.
   */
  function showActionButton(label, onPress) {
    if (!notice) return null;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'newsletter-notice-action';
    button.appendChild(document.createTextNode(label));
    button.addEventListener('click', onPress);
    notice.appendChild(document.createElement('br'));
    notice.appendChild(button);
    return button;
  }

  function handleEmailLink() {
    var token = queryParameter('confirm');
    var action = 'confirm';
    if (!token) {
      token = queryParameter('unsubscribe');
      action = 'unsubscribe';
    }
    if (!token) return;

    var texts = MESSAGES[currentLanguage()];
    var bases = apiBases();
    if (!bases.length || typeof window.fetch !== 'function') {
      showNotice(texts.notConnected, 'error');
      return;
    }

    // Шаг 1: спрашиваем, а не действуем. Токен остаётся в адресе — он нужен
    // для шага 2, но сам по себе ничего не меняет.
    showNotice(action === 'confirm' ? texts.confirmQuestion : texts.unsubscribeQuestion, 'info');

    var pressed = showActionButton(
      action === 'confirm' ? texts.confirmButton : texts.unsubscribeButton,
      function () {
        if (pressed && pressed.parentNode) pressed.parentNode.removeChild(pressed);
        runEmailAction(action, token, texts);
      }
    );

    // Отказ тоже должен быть явным: иначе страница с «вопросом» и живым
    // токеном остаётся открытой и путает при обновлении.
    if (pressed) {
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'newsletter-notice-cancel';
      cancel.appendChild(document.createTextNode(texts.cancelAnswer));
      cancel.addEventListener('click', function () {
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        showNotice('', 'info');
        hideNotice();
      });
      notice.appendChild(document.createTextNode(' '));
      notice.appendChild(cancel);
    }
  }

  /** Шаг 2: выполняет действие после явного нажатия. */
  function runEmailAction(action, token, texts) {
    showNotice(texts.linkPending, 'info');
    setBusy(true);
    var slow = window.setTimeout(function () {
      showNotice(texts.linkWaiting, 'info');
    }, 4000);

    requestWithFailover(apiBases(), '/api/newsletter/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),
    }).then(function (response) {
      return response.json().then(function (payload) {
        return { status: response.status, payload: payload };
      });
    }).then(function (result) {
      window.clearTimeout(slow);
      setBusy(false);
      var data = result.payload || {};
      if (result.status !== 200) {
        showNotice(data.error === 'not_found' ? texts.invalidToken : texts.error, 'error');
        return;
      }
      if (data.result === 'confirmed') {
        showNotice(texts.confirmed, 'ok');
      } else if (data.result === 'already') {
        showNotice(texts.already, 'ok');
      } else if (data.result === 'unsubscribed') {
        showNotice(texts.unsubscribed, 'ok');
      } else {
        showNotice(texts.invalidToken, 'error');
      }
      // Токен больше не нужен: убираем его из адреса, чтобы обновление
      // страницы не подтверждало подписку повторно.
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }, function () {
      window.clearTimeout(slow);
      setBusy(false);
      showNotice(texts.offline, 'error');
    });
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

      // Адреса API (см. newsletter/config.js). Пустой список — серверная
      // часть ещё не подключена; сообщаем об этом честно, вместо «нет связи».
      var bases = apiBases();
      if (!bases.length || typeof window.fetch !== 'function') {
        setBusy(false);
        showNotice(texts.notConnected, 'error');
        return;
      }

      requestWithFailover(bases, '/api/newsletter/subscribe', {
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
          // Ответ 200 бывает трёх видов, и обещать письмо во всех случаях
          // нельзя. Подтверждённому адресу сервер письма не шлёт вовсе —
          // иначе повторная подписка уверяла бы, что письмо «пришло»,
          // хотя ничего не отправлялось.
          var payload = result.payload || {};
          if (payload.already === true) {
            // Адрес уже подтверждён: письма не будет, и обещать его нельзя.
            showNotice(texts.known, 'info');
          } else if (payload.sent === false) {
            // Адрес принят, но письмо не ушло — говорим об этом прямо.
            showNotice(texts.notSent, 'error');
          } else if (payload.resent === true) {
            // Первое письмо не дошло: отправили второе, токен прежний.
            showNotice(texts.sentAgain, 'ok');
          } else {
            showNotice(texts.sent, 'ok');
          }
          input.value = '';
        } else if (result.status === 400) {
          showNotice(texts.invalid, 'error');
        } else if (result.payload && result.payload.error === 'email_failed') {
          // Сервер работает и адрес записал, но отправить письмо нечем:
          // не задан ключ почтового сервиса.
          showNotice(texts.emailPending, 'info');
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
  handleEmailLink();
}());
