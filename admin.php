<?php
session_start();
require_once 'functions.php';

// ===== ФУНКЦИИ БЕЗОПАСНОСТИ (блокировка IP) =====
function getSecurityData() {
    $file = __DIR__ . '/security_data.json';
    if (!file_exists($file)) {
        return ['blocked_ips' => [], 'attempts' => []];
    }
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    if (!is_array($data)) {
        return ['blocked_ips' => [], 'attempts' => []];
    }
    if (!isset($data['blocked_ips'])) $data['blocked_ips'] = [];
    if (!isset($data['attempts'])) $data['attempts'] = [];
    return $data;
}

function saveSecurityData($data) {
    $file = __DIR__ . '/security_data.json';
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

function isIpBlocked($ip) {
    $data = getSecurityData();
    return in_array($ip, $data['blocked_ips']);
}

function getAttempts($ip) {
    $data = getSecurityData();
    return isset($data['attempts'][$ip]) ? $data['attempts'][$ip] : 0;
}

function incrementAttempts($ip) {
    $data = getSecurityData();
    $data['attempts'][$ip] = ($data['attempts'][$ip] ?? 0) + 1;
    if ($data['attempts'][$ip] >= 3) {
        $data['blocked_ips'][] = $ip;
        unset($data['attempts'][$ip]);
    }
    saveSecurityData($data);
    return $data['attempts'][$ip] ?? 0;
}

function resetAttempts($ip) {
    $data = getSecurityData();
    unset($data['attempts'][$ip]);
    saveSecurityData($data);
}

$data = getData();
$isAuth = isset($_SESSION['auth']) && $_SESSION['auth'] === true;

// Обработка POST-запросов
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_GET['action'] ?? '';
    if ($action === 'login') {
        $ip = $_SERVER['REMOTE_ADDR'];
        if (isIpBlocked($ip)) {
            echo json_encode(['success' => false, 'error' => 'Ваш IP-адрес заблокирован за превышение числа попыток входа.']);
            exit;
        }
        $password = $_POST['password'] ?? '';
        if (checkAuth($password)) {
            $_SESSION['auth'] = true;
            resetAttempts($ip);
            echo json_encode(['success' => true]);
        } else {
            incrementAttempts($ip);
            echo json_encode(['success' => false, 'error' => 'Неверный пароль']);
        }
        exit;
    }

    if (!$isAuth) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    // ===== НОВЫЙ ОБРАБОТЧИК СМЕНЫ ПАРОЛЯ =====
    if ($action === 'change_password') {
        $current = $_POST['current'] ?? '';
        $new = $_POST['new'] ?? '';

        if (empty($current) || empty($new)) {
            echo json_encode(['success' => false, 'error' => 'Все поля обязательны']);
            exit;
        }

        if (!checkAuth($current)) {
            echo json_encode(['success' => false, 'error' => 'Неверный текущий пароль']);
            exit;
        }

        if (strlen($new) < 4) {
            echo json_encode(['success' => false, 'error' => 'Новый пароль должен быть не короче 4 символов']);
            exit;
        }

        $newHash = password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]);
        $data = getData();
        $data['admin']['passwordHash'] = $newHash;
        saveData($data);

        echo json_encode(['success' => true]);
        exit;
    }

    // ===== ИСПРАВЛЕННЫЙ ОБРАБОТЧИК СОХРАНЕНИЯ =====
    if ($action === 'save') {
        $json = file_get_contents('php://input');
        $newData = json_decode($json, true);
        if ($newData !== null) {
            // 1. Берём текущие данные с сервера, чтобы извлечь хеш пароля
            $currentData = getData();
            $currentPasswordHash = $currentData['admin']['passwordHash'] ?? null;

            // 2. Удаляем passwordHash из данных клиента (безопасность)
            if (isset($newData['admin'])) {
                unset($newData['admin']['passwordHash']);
            }

            // 3. Восстанавливаем хеш пароля из текущих данных
            if ($currentPasswordHash !== null) {
                if (!isset($newData['admin'])) {
                    $newData['admin'] = [];
                }
                $newData['admin']['passwordHash'] = $currentPasswordHash;
            }

            // 4. Сохраняем
            saveData($newData);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
        }
        exit;
    }

    if ($action === 'upload') {
        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $path = uploadImage($_FILES['file']);
            if ($path) {
                echo json_encode(['success' => true, 'path' => $path]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Ошибка загрузки изображения']);
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Файл не загружен']);
        }
        exit;
    }
}

if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_destroy();
    header('Location: /admin');
    exit;
}

// Если не авторизован – показываем форму логина
if (!$isAuth) {
    $ip = $_SERVER['REMOTE_ADDR'];
    $isBlocked = isIpBlocked($ip);
    if ($isBlocked) {
        ?>
        <!DOCTYPE html>
        <html lang="ru">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Доступ заблокирован</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family: 'Roboto', sans-serif; background: #0d0d0d; display: flex; align-items: center; justify-content: center; min-height: 100vh; color: #f0f0f0; }
            .blocked-box { background: #2a2a2a; border: 1px solid #444; border-radius: 16px; padding: 48px 40px; width: 100%; max-width: 400px; text-align: center; }
            .blocked-box h1 { font-family: 'Oswald', sans-serif; font-size: 28px; margin-bottom: 8px; color: #e63946; }
            .blocked-box p { color: #aaa; margin-bottom: 20px; font-size: 14px; }
            .blocked-box .lock-icon { font-size: 48px; margin-bottom: 16px; }
        </style>
        </head>
        <body>
            <div class="blocked-box">
                <div class="lock-icon">🔒</div>
                <h1>Доступ заблокирован</h1>
                <p>Ваш IP-адрес был заблокирован из-за превышения допустимого числа попыток входа. Попробуйте позже или обратитесь к администратору.</p>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
    ?>
    <!DOCTYPE html>
    <html lang="ru">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Вход в админ-панель</title>
    <style>
        /* ===== ЛОКАЛЬНЫЕ ШРИФТЫ (OSWALD & ROBOTO) ===== */
        /* Oswald 400 */
        @font-face {
            font-family: 'Oswald';
            font-style: normal;
            font-weight: 400;
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.eot');
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.woff2') format('woff2'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.woff') format('woff'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.ttf') format('truetype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.svg#Oswald') format('svg');
            font-display: swap;
        }
        /* Oswald 500 */
        @font-face {
            font-family: 'Oswald';
            font-style: normal;
            font-weight: 500;
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-500.eot');
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-500.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.woff2') format('woff2'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.woff') format('woff'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.ttf') format('truetype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.svg#Oswald') format('svg');
            font-display: swap;
        }
        /* Oswald 700 */
        @font-face {
            font-family: 'Oswald';
            font-style: normal;
            font-weight: 700;
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-700.eot');
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-700.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.woff2') format('woff2'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.woff') format('woff'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.ttf') format('truetype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.svg#Oswald') format('svg');
            font-display: swap;
        }

        /* Roboto 300 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 300;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-300.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-300.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.svg#Roboto') format('svg');
            font-display: swap;
        }
        /* Roboto 400 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 400;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.svg#Roboto') format('svg');
            font-display: swap;
        }
        /* Roboto 500 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 500;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-500.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-500.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.svg#Roboto') format('svg');
            font-display: swap;
        }
        /* Roboto 700 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 700;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-700.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-700.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.svg#Roboto') format('svg');
            font-display: swap;
        }

        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Roboto', sans-serif; background: #0d0d0d; display: flex; align-items: center; justify-content: center; min-height: 100vh; color: #f0f0f0; }
        .login-box { background: #2a2a2a; border: 1px solid #444; border-radius: 16px; padding: 48px 40px; width: 100%; max-width: 400px; text-align: center; }
        .login-box h1 { font-family: 'Oswald', sans-serif; font-size: 28px; margin-bottom: 8px; }
        .login-box h1 span { color: #e86a17; }
        .login-box p { color: #aaa; margin-bottom: 28px; font-size: 14px; }
        .login-input { width: 100%; padding: 14px 16px; background: #0d0d0d; border: 1px solid #444; border-radius: 10px; color: #f0f0f0; font-size: 15px; margin-bottom: 16px; outline: none; }
        .login-input:focus { border-color: #e86a17; }
        .login-btn { width: 100%; padding: 14px; background: #e86a17; color: #fff; border: none; border-radius: 50px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all .3s; }
        .login-btn:hover { background: #f08a45; transform: translateY(-2px); }
        .login-error { color: #e63946; font-size: 13px; margin-top: 12px; opacity: 0; transition: opacity .3s; }
        .login-error.show { opacity: 1; }
    </style>
    </head>
    <body>
        <div class="login-box">
            <h1>Тепло<span>динамик</span></h1>
            <p>Введите секретный ключ для доступа к панели управления</p>
            <input type="password" class="login-input" id="secretKey" placeholder="Секретный ключ..." autocomplete="off">
            <button class="login-btn" onclick="checkAuth()">Войти</button>
            <div class="login-error" id="loginError">Неверный секретный ключ</div>
        </div>
        <script>
            function checkAuth() {
                const input = document.getElementById('secretKey').value;
                fetch('/admin?action=login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'password=' + encodeURIComponent(input)
                })
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        location.reload();
                    } else {
                        document.getElementById('loginError').classList.add('show');
                        setTimeout(() => document.getElementById('loginError').classList.remove('show'), 3000);
                    }
                });
            }
            document.getElementById('secretKey').addEventListener('keypress', e => { if (e.key === 'Enter') checkAuth(); });
        </script>
    </body>
    </html>
    <?php
    exit;
}

// Авторизован – показываем админ-панель
$previewBase = '/';

// ===== УЛУЧШЕНИЕ: НЕ ПЕРЕДАЁМ ХЕШ ПАРОЛЯ КЛИЕНТУ =====
$clientData = $data;
if (isset($clientData['admin'])) {
    unset($clientData['admin']['passwordHash']);
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔒 Админ-панель — Теплодинамик</title>
    <style>
        /* ===== ЛОКАЛЬНЫЕ ШРИФТЫ (OSWALD & ROBOTO) ===== */
        /* Oswald 400 */
        @font-face {
            font-family: 'Oswald';
            font-style: normal;
            font-weight: 400;
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.eot');
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.woff2') format('woff2'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.woff') format('woff'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.ttf') format('truetype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-regular.svg#Oswald') format('svg');
            font-display: swap;
        }
        /* Oswald 500 */
        @font-face {
            font-family: 'Oswald';
            font-style: normal;
            font-weight: 500;
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-500.eot');
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-500.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.woff2') format('woff2'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.woff') format('woff'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.ttf') format('truetype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-500.svg#Oswald') format('svg');
            font-display: swap;
        }
        /* Oswald 700 */
        @font-face {
            font-family: 'Oswald';
            font-style: normal;
            font-weight: 700;
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-700.eot');
            src: url('/fonts/oswald/oswald-v57-cyrillic_latin-700.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.woff2') format('woff2'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.woff') format('woff'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.ttf') format('truetype'),
                 url('/fonts/oswald/oswald-v57-cyrillic_latin-700.svg#Oswald') format('svg');
            font-display: swap;
        }

        /* Roboto 300 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 300;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-300.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-300.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-300.svg#Roboto') format('svg');
            font-display: swap;
        }
        /* Roboto 400 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 400;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-regular.svg#Roboto') format('svg');
            font-display: swap;
        }
        /* Roboto 500 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 500;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-500.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-500.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-500.svg#Roboto') format('svg');
            font-display: swap;
        }
        /* Roboto 700 */
        @font-face {
            font-family: 'Roboto';
            font-style: normal;
            font-weight: 700;
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-700.eot');
            src: url('/fonts/roboto/roboto-v51-cyrillic_latin-700.eot?#iefix') format('embedded-opentype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.woff2') format('woff2'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.woff') format('woff'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.ttf') format('truetype'),
                 url('/fonts/roboto/roboto-v51-cyrillic_latin-700.svg#Roboto') format('svg');
            font-display: swap;
        }

        /* ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===== */
        :root {
            --orange: <?php echo htmlspecialchars($data['theme']['orange']); ?>;
            --orange-light: <?php echo htmlspecialchars($data['theme']['orangeLight']); ?>;
            --orange-dark: <?php echo htmlspecialchars($data['theme']['orangeDark']); ?>;
            --dark: <?php echo htmlspecialchars($data['theme']['dark']); ?>;
            --darker: <?php echo htmlspecialchars($data['theme']['darker']); ?>;
            --gray: <?php echo htmlspecialchars($data['theme']['gray']); ?>;
            --gray-light: <?php echo htmlspecialchars($data['theme']['grayLight']); ?>;
            --text: <?php echo htmlspecialchars($data['theme']['text']); ?>;
            --text-dim: <?php echo htmlspecialchars($data['theme']['textDim']); ?>;
            --success: #4caf50;
            --danger: #e63946;
            --info: #2196f3;
        }

        /* ===== СБРОС И БАЗА ===== */
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body {
            height: 100%;
            overflow: hidden;
            font-family: 'Roboto', sans-serif;
            background: var(--darker);
            color: var(--text);
        }

        /* ===== СКРОЛЛБАР ===== */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: var(--darker); }
        ::-webkit-scrollbar-thumb { background: var(--orange); border-radius: 5px; border: 2px solid var(--darker); }
        ::-webkit-scrollbar-thumb:hover { background: var(--orange-light); }
        * { scrollbar-width: thin; scrollbar-color: var(--orange) var(--darker); }

        /* ===== АДМИН-ПАНЕЛЬ (FLEX-КОНТЕЙНЕР) ===== */
        .admin-panel {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }

        /* ===== ХЕДЕР ===== */
        .admin-header {
            flex-shrink: 0;
            background: var(--dark);
            border-bottom: 1px solid var(--gray-light);
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            z-index: 10;
        }
        .admin-header-left {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .admin-logo {
            font-family: 'Oswald', sans-serif;
            font-size: 20px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .admin-logo span { color: var(--orange); }
        .admin-badge {
            background: rgba(232,106,23,0.15);
            border: 1px solid var(--orange);
            color: var(--orange-light);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .admin-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .admin-btn {
            padding: 10px 20px;
            border-radius: 50px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all .3s;
            border: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn-primary {
            background: var(--orange);
            color: #fff;
        }
        .btn-primary:hover {
            background: var(--orange-light);
            transform: translateY(-2px);
        }
        .btn-secondary {
            background: var(--gray);
            color: var(--text);
            border: 1px solid var(--gray-light);
        }
        .btn-secondary:hover {
            border-color: var(--orange);
            color: var(--orange);
        }
        .btn-danger {
            background: var(--danger);
            color: #fff;
        }
        .btn-danger:hover {
            opacity: .9;
            transform: translateY(-2px);
        }
        .btn-info {
            background: var(--info);
            color: #fff;
        }
        .btn-info:hover {
            opacity: .9;
            transform: translateY(-2px);
        }
        .btn-sm {
            padding: 6px 14px;
            font-size: 11px;
        }

        /* ===== МОБИЛЬНАЯ НАВИГАЦИЯ (обёртка + прокрутка) ===== */
        .mobile-nav-wrapper {
            display: none;
            position: relative;
            align-items: center;
            background: var(--dark);
            border-bottom: 1px solid var(--gray-light);
            padding: 6px 0;
            flex-shrink: 0;
        }
        .mobile-nav-scroll {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            scroll-behavior: smooth;
            padding: 0 50px;
            flex: 1;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
        }
        .mobile-nav-scroll::-webkit-scrollbar {
            display: none;
        }
        .mobile-nav-btn {
            flex-shrink: 0;
            padding: 8px 16px;
            border-radius: 20px;
            background: var(--gray);
            border: 1px solid var(--gray-light);
            color: var(--text-dim);
            font-size: 12px;
            white-space: nowrap;
            cursor: pointer;
            transition: all .2s;
        }
        .mobile-nav-btn.active {
            background: var(--orange);
            color: #fff;
            border-color: var(--orange);
        }
        .mobile-nav-arrow {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 32px;
            height: 32px;
            background: var(--gray);
            border: 1px solid var(--gray-light);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            color: var(--text);
            transition: all .2s;
            flex-shrink: 0;
        }
        .mobile-nav-arrow:hover {
            background: var(--orange);
            border-color: var(--orange);
            color: #fff;
        }
        .mobile-nav-arrow-left {
            left: 4px;
        }
        .mobile-nav-arrow-right {
            right: 4px;
        }

        /* ===== ОСНОВНОЙ КОНТЕНТ ===== */
        .admin-body {
            flex: 1;
            min-height: 0;
            display: grid;
            grid-template-columns: 260px 1fr;
            overflow: hidden;
        }
        .admin-sidebar {
            background: var(--dark);
            border-right: 1px solid var(--gray-light);
            padding: 16px 0;
            overflow-y: auto;
        }
        .sidebar-section {
            padding: 0 16px 16px;
            border-bottom: 1px solid var(--gray-light);
            margin-bottom: 16px;
        }
        .sidebar-title {
            font-family: 'Oswald', sans-serif;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: var(--text-dim);
            margin-bottom: 10px;
        }
        .sidebar-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: all .2s;
            font-size: 13px;
            color: var(--text-dim);
            margin-bottom: 3px;
        }
        .sidebar-item:hover {
            background: var(--gray);
            color: var(--text);
        }
        .sidebar-item.active {
            background: rgba(232,106,23,0.15);
            color: var(--orange);
            border-left: 3px solid var(--orange);
            padding-left: 9px;
        }
        .sidebar-item svg {
            width: 18px;
            height: 18px;
            fill: currentColor;
            flex-shrink: 0;
        }

        .admin-editor {
            padding: 24px;
            overflow-y: auto;
            background: var(--darker);
        }

        /* ===== РЕДАКТОР ===== */
        .editor-section {
            display: none;
            animation: fadeIn .3s ease;
        }
        .editor-section.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity:0; transform: translateY(10px); }
            to { opacity:1; transform: translateY(0); }
        }
        .editor-card {
            background: var(--gray);
            border: 1px solid var(--gray-light);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
        }
        .editor-card h3 {
            font-family: 'Oswald', sans-serif;
            font-size: 18px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .editor-card h3 svg {
            width: 22px;
            height: 22px;
            fill: var(--orange);
        }
        .editor-card h4 {
            font-family: 'Oswald', sans-serif;
            font-size: 14px;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 20px 0 12px;
            padding-top: 16px;
            border-top: 1px solid var(--gray-light);
        }
        .field-group {
            margin-bottom: 16px;
        }
        .field-group:last-child {
            margin-bottom: 0;
        }
        .field-label {
            display: block;
            font-size: 11px;
            font-weight: 500;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 6px;
        }
        .field-input, .field-textarea, .field-select {
            width: 100%;
            padding: 12px 14px;
            background: var(--darker);
            border: 1px solid var(--gray-light);
            border-radius: 10px;
            color: var(--text);
            font-size: 14px;
            font-family: 'Roboto', sans-serif;
            outline: none;
            transition: border-color .2s, box-shadow .2s;
        }
        .field-input:focus, .field-textarea:focus, .field-select:focus {
            border-color: var(--orange);
            box-shadow: 0 0 0 3px rgba(232,106,23,0.1);
        }
        .field-textarea {
            min-height: 80px;
            resize: vertical;
            line-height: 1.6;
        }
        .field-select {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23aaa'%3E%3Cpath d='M6 9L1 4h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 14px center;
            padding-right: 36px;
        }
        .field-hint {
            font-size: 11px;
            color: var(--text-dim);
            margin-top: 6px;
        }
        .field-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }
        @media(max-width:600px) {
            .field-row {
                grid-template-columns: 1fr;
            }
        }
        .img-preview {
            width: 100%;
            max-width: 200px;
            height: 120px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid var(--gray-light);
            margin-top: 8px;
            display: block;
            background: var(--darker);
        }
        .color-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .color-row input[type="color"] {
            width: 44px;
            height: 44px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            background: none;
            padding: 2px;
        }
        .color-row .field-input {
            flex: 1;
            margin-bottom: 0;
        }
        .list-item {
            background: var(--darker);
            border: 1px solid var(--gray-light);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            position: relative;
        }
        .list-item-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        .list-item-num {
            font-family: 'Oswald', sans-serif;
            font-size: 12px;
            color: var(--orange);
            background: rgba(232,106,23,0.15);
            padding: 2px 8px;
            border-radius: 4px;
        }
        .list-item-actions {
            margin-left: auto;
            display: flex;
            gap: 6px;
        }
        .list-item-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        @media(max-width:600px) {
            .list-item-body {
                grid-template-columns: 1fr;
            }
        }
        .icon-picker {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 6px;
            margin-top: 8px;
        }
        .icon-picker-btn {
            width: 36px;
            height: 36px;
            background: var(--darker);
            border: 2px solid var(--gray-light);
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s;
        }
        .icon-picker-btn:hover {
            border-color: var(--orange);
        }
        .icon-picker-btn.active {
            border-color: var(--orange);
            background: rgba(232,106,23,0.2);
        }
        .icon-picker-btn svg {
            width: 18px;
            height: 18px;
            fill: var(--text);
        }

        .wysiwyg-toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            padding: 8px;
            background: var(--darker);
            border: 1px solid var(--gray-light);
            border-radius: 10px 10px 0 0;
            border-bottom: none;
        }
        .wysiwyg-btn {
            width: 32px;
            height: 32px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-dim);
            transition: all .2s;
        }
        .wysiwyg-btn:hover {
            background: var(--gray);
            color: var(--text);
        }
        .wysiwyg-btn.active {
            background: rgba(232,106,23,0.2);
            color: var(--orange);
            border-color: var(--orange);
        }
        .wysiwyg-btn svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        .wysiwyg-sep {
            width: 1px;
            height: 22px;
            background: var(--gray-light);
            margin: 5px 4px;
        }
        .wysiwyg-editor {
            min-height: 120px;
            background: var(--darker);
            border: 1px solid var(--gray-light);
            border-radius: 0 0 10px 10px;
            padding: 14px;
            color: var(--text);
            font-size: 14px;
            line-height: 1.7;
            outline: none;
            overflow-y: auto;
        }
        .wysiwyg-editor:focus {
            border-color: var(--orange);
        }
        .wysiwyg-editor p {
            margin-bottom: 10px;
        }

        .preview-panel {
            position: fixed;
            right: 0;
            top: 61px;
            bottom: 0;
            width: 420px;
            background: var(--dark);
            border-left: 1px solid var(--gray-light);
            transform: translateX(100%);
            transition: transform .35s ease;
            z-index: 90;
            display: flex;
            flex-direction: column;
        }
        .preview-panel.open {
            transform: translateX(0);
        }
        .preview-header {
            padding: 14px 20px;
            border-bottom: 1px solid var(--gray-light);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .preview-header h4 {
            font-family: 'Oswald', sans-serif;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .preview-close {
            background: none;
            border: none;
            color: var(--text-dim);
            cursor: pointer;
            padding: 4px;
        }
        .preview-close:hover {
            color: var(--text);
        }
        .preview-frame {
            flex: 1;
            border: none;
            width: 100%;
            background: #fff;
        }
        .preview-error {
            display: none;
            padding: 20px;
            text-align: center;
            color: var(--danger);
            font-size: 14px;
            border-top: 1px solid var(--gray-light);
            background: var(--darker);
        }
        .preview-error.visible {
            display: block;
        }

        .toast-container {
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .toast {
            background: var(--gray);
            border: 1px solid var(--gray-light);
            border-radius: 12px;
            padding: 14px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            animation: toastIn .4s ease;
            min-width: 280px;
        }
        .toast.success {
            border-color: var(--success);
        }
        .toast.error {
            border-color: var(--danger);
        }
        @keyframes toastIn {
            from { opacity:0; transform: translateX(40px); }
            to { opacity:1; transform: translateX(0); }
        }
        .toast-icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .toast.success .toast-icon {
            background: rgba(76,175,80,0.15);
        }
        .toast.error .toast-icon {
            background: rgba(230,57,70,0.15);
        }
        .toast-icon svg {
            width: 16px;
            height: 16px;
        }
        .toast.success .toast-icon svg {
            fill: var(--success);
        }
        .toast.error .toast-icon svg {
            fill: var(--danger);
        }
        .toast-text {
            font-size: 14px;
            color: var(--text);
            font-weight: 500;
        }

        /* ===== АДАПТИВНОСТЬ ===== */
        @media(max-width:1024px) {
            .admin-body {
                grid-template-columns: 1fr;
            }
            .admin-sidebar {
                display: none;
            }
            .mobile-nav-wrapper {
                display: flex;
            }
            .admin-editor {
                padding: 16px;
            }
        }
        @media(min-width:1025px) {
            .mobile-nav-wrapper {
                display: none;
            }
        }
        @media(max-width:768px) {
            .admin-header {
                padding: 10px 16px;
            }
            .admin-actions {
                order: 3;
                width: 100%;
                justify-content: flex-end;
                margin-top: 8px;
            }
            .admin-editor {
                padding: 16px;
            }
            .preview-panel {
                width: 100%;
                top: 0;
            }
            .icon-picker {
                grid-template-columns: repeat(6, 1fr);
            }
        }
        @media(max-width:600px) {
            .field-row {
                grid-template-columns: 1fr;
            }
            .list-item-body {
                grid-template-columns: 1fr;
            }
        }

        .upload-btn {
            margin-left: 8px;
        }
        .image-clear-btn {
            margin-left: 4px;
            padding: 4px 8px;
            font-size: 10px;
        }
        hr {
            border: none;
            border-top: 1px solid var(--gray-light);
            margin: 24px 0;
        }
    </style>
</head>
<body>

    <!-- ===== АДМИН-ПАНЕЛЬ ===== -->
    <div class="admin-panel" id="adminPanel">

        <header class="admin-header">
            <div class="admin-header-left">
                <div class="admin-logo">Тепло<span>динамик</span></div>
                <span class="admin-badge">Админ-панель</span>
            </div>
            <div class="admin-actions">
                <button class="admin-btn btn-secondary btn-sm" onclick="exportData()">Экспорт JSON</button>
                <button class="admin-btn btn-secondary btn-sm" onclick="document.getElementById('importFile').click()">Импорт JSON</button>
                <input type="file" id="importFile" style="display:none" accept=".json" onchange="importData(this)">
                <button class="admin-btn btn-secondary" onclick="togglePreview()">Предпросмотр</button>
                <button class="admin-btn btn-secondary" onclick="resetToDefault()">Сбросить</button>
                <button class="admin-btn btn-primary" onclick="saveAll()">Сохранить</button>
                <button class="admin-btn btn-danger" onclick="logout()">Выйти</button>
            </div>
        </header>

        <!-- ===== МОБИЛЬНАЯ НАВИГАЦИЯ ===== -->
        <div class="mobile-nav-wrapper" id="mobileNavWrapper">
            <button class="mobile-nav-arrow mobile-nav-arrow-left" id="mobileNavLeft" aria-label="Прокрутить влево">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/></svg>
            </button>
            <div class="mobile-nav-scroll" id="mobileNavScroll"></div>
            <button class="mobile-nav-arrow mobile-nav-arrow-right" id="mobileNavRight" aria-label="Прокрутить вправо">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>
            </button>
        </div>

        <div class="admin-body">
            <aside class="admin-sidebar" id="sidebar">
                <div class="sidebar-section">
                    <div class="sidebar-title">Разделы сайта</div>
                    <div class="sidebar-item active" data-section="hero" onclick="switchSection('hero')">
                        <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>Главный экран
                    </div>
                    <div class="sidebar-item" data-section="features" onclick="switchSection('features')">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Преимущества
                    </div>
                    <div class="sidebar-item" data-section="specs" onclick="switchSection('specs')">
                        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/></svg>Характеристики
                    </div>
                    <div class="sidebar-item" data-section="gallery" onclick="switchSection('gallery')">
                        <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Галерея
                    </div>
                    <div class="sidebar-item" data-section="contacts" onclick="switchSection('contacts')">
                        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>Контакты
                    </div>
                    <div class="sidebar-item" data-section="cta" onclick="switchSection('cta')">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>CTA-блок
                    </div>
                    <div class="sidebar-item" data-section="footer" onclick="switchSection('footer')">
                        <svg viewBox="0 0 24 24"><path d="M9 11H7v9h2v-9zm4 0h-2v9h2v-9zm4 0h-2v9h2v-9zM4 4v2h16V4H4z"/></svg>Футер
                    </div>
                    <div class="sidebar-item" data-section="media" onclick="switchSection('media')">
                        <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Медиа
                    </div>
                </div>
                <div class="sidebar-section">
                    <div class="sidebar-title">Настройки</div>
                    <div class="sidebar-item" data-section="seo" onclick="switchSection('seo')">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>SEO и мета-теги
                    </div>
                    <div class="sidebar-item" data-section="theme" onclick="switchSection('theme')">
                        <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg>Цвета и тема
                    </div>
                </div>
                <div class="sidebar-section">
                    <div class="sidebar-title">Администрирование</div>
                    <div class="sidebar-item" data-section="admin" onclick="switchSection('admin')">
                        <svg viewBox="0 0 24 24"><path d="M12 1C8.13 1 5 4.13 5 8c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>Доступ и формы
                    </div>
                </div>
            </aside>

            <main class="admin-editor" id="editorArea">
                <!-- Разделы (те же, что в admin.html) -->
                <!-- HERO -->
                <div class="editor-section active" id="section-hero">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>Главный экран (Hero)</h3>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Заголовок H1</label><input type="text" class="field-input" id="heroTitle" data-key="hero.title"></div>
                            <div class="field-group"><label class="field-label">Подзаголовок (золотой)</label><input type="text" class="field-input" id="heroSubtitle" data-key="hero.subtitle"></div>
                        </div>
                        <div class="field-group">
                            <label class="field-label">Описание</label>
                            <div class="wysiwyg-toolbar">
                                <button class="wysiwyg-btn" onclick="execCmd('bold')" title="Жирный"><svg viewBox="0 0 24 24"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg></button>
                                <button class="wysiwyg-btn" onclick="execCmd('italic')" title="Курсив"><svg viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg></button>
                                <div class="wysiwyg-sep"></div>
                                <button class="wysiwyg-btn" onclick="execCmd('insertUnorderedList')" title="Список"><svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg></button>
                            </div>
                            <div class="wysiwyg-editor" id="heroDesc" contenteditable="true" data-key="hero.desc"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Текст бейджа</label><input type="text" class="field-input" id="heroBadgeText" data-key="hero.badgeText"></div>
                            <div class="field-group"><label class="field-label">Ссылка бейджа</label><input type="text" class="field-input" id="heroBadgeLink" data-key="hero.badgeLink"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Фоновое изображение (URL)</label><input type="text" class="field-input image-upload-input" id="heroBgImage" data-key="hero.bgImage" placeholder="Фон.jpg"><img class="img-preview" id="previewHeroBg"></div>
                            <div class="field-group"><label class="field-label">Изображение котла (URL)</label><input type="text" class="field-input image-upload-input" id="heroBoilerImage" data-key="hero.boilerImage" placeholder="Рис 2.jpg"><img class="img-preview" id="previewHeroBoiler"></div>
                        </div>
                    </div>
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>Контакты в Hero</h3>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Телефон (для звонка)</label><input type="text" class="field-input" id="heroPhone" data-key="contacts.phone"></div>
                            <div class="field-group"><label class="field-label">Телефон (отображение)</label><input type="text" class="field-input" id="heroPhoneDisplay" data-key="contacts.phoneDisplay"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Email</label><input type="text" class="field-input" id="heroEmail" data-key="contacts.email"></div>
                            <div class="field-group"><label class="field-label">Email (отображение)</label><input type="text" class="field-input" id="heroEmailDisplay" data-key="contacts.emailDisplay"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">WhatsApp ссылка</label><input type="text" class="field-input" id="heroWhatsapp" data-key="contacts.whatsapp"></div>
                            <div class="field-group"><label class="field-label">Telegram ссылка</label><input type="text" class="field-input" id="heroTelegram" data-key="contacts.telegram"></div>
                        </div>
                        <div class="field-group"><label class="field-label">Текст кнопки CTA</label><input type="text" class="field-input" id="heroCtaText" data-key="hero.ctaText"></div>
                    </div>
                </div>

                <!-- FEATURES -->
                <div class="editor-section" id="section-features">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Заголовок раздела</h3>
                        <div class="field-group"><label class="field-label">Заголовок</label><input type="text" class="field-input" id="featuresTitle" data-key="features.title"></div>
                        <div class="field-group"><label class="field-label">Подзаголовок</label><input type="text" class="field-input" id="featuresSubtitle" data-key="features.subtitle"></div>
                    </div>
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/></svg>Карточки преимуществ</h3>
                        <div id="featuresList"></div>
                        <button class="admin-btn btn-secondary" style="margin-top:8px" onclick="addFeature()">+ Добавить карточку</button>
                    </div>
                </div>

                <!-- SPECS -->
                <div class="editor-section" id="section-specs">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/></svg>Технические характеристики</h3>
                        <div class="field-group"><label class="field-label">Заголовок</label><input type="text" class="field-input" id="specsTitle" data-key="specs.title"></div>
                        <div class="field-group"><label class="field-label">Подзаголовок</label><input type="text" class="field-input" id="specsSubtitle" data-key="specs.subtitle"></div>
                        <div class="field-group"><label class="field-label">Изображение чертежа (URL)</label><input type="text" class="field-input image-upload-input" id="specsImage" data-key="specs.image" placeholder="Рис 1.jpg"><img class="img-preview" id="previewSpecsImage"></div>
                    </div>
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"/></svg>Параметры</h3>
                        <div id="specsList"></div>
                        <button class="admin-btn btn-secondary" style="margin-top:8px" onclick="addSpec()">+ Добавить параметр</button>
                    </div>
                </div>

                <!-- GALLERY -->
                <div class="editor-section" id="section-gallery">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Галерея Mondrian</h3>
                        <div class="field-group"><label class="field-label">Заголовок раздела</label><input type="text" class="field-input" id="galleryTitle" data-key="gallery.title"></div>
                    </div>
                    <div class="editor-card">
                        <h3>Ячейки галереи</h3>
                        <div id="galleryList"></div>
                    </div>
                </div>

                <!-- CONTACTS -->
                <div class="editor-section" id="section-contacts">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>Контактная информация</h3>
                        <div class="field-group"><label class="field-label">Заголовок</label><input type="text" class="field-input" id="contactTitle" data-key="contacts.title"></div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Телефон (для звонка)</label><input type="text" class="field-input" id="contactPhone" data-key="contacts.phone"></div>
                            <div class="field-group"><label class="field-label">Телефон (отображение)</label><input type="text" class="field-input" id="contactPhoneDisplay" data-key="contacts.phoneDisplay"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Email</label><input type="text" class="field-input" id="contactEmail" data-key="contacts.email"></div>
                            <div class="field-group"><label class="field-label">Email (отображение)</label><input type="text" class="field-input" id="contactEmailDisplay" data-key="contacts.emailDisplay"></div>
                        </div>
                        <div class="field-group"><label class="field-label">Регион</label><input type="text" class="field-input" id="contactRegion" data-key="contacts.region"></div>
                    </div>
                </div>

                <!-- CTA -->
                <div class="editor-section" id="section-cta">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>CTA-блок</h3>
                        <div class="field-group"><label class="field-label">Заголовок</label><input type="text" class="field-input" id="ctaTitle" data-key="cta.title"></div>
                        <div class="field-group"><label class="field-label">Описание</label><input type="text" class="field-input" id="ctaDesc" data-key="cta.desc"></div>
                        <div class="field-group"><label class="field-label">Текст кнопки</label><input type="text" class="field-input" id="ctaButton" data-key="cta.button"></div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div class="editor-section" id="section-footer">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M9 11H7v9h2v-9zm4 0h-2v9h2v-9zm4 0h-2v9h2v-9zM4 4v2h16V4H4z"/></svg>Футер</h3>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Название компании</label><input type="text" class="field-input" id="footerCompany" data-key="footer.company"></div>
                            <div class="field-group"><label class="field-label">Слоган</label><input type="text" class="field-input" id="footerTagline" data-key="footer.tagline"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Телефон (текст)</label><input type="text" class="field-input" id="footerPhone" data-key="footer.phone"></div>
                            <div class="field-group"><label class="field-label">Email (текст)</label><input type="text" class="field-input" id="footerEmail" data-key="footer.email"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">WhatsApp ссылка</label><input type="text" class="field-input" id="footerWhatsapp" data-key="footer.whatsapp"></div>
                            <div class="field-group"><label class="field-label">Telegram ссылка</label><input type="text" class="field-input" id="footerTelegram" data-key="footer.telegram"></div>
                        </div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Текст копирайта</label><input type="text" class="field-input" id="footerCopyright" data-key="footer.copyright"></div>
                            <div class="field-group"><label class="field-label">Ссылка на патент</label><input type="text" class="field-input" id="footerPatentLink" data-key="footer.patentLink"></div>
                        </div>
                        <div class="field-group"><label class="field-label">Текст ссылки патента</label><input type="text" class="field-input" id="footerPatentText" data-key="footer.patentText"></div>
                    </div>
                </div>

                <!-- MEDIA -->
                <div class="editor-section" id="section-media">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Управление изображениями</h3>
                        <div class="field-group"><label class="field-label">Иконка телефона</label><input type="text" class="field-input image-upload-input" id="mediaPhoneIcon" data-key="media.phoneIcon" placeholder="телефон.png"><img class="img-preview" id="previewPhoneIcon"></div>
                        <div class="field-group"><label class="field-label">Иконка WhatsApp</label><input type="text" class="field-input image-upload-input" id="mediaWhatsappIcon" data-key="media.whatsappIcon" placeholder="вотсап.png"><img class="img-preview" id="previewWhatsappIcon"></div>
                        <div class="field-group"><label class="field-label">Иконка Telegram</label><input type="text" class="field-input image-upload-input" id="mediaTelegramIcon" data-key="media.telegramIcon" placeholder="телеграм.png"><img class="img-preview" id="previewTelegramIcon"></div>
                        <div class="field-group"><label class="field-label">Иконка Email</label><input type="text" class="field-input image-upload-input" id="mediaEmailIcon" data-key="media.emailIcon" placeholder="почта.png"><img class="img-preview" id="previewEmailIcon"></div>
                        <div class="field-group"><label class="field-label">Иконка «огонь» (для характеристик)</label><input type="text" class="field-input image-upload-input" id="mediaFireIcon" data-key="media.fireIcon" placeholder="огонь.png"><img class="img-preview" id="previewFireIcon"></div>
                        <div class="field-group"><label class="field-label">Favicon (URL)</label><input type="text" class="field-input image-upload-input" id="mediaFavicon" data-key="media.favicon" placeholder="favicon.ico"><img class="img-preview" id="previewFavicon" style="height:60px;width:60px;object-fit:contain"></div>
                    </div>
                </div>

                <!-- SEO -->
                <div class="editor-section" id="section-seo">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>SEO-настройки</h3>
                        <div class="field-group"><label class="field-label">Title страницы</label><input type="text" class="field-input" id="seoTitle" data-key="seo.title"></div>
                        <div class="field-group"><label class="field-label">Meta Description</label><textarea class="field-textarea" id="seoDesc" data-key="seo.description" rows="3"></textarea></div>
                        <div class="field-group"><label class="field-label">Meta Keywords</label><input type="text" class="field-input" id="seoKeywords" data-key="seo.keywords"></div>
                        <div class="field-group"><label class="field-label">OG Image URL</label><input type="text" class="field-input" id="seoOgImage" data-key="seo.ogImage"></div>
                        <div class="field-group"><label class="field-label">Canonical URL</label><input type="text" class="field-input" id="seoCanonical" data-key="seo.canonical"></div>
                        <div class="field-group"><label class="field-label">Author</label><input type="text" class="field-input" id="seoAuthor" data-key="seo.author"></div>
                        <div class="field-group"><label class="field-label">Robots</label><input type="text" class="field-input" id="seoRobots" data-key="seo.robots"></div>
                    </div>
                </div>

                <!-- THEME -->
                <div class="editor-section" id="section-theme">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg>Цветовая схема</h3>
                        <div class="color-row"><input type="color" id="themeOrange" data-key="theme.orange"><div class="field-input" style="margin-bottom:0">Основной оранжевый</div></div>
                        <div class="color-row"><input type="color" id="themeOrangeLight" data-key="theme.orangeLight"><div class="field-input" style="margin-bottom:0">Светло-оранжевый</div></div>
                        <div class="color-row"><input type="color" id="themeOrangeDark" data-key="theme.orangeDark"><div class="field-input" style="margin-bottom:0">Тёмно-оранжевый</div></div>
                        <div class="color-row"><input type="color" id="themeDark" data-key="theme.dark"><div class="field-input" style="margin-bottom:0">Тёмный фон (dark)</div></div>
                        <div class="color-row"><input type="color" id="themeDarker" data-key="theme.darker"><div class="field-input" style="margin-bottom:0">Основной фон (darker)</div></div>
                        <div class="color-row"><input type="color" id="themeGray" data-key="theme.gray"><div class="field-input" style="margin-bottom:0">Серый (gray)</div></div>
                        <div class="color-row"><input type="color" id="themeGrayLight" data-key="theme.grayLight"><div class="field-input" style="margin-bottom:0">Светло-серый (gray-light)</div></div>
                        <div class="color-row"><input type="color" id="themeText" data-key="theme.text"><div class="field-input" style="margin-bottom:0">Основной текст</div></div>
                        <div class="color-row"><input type="color" id="themeTextDim" data-key="theme.textDim"><div class="field-input" style="margin-bottom:0">Приглушённый текст</div></div>
                        <div class="color-row"><input type="color" id="themeGold" data-key="theme.gold"><div class="field-input" style="margin-bottom:0">Золотой акцент</div></div>
                    </div>
                </div>

                <!-- ADMIN -->
                <div class="editor-section" id="section-admin">
                    <div class="editor-card">
                        <h3><svg viewBox="0 0 24 24"><path d="M12 1C8.13 1 5 4.13 5 8c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>Настройки доступа и формы</h3>
                        <h4>Смена пароля администратора</h4>
                        <div class="field-group"><label class="field-label">Текущий пароль</label><input type="password" class="field-input" id="adminCurrentPassword" placeholder="Введите текущий пароль"></div>
                        <div class="field-row">
                            <div class="field-group"><label class="field-label">Новый пароль</label><input type="password" class="field-input" id="adminNewPassword" placeholder="Введите новый пароль"></div>
                            <div class="field-group"><label class="field-label">Подтверждение пароля</label><input type="password" class="field-input" id="adminNewPasswordConfirm" placeholder="Повторите пароль"></div>
                        </div>
                        <button class="admin-btn btn-primary" onclick="changePassword()">Сменить пароль</button>
                        <div class="field-hint" style="margin-top:8px;">Для смены пароля необходимо ввести текущий пароль. Новый пароль будет сохранён в захешированном виде (bcrypt).</div>
                        <hr>
                        <h4>Настройка формы обратной связи</h4>
                        <div class="field-group"><label class="field-label">URL для отправки (action)</label><input type="text" class="field-input" id="adminFormEndpoint" data-key="admin.formEndpoint" placeholder="https://formspree.io/f/ваш_код"></div>
                        <div class="field-group"><label class="field-label">Email получателя (_replyto)</label><input type="text" class="field-input" id="adminFormReplyTo" data-key="admin.formReplyTo" placeholder="your@email.ru"></div>
                        <button class="admin-btn btn-primary" onclick="saveAdminSettings()">Сохранить настройки формы</button>
                    </div>
                </div>

            </main>
        </div>
    </div>

    <!-- ===== ПРЕДПРОСМОТР ===== -->
    <div class="preview-panel" id="previewPanel">
        <div class="preview-header">
            <h4>Предпросмотр</h4>
            <button class="preview-close" onclick="togglePreview()"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
        </div>
        <iframe class="preview-frame" id="previewFrame" src="about:blank"></iframe>
        <div class="preview-error" id="previewError">❌ Не удалось загрузить предпросмотр. Проверьте, доступен ли корень сайта (/).</div>
    </div>

    <!-- ===== TOAST ===== -->
    <div class="toast-container" id="toastContainer"></div>

    <!-- ==================== СКРИПТЫ ==================== -->
    <script>
        // ===== ДАННЫЕ БЕЗ ХЕША ПАРОЛЯ =====
        var DATA = <?php echo json_encode($clientData); ?>;
        var PREVIEW_BASE = '<?php echo $previewBase; ?>';

        // ===== ИКОНКИ =====
        const ICONS = {
            check: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
            auto: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/></svg>',
            bunker: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
            power: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
            temp: '<svg viewBox="0 0 24 24"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-2z"/></svg>',
            steel: '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>',
            eco: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
            factory: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
            shield: '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>'
        };
        const ICON_KEYS = Object.keys(ICONS);
        const GALLERY_COLORS = { red: '#e63946', blue: '#1d3557', yellow: '#f4a261', green: '#2a9d8f', purple: '#6b2c91', white: '#f1faee', black: '#111111' };

        // ===== ДЕБАУНС =====
        function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

        // ===== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ SRC =====
        function getImageSrc(value) {
            if (!value) return '';
            return value;
        }

        // ===== ЗАГРУЗКА ИЗОБРАЖЕНИЙ (на сервер) =====
        function addUploadButtons() {
            document.querySelectorAll('input.image-upload-input').forEach(function(input) {
                var wrapper = input.closest('.field-group');
                if (!wrapper) return;
                if (wrapper.querySelector('.upload-btn')) return;
                var fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.style.display = 'none';
                fileInput.className = 'upload-file-input';
                var uploadBtn = document.createElement('button');
                uploadBtn.type = 'button';
                uploadBtn.className = 'admin-btn btn-secondary btn-sm upload-btn';
                uploadBtn.textContent = 'Загрузить';
                var clearBtn = document.createElement('button');
                clearBtn.type = 'button';
                clearBtn.className = 'admin-btn btn-danger btn-sm image-clear-btn';
                clearBtn.innerHTML = '✕';
                clearBtn.title = 'Удалить изображение';
                wrapper.appendChild(fileInput);
                wrapper.appendChild(uploadBtn);
                wrapper.appendChild(clearBtn);
                uploadBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    fileInput.click();
                });
                fileInput.addEventListener('change', function(e) {
                    var file = this.files[0];
                    if (!file) return;
                    var formData = new FormData();
                    formData.append('file', file);
                    fetch('/admin?action=upload', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(result => {
                        if (result.success) {
                            var path = result.path;
                            input.value = path;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            var preview = wrapper.querySelector('.img-preview');
                            if (preview) preview.src = path;
                            showToast('Изображение загружено', 'success');
                            saveFromDOM();
                        } else {
                            showToast('Ошибка загрузки: ' + (result.error || ''), 'error');
                        }
                    })
                    .catch(() => showToast('Ошибка сети при загрузке', 'error'));
                });
                clearBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    var preview = wrapper.querySelector('.img-preview');
                    if (preview) preview.src = '';
                    showToast('Изображение удалено', 'success');
                    saveFromDOM();
                });
            });
        }

        // ===== ИНИЦИАЛИЗАЦИЯ РЕДАКТОРА =====
        function initEditor() {
            document.getElementById('heroTitle').value = DATA.hero.title || '';
            document.getElementById('heroSubtitle').value = DATA.hero.subtitle || '';
            document.getElementById('heroDesc').innerHTML = DATA.hero.desc || '';
            document.getElementById('heroBadgeText').value = DATA.hero.badgeText || '';
            document.getElementById('heroBadgeLink').value = DATA.hero.badgeLink || '';
            document.getElementById('heroBgImage').value = DATA.hero.bgImage || '';
            document.getElementById('previewHeroBg').src = getImageSrc(DATA.hero.bgImage);
            document.getElementById('heroBoilerImage').value = DATA.hero.boilerImage || '';
            document.getElementById('previewHeroBoiler').src = getImageSrc(DATA.hero.boilerImage);
            document.getElementById('heroCtaText').value = DATA.hero.ctaText || '';
            document.getElementById('heroPhone').value = DATA.contacts.phone || '';
            document.getElementById('heroPhoneDisplay').value = DATA.contacts.phoneDisplay || '';
            document.getElementById('heroEmail').value = DATA.contacts.email || '';
            document.getElementById('heroEmailDisplay').value = DATA.contacts.emailDisplay || '';
            document.getElementById('heroWhatsapp').value = DATA.contacts.whatsapp || '';
            document.getElementById('heroTelegram').value = DATA.contacts.telegram || '';
            document.getElementById('featuresTitle').value = DATA.features.title || '';
            document.getElementById('featuresSubtitle').value = DATA.features.subtitle || '';
            renderFeaturesList(DATA.features.items);
            document.getElementById('specsTitle').value = DATA.specs.title || '';
            document.getElementById('specsSubtitle').value = DATA.specs.subtitle || '';
            document.getElementById('specsImage').value = DATA.specs.image || '';
            document.getElementById('previewSpecsImage').src = getImageSrc(DATA.specs.image);
            renderSpecsList(DATA.specs.items);
            document.getElementById('galleryTitle').value = DATA.gallery.title || '';
            renderGalleryList(DATA.gallery.cells);
            document.getElementById('contactTitle').value = DATA.contacts.title || '';
            document.getElementById('contactPhone').value = DATA.contacts.phone || '';
            document.getElementById('contactPhoneDisplay').value = DATA.contacts.phoneDisplay || '';
            document.getElementById('contactEmail').value = DATA.contacts.email || '';
            document.getElementById('contactEmailDisplay').value = DATA.contacts.emailDisplay || '';
            document.getElementById('contactRegion').value = DATA.contacts.region || '';
            document.getElementById('ctaTitle').value = DATA.cta.title || '';
            document.getElementById('ctaDesc').value = DATA.cta.desc || '';
            document.getElementById('ctaButton').value = DATA.cta.button || '';
            document.getElementById('footerCompany').value = DATA.footer.company || '';
            document.getElementById('footerTagline').value = DATA.footer.tagline || '';
            document.getElementById('footerPhone').value = DATA.footer.phone || '';
            document.getElementById('footerEmail').value = DATA.footer.email || '';
            document.getElementById('footerWhatsapp').value = DATA.footer.whatsapp || '';
            document.getElementById('footerTelegram').value = DATA.footer.telegram || '';
            document.getElementById('footerCopyright').value = DATA.footer.copyright || '';
            document.getElementById('footerPatentLink').value = DATA.footer.patentLink || '';
            document.getElementById('footerPatentText').value = DATA.footer.patentText || '';
            document.getElementById('mediaPhoneIcon').value = DATA.media?.phoneIcon || '';
            document.getElementById('previewPhoneIcon').src = getImageSrc(DATA.media?.phoneIcon);
            document.getElementById('mediaWhatsappIcon').value = DATA.media?.whatsappIcon || '';
            document.getElementById('previewWhatsappIcon').src = getImageSrc(DATA.media?.whatsappIcon);
            document.getElementById('mediaTelegramIcon').value = DATA.media?.telegramIcon || '';
            document.getElementById('previewTelegramIcon').src = getImageSrc(DATA.media?.telegramIcon);
            document.getElementById('mediaEmailIcon').value = DATA.media?.emailIcon || '';
            document.getElementById('previewEmailIcon').src = getImageSrc(DATA.media?.emailIcon);
            document.getElementById('mediaFireIcon').value = DATA.media?.fireIcon || '';
            document.getElementById('previewFireIcon').src = getImageSrc(DATA.media?.fireIcon);
            document.getElementById('mediaFavicon').value = DATA.media?.favicon || '';
            document.getElementById('previewFavicon').src = getImageSrc(DATA.media?.favicon);
            document.getElementById('seoTitle').value = DATA.seo.title || '';
            document.getElementById('seoDesc').value = DATA.seo.description || '';
            document.getElementById('seoKeywords').value = DATA.seo.keywords || '';
            document.getElementById('seoOgImage').value = DATA.seo.ogImage || '';
            document.getElementById('seoCanonical').value = DATA.seo.canonical || '';
            document.getElementById('seoAuthor').value = DATA.seo.author || '';
            document.getElementById('seoRobots').value = DATA.seo.robots || '';
            document.getElementById('themeOrange').value = DATA.theme.orange || '#e86a17';
            document.getElementById('themeOrangeLight').value = DATA.theme.orangeLight || '#f08a45';
            document.getElementById('themeOrangeDark').value = DATA.theme.orangeDark || '#c4520a';
            document.getElementById('themeDark').value = DATA.theme.dark || '#1a1a1a';
            document.getElementById('themeDarker').value = DATA.theme.darker || '#0d0d0d';
            document.getElementById('themeGray').value = DATA.theme.gray || '#2a2a2a';
            document.getElementById('themeGrayLight').value = DATA.theme.grayLight || '#444444';
            document.getElementById('themeText').value = DATA.theme.text || '#f0f0f0';
            document.getElementById('themeTextDim').value = DATA.theme.textDim || '#aaaaaa';
            document.getElementById('themeGold').value = DATA.theme.gold || '#d4a843';
            document.getElementById('adminFormEndpoint').value = DATA.admin?.formEndpoint || '';
            document.getElementById('adminFormReplyTo').value = DATA.admin?.formReplyTo || '';
            document.getElementById('adminCurrentPassword').value = '';
            document.getElementById('adminNewPassword').value = '';
            document.getElementById('adminNewPasswordConfirm').value = '';

            document.querySelectorAll('.field-input, .field-textarea, .field-select').forEach(el => {
                el.addEventListener('input', debounce(saveFromDOM, 500));
            });
            document.getElementById('heroDesc').addEventListener('input', debounce(saveFromDOM, 500));
            document.querySelectorAll('input[type="color"]').forEach(el => {
                el.addEventListener('input', debounce(saveFromDOM, 300));
            });
            addUploadButtons();

            document.querySelectorAll('input.image-upload-input').forEach(input => {
                input.addEventListener('input', function() {
                    const wrapper = this.closest('.field-group');
                    if (!wrapper) return;
                    const preview = wrapper.querySelector('.img-preview');
                    if (preview) {
                        preview.src = getImageSrc(this.value);
                    }
                });
            });
        }

        // ===== ОТРИСОВКА СПИСКОВ =====
        function renderIconPicker(selected, onChange) {
            return '<div class="icon-picker">' + ICON_KEYS.map(k =>
                '<button type="button" class="icon-picker-btn ' + (k === selected ? 'active' : '') +
                '" onclick="' + onChange + '(this,\'' + k + '\')">' + ICONS[k] + '</button>'
            ).join('') + '</div>';
        }

        function renderFeaturesList(items) {
            const c = document.getElementById('featuresList');
            c.innerHTML = items.map((item, i) => {
                return '<div class="list-item" data-idx="' + i + '">' +
                    '<div class="list-item-header"><span class="list-item-num">#' + (i + 1) + '</span><span style="flex:1"></span>' +
                    '<div class="list-item-actions">' +
                    '<button class="admin-btn btn-sm btn-secondary" onclick="moveFeature(' + i + ',-1)" title="Вверх">↑</button>' +
                    '<button class="admin-btn btn-sm btn-secondary" onclick="moveFeature(' + i + ',1)" title="Вниз">↓</button>' +
                    '<button class="admin-btn btn-sm btn-danger" onclick="removeFeature(' + i + ')" title="Удалить">×</button>' +
                    '</div></div>' +
                    '<div class="list-item-body">' +
                    '<div class="field-group" style="grid-column:1/-1"><label class="field-label">Иконка</label>' +
                    renderIconPicker(item.icon, 'pickFeatureIcon' + i) + '</div>' +
                    '<div class="field-group"><label class="field-label">Заголовок</label><input type="text" class="field-input" value="' +
                    esc(item.title) + '" oninput="updateFeature(' + i + ',\'title\',this.value)"></div>' +
                    '<div class="field-group"><label class="field-label">Описание</label><textarea class="field-textarea" rows="2" oninput="updateFeature(' +
                    i + ',\'text\',this.value)">' + esc(item.text) + '</textarea></div>' +
                    '</div></div>';
            }).join('');
            items.forEach((item, i) => {
                window['pickFeatureIcon' + i] = function(btn, key) {
                    DATA.features.items[i].icon = key;
                    renderFeaturesList(DATA.features.items);
                    saveFromDOM();
                };
            });
            addUploadButtons();
        }

        function renderSpecsList(items) {
            const c = document.getElementById('specsList');
            c.innerHTML = items.map((item, i) => {
                return '<div class="list-item" data-idx="' + i + '">' +
                    '<div class="list-item-header"><span class="list-item-num">#' + (i + 1) + '</span><span style="flex:1"></span>' +
                    '<div class="list-item-actions">' +
                    '<button class="admin-btn btn-sm btn-secondary" onclick="moveSpec(' + i + ',-1)">↑</button>' +
                    '<button class="admin-btn btn-sm btn-secondary" onclick="moveSpec(' + i + ',1)">↓</button>' +
                    '<button class="admin-btn btn-sm btn-danger" onclick="removeSpec(' + i + ')">×</button>' +
                    '</div></div>' +
                    '<div class="list-item-body">' +
                    '<div class="field-group"><label class="field-label">Параметр</label><input type="text" class="field-input" value="' +
                    esc(item.label) + '" oninput="updateSpec(' + i + ',\'label\',this.value)"></div>' +
                    '<div class="field-group"><label class="field-label">Значение</label><input type="text" class="field-input" value="' +
                    esc(item.value) + '" oninput="updateSpec(' + i + ',\'value\',this.value)"></div>' +
                    '</div></div>';
            }).join('');
            addUploadButtons();
        }

        function renderGalleryList(cells) {
            const c = document.getElementById('galleryList');
            const typeOpts = (sel, i) =>
                '<select class="field-select" onchange="updateGalleryCell(' + i + ',\'type\',this.value)"><option value="image" ' +
                (sel === 'image' ? 'selected' : '') + '>Изображение</option><option value="block" ' + (sel === 'block' ?
                    'selected' : '') + '>Цветной блок</option></select>';
            const colorOpts = (sel, i) =>
                '<select class="field-select" onchange="updateGalleryCell(' + i +
                ',\'color\',this.value)">' + Object.keys(GALLERY_COLORS).map(k =>
                    '<option value="' + k + '" ' + (sel === k ? 'selected' : '') + ' style="background:' + GALLERY_COLORS[
                        k] + '">' + k + '</option>'
                ).join('') + '</select>';
            c.innerHTML = cells.map((cell, i) => {
                let extra = '';
                if (cell.type === 'image') {
                    extra =
                        '<div class="field-group"><label class="field-label">URL изображения</label><input type="text" class="field-input image-upload-input" value="' +
                        esc(cell.src || '') + '" oninput="updateGalleryCell(' + i +
                        ',\'src\',this.value)"><img class="img-preview" src="' + (cell.src ? getImageSrc(cell.src) : '') + '"></div>' +
                        '<div class="field-group"><label class="field-label">Подпись</label><input type="text" class="field-input" value="' +
                        esc(cell.label || '') + '" oninput="updateGalleryCell(' + i +
                        ',\'label\',this.value)"></div>';
                } else {
                    extra =
                        '<div class="field-group"><label class="field-label">Цвет блока</label>' + colorOpts(cell
                            .color || 'red', i) + '</div>' +
                        '<div class="field-group"><label class="field-label">Иконка</label>' + renderIconPicker(
                            cell.icon || 'check', 'pickGalleryIcon' + i) + '</div>' +
                        '<div class="field-group"><label class="field-label">Текст</label><input type="text" class="field-input" value="' +
                        esc(cell.text || '') + '" oninput="updateGalleryCell(' + i +
                        ',\'text\',this.value)"></div>';
                }
                return '<div class="list-item" data-idx="' + i + '">' +
                    '<div class="list-item-header"><span class="list-item-num">#' + (i + 1) + '</span><span style="flex:1"></span>' +
                    '<div class="list-item-actions">' +
                    '<button class="admin-btn btn-sm btn-secondary" onclick="moveGalleryCell(' + i +
                    ',-1)">↑</button>' +
                    '<button class="admin-btn btn-sm btn-secondary" onclick="moveGalleryCell(' + i +
                    ',1)">↓</button>' +
                    '<button class="admin-btn btn-sm btn-danger" onclick="removeGalleryCell(' + i +
                    ')">×</button>' +
                    '</div></div>' +
                    '<div class="list-item-body">' +
                    '<div class="field-group"><label class="field-label">Тип ячейки</label>' + typeOpts(cell.type,
                        i) + '</div>' +
                    '<div class="field-group"><label class="field-label">Ссылка (опц.)</label><input type="text" class="field-input" value="' +
                    esc(cell.link || '') + '" oninput="updateGalleryCell(' + i + ',\'link\',this.value)"></div>' +
                    extra +
                    '</div></div>';
            }).join('');
            cells.forEach((cell, i) => {
                if (cell.type === 'block') {
                    window['pickGalleryIcon' + i] = function(btn, key) {
                        DATA.gallery.cells[i].icon = key;
                        renderGalleryList(DATA.gallery.cells);
                        saveFromDOM();
                    };
                }
            });
            addUploadButtons();
            document.querySelectorAll('#galleryList input.image-upload-input').forEach(input => {
                input.addEventListener('input', function() {
                    const wrapper = this.closest('.field-group');
                    if (!wrapper) return;
                    const preview = wrapper.querySelector('.img-preview');
                    if (preview) {
                        preview.src = getImageSrc(this.value);
                    }
                });
            });
        }

        function esc(t) { if (!t) return ''; return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;'); }

        // ===== ОПЕРАЦИИ С КАРТОЧКАМИ =====
        function updateFeature(i, f, v) { DATA.features.items[i][f] = v; }
        function removeFeature(i) { DATA.features.items.splice(i, 1); renderFeaturesList(DATA.features.items);
            showToast('Карточка удалена', 'success'); }
        function addFeature() { DATA.features.items.push({ icon: "check", title: "Новое преимущество", text: "Описание..." });
            renderFeaturesList(DATA.features.items);
            showToast('Карточка добавлена', 'success'); }
        function moveFeature(i, dir) { const ni = i + dir; if (ni < 0 || ni >= DATA.features.items.length) return;
            [DATA.features.items[i], DATA.features.items[ni]] = [DATA.features.items[ni], DATA.features.items[i]];
            renderFeaturesList(DATA.features.items); }

        function updateSpec(i, f, v) { DATA.specs.items[i][f] = v; }
        function removeSpec(i) { DATA.specs.items.splice(i, 1); renderSpecsList(DATA.specs.items);
            showToast('Параметр удалён', 'success'); }
        function addSpec() { DATA.specs.items.push({ label: "Новый параметр", value: "—" }); renderSpecsList(DATA.specs
                .items);
            showToast('Параметр добавлен', 'success'); }
        function moveSpec(i, dir) { const ni = i + dir; if (ni < 0 || ni >= DATA.specs.items.length) return;
            [DATA.specs.items[i], DATA.specs.items[ni]] = [DATA.specs.items[ni], DATA.specs.items[i]];
            renderSpecsList(DATA.specs.items); }

        function updateGalleryCell(i, f, v) { DATA.gallery.cells[i][f] = v; if (f === 'type') renderGalleryList(DATA
                .gallery.cells); }
        function removeGalleryCell(i) { if (DATA.gallery.cells.length <= 1) { showToast('Нужна хотя бы одна ячейка',
                    'error'); return; }
            DATA.gallery.cells.splice(i, 1); renderGalleryList(DATA.gallery.cells);
            showToast('Ячейка удалена', 'success'); }
        function moveGalleryCell(i, dir) { const ni = i + dir; if (ni < 0 || ni >= DATA.gallery.cells.length) return;
            [DATA.gallery.cells[i], DATA.gallery.cells[ni]] = [DATA.gallery.cells[ni], DATA.gallery.cells[i]];
            renderGalleryList(DATA.gallery.cells); }

        // ===== СОХРАНЕНИЕ ИЗ DOM в DATA =====
        function saveFromDOM() {
            DATA.hero.title = document.getElementById('heroTitle').value;
            DATA.hero.subtitle = document.getElementById('heroSubtitle').value;
            DATA.hero.desc = document.getElementById('heroDesc').innerHTML;
            DATA.hero.badgeText = document.getElementById('heroBadgeText').value;
            DATA.hero.badgeLink = document.getElementById('heroBadgeLink').value;
            DATA.hero.bgImage = document.getElementById('heroBgImage').value;
            DATA.hero.boilerImage = document.getElementById('heroBoilerImage').value;
            DATA.hero.ctaText = document.getElementById('heroCtaText').value;
            DATA.contacts.phone = document.getElementById('heroPhone').value;
            DATA.contacts.phoneDisplay = document.getElementById('heroPhoneDisplay').value;
            DATA.contacts.email = document.getElementById('heroEmail').value;
            DATA.contacts.emailDisplay = document.getElementById('heroEmailDisplay').value;
            DATA.contacts.whatsapp = document.getElementById('heroWhatsapp').value;
            DATA.contacts.telegram = document.getElementById('heroTelegram').value;
            DATA.features.title = document.getElementById('featuresTitle').value;
            DATA.features.subtitle = document.getElementById('featuresSubtitle').value;
            DATA.specs.title = document.getElementById('specsTitle').value;
            DATA.specs.subtitle = document.getElementById('specsSubtitle').value;
            DATA.specs.image = document.getElementById('specsImage').value;
            DATA.gallery.title = document.getElementById('galleryTitle').value;
            DATA.contacts.title = document.getElementById('contactTitle').value;
            DATA.contacts.phone = document.getElementById('contactPhone').value;
            DATA.contacts.phoneDisplay = document.getElementById('contactPhoneDisplay').value;
            DATA.contacts.email = document.getElementById('contactEmail').value;
            DATA.contacts.emailDisplay = document.getElementById('contactEmailDisplay').value;
            DATA.contacts.region = document.getElementById('contactRegion').value;
            DATA.cta.title = document.getElementById('ctaTitle').value;
            DATA.cta.desc = document.getElementById('ctaDesc').value;
            DATA.cta.button = document.getElementById('ctaButton').value;
            DATA.footer.company = document.getElementById('footerCompany').value;
            DATA.footer.tagline = document.getElementById('footerTagline').value;
            DATA.footer.phone = document.getElementById('footerPhone').value;
            DATA.footer.email = document.getElementById('footerEmail').value;
            DATA.footer.whatsapp = document.getElementById('footerWhatsapp').value;
            DATA.footer.telegram = document.getElementById('footerTelegram').value;
            DATA.footer.copyright = document.getElementById('footerCopyright').value;
            DATA.footer.patentLink = document.getElementById('footerPatentLink').value;
            DATA.footer.patentText = document.getElementById('footerPatentText').value;
            DATA.media = DATA.media || {};
            DATA.media.phoneIcon = document.getElementById('mediaPhoneIcon').value;
            DATA.media.whatsappIcon = document.getElementById('mediaWhatsappIcon').value;
            DATA.media.telegramIcon = document.getElementById('mediaTelegramIcon').value;
            DATA.media.emailIcon = document.getElementById('mediaEmailIcon').value;
            DATA.media.fireIcon = document.getElementById('mediaFireIcon').value;
            DATA.media.favicon = document.getElementById('mediaFavicon').value;
            DATA.seo.title = document.getElementById('seoTitle').value;
            DATA.seo.description = document.getElementById('seoDesc').value;
            DATA.seo.keywords = document.getElementById('seoKeywords').value;
            DATA.seo.ogImage = document.getElementById('seoOgImage').value;
            DATA.seo.canonical = document.getElementById('seoCanonical').value;
            DATA.seo.author = document.getElementById('seoAuthor').value;
            DATA.seo.robots = document.getElementById('seoRobots').value;
            DATA.theme.orange = document.getElementById('themeOrange').value;
            DATA.theme.orangeLight = document.getElementById('themeOrangeLight').value;
            DATA.theme.orangeDark = document.getElementById('themeOrangeDark').value;
            DATA.theme.dark = document.getElementById('themeDark').value;
            DATA.theme.darker = document.getElementById('themeDarker').value;
            DATA.theme.gray = document.getElementById('themeGray').value;
            DATA.theme.grayLight = document.getElementById('themeGrayLight').value;
            DATA.theme.text = document.getElementById('themeText').value;
            DATA.theme.textDim = document.getElementById('themeTextDim').value;
            DATA.theme.gold = document.getElementById('themeGold').value;
            DATA.admin.formEndpoint = document.getElementById('adminFormEndpoint').value;
            DATA.admin.formReplyTo = document.getElementById('adminFormReplyTo').value;
        }

        // ===== СОХРАНЕНИЕ НА СЕРВЕР =====
        function saveAll() {
            saveFromDOM();
            fetch('/admin?action=save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(DATA)
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    showToast('Все изменения сохранены!', 'success');
                    refreshPreview();
                } else {
                    showToast('Ошибка сохранения', 'error');
                }
            })
            .catch(() => showToast('Ошибка сети при сохранении', 'error'));
        }

        function resetToDefault() {
            if (!confirm('Сбросить все изменения к значениям по умолчанию?')) return;
            location.reload();
        }

        function exportData() {
            const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'teplodinamik-data.json';
            a.click();
            showToast('Данные экспортированы', 'success');
        }

        function importData(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    fetch('/admin?action=save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    })
                    .then(r => r.json())
                    .then(res => {
                        if (res.success) {
                            location.reload();
                        } else {
                            showToast('Ошибка импорта', 'error');
                        }
                    });
                } catch (err) {
                    showToast('Ошибка импорта: неверный JSON', 'error');
                }
            };
            reader.readAsText(file);
            input.value = '';
        }

        // ===== НАВИГАЦИЯ =====
        function switchSection(s) {
            document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.editor-section').forEach(el => el.classList.remove('active'));
            document.querySelector('.sidebar-item[data-section="' + s + '"]')?.classList.add('active');
            document.getElementById('section-' + s)?.classList.add('active');
            document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.mobile-nav-btn[data-section="' + s + '"]')?.classList.add('active');
        }

        function execCmd(c) { document.execCommand(c, false, null);
            document.getElementById('heroDesc').focus(); }

        // ===== ПРЕДПРОСМОТР =====
        function togglePreview() {
            const panel = document.getElementById('previewPanel');
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) {
                refreshPreview();
            }
        }

        function refreshPreview() {
            const frame = document.getElementById('previewFrame');
            const errorEl = document.getElementById('previewError');
            const url = PREVIEW_BASE + '?t=' + Date.now();
            frame.src = url;
            errorEl.classList.remove('visible');

            frame.onload = function() {
                errorEl.classList.remove('visible');
            };
            frame.onerror = function() {
                errorEl.classList.add('visible');
            };
            setTimeout(function() {
                try {
                    if (!frame.contentWindow || frame.contentWindow.location.href === 'about:blank') {
                        errorEl.classList.add('visible');
                    }
                } catch (e) {
                    errorEl.classList.add('visible');
                }
            }, 5000);
        }

        // ===== МОБИЛЬНАЯ НАВИГАЦИЯ =====
        const SECTIONS = ['hero', 'features', 'specs', 'gallery', 'contacts', 'cta', 'footer', 'media', 'seo', 'theme',
            'admin'
        ];
        const SECTION_NAMES = {
            hero: 'Hero',
            features: 'Преимущества',
            specs: 'Характеристики',
            gallery: 'Галерея',
            contacts: 'Контакты',
            cta: 'CTA',
            footer: 'Футер',
            media: 'Медиа',
            seo: 'SEO',
            theme: 'Тема',
            admin: 'Администрирование'
        };
        const mobileNavScroll = document.getElementById('mobileNavScroll');
        SECTIONS.forEach(s => {
            const b = document.createElement('button');
            b.className = 'mobile-nav-btn' + (s === 'hero' ? ' active' : '');
            b.textContent = SECTION_NAMES[s];
            b.dataset.section = s;
            b.onclick = () => {
                document.querySelectorAll('.mobile-nav-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                switchSection(s);
            };
            mobileNavScroll.appendChild(b);
        });

        document.getElementById('mobileNavLeft').addEventListener('click', function() {
            document.getElementById('mobileNavScroll').scrollBy({ left: -200, behavior: 'smooth' });
        });
        document.getElementById('mobileNavRight').addEventListener('click', function() {
            document.getElementById('mobileNavScroll').scrollBy({ left: 200, behavior: 'smooth' });
        });

        // ===== TOAST =====
        function showToast(msg, type) {
            const c = document.getElementById('toastContainer');
            const t = document.createElement('div');
            t.className = 'toast ' + (type || 'success');
            const icon = type === 'success' ?
                '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' :
                '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            t.innerHTML = '<div class="toast-icon">' + icon + '</div><span class="toast-text">' + msg + '</span>';
            c.appendChild(t);
            setTimeout(() => t.remove(), 4000);
        }

        // ===== СМЕНА ПАРОЛЯ =====
        async function changePassword() {
            const currentPass = document.getElementById('adminCurrentPassword').value;
            const newPass = document.getElementById('adminNewPassword').value;
            const confirmPass = document.getElementById('adminNewPasswordConfirm').value;

            if (!currentPass) { showToast('Введите текущий пароль', 'error'); return; }
            if (!newPass) { showToast('Введите новый пароль', 'error'); return; }
            if (newPass !== confirmPass) { showToast('Новый пароль и подтверждение не совпадают', 'error'); return; }
            if (newPass.length < 4) { showToast('Новый пароль должен быть не короче 4 символов', 'error'); return; }

            const formData = new FormData();
            formData.append('current', currentPass);
            formData.append('new', newPass);

            try {
                const resp = await fetch('/admin?action=change_password', {
                    method: 'POST',
                    body: formData
                });
                const result = await resp.json();
                if (result.success) {
                    showToast('Пароль успешно изменён!', 'success');
                    document.getElementById('adminCurrentPassword').value = '';
                    document.getElementById('adminNewPassword').value = '';
                    document.getElementById('adminNewPasswordConfirm').value = '';
                } else {
                    showToast(result.error || 'Ошибка смены пароля', 'error');
                }
            } catch (e) {
                showToast('Ошибка сети при смене пароля', 'error');
            }
        }

        function saveAdminSettings() {
            DATA.admin.formEndpoint = document.getElementById('adminFormEndpoint').value;
            DATA.admin.formReplyTo = document.getElementById('adminFormReplyTo').value;
            saveAll();
        }

        function logout() {
            window.location.href = '/admin?action=logout';
        }

        // ===== ЗАПУСК =====
        document.addEventListener('DOMContentLoaded', initEditor);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initEditor);
        } else {
            initEditor();
        }
    </script>
</body>
</html>
