<?php
// functions.php

function getDataFile() {
    return __DIR__ . '/data/data.json';
}

function getData() {
    $file = getDataFile();
    if (!file_exists($file)) {
        $default = getDefaultData();
        saveData($default);
        return $default;
    }
    $json = file_get_contents($file);
    $data = json_decode($json, true);
    if ($data === null) {
        $default = getDefaultData();
        saveData($default);
        return $default;
    }
    // Гарантируем наличие всех ключей
    $default = getDefaultData();
    foreach ($default as $key => $value) {
        if (!isset($data[$key])) {
            $data[$key] = $value;
        }
    }
    if (!isset($data['uploads'])) {
        $data['uploads'] = [];
    }
    return $data;
}

function saveData($data) {
    $file = getDataFile();
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function getDefaultData() {
    return [
        'hero' => [
            'title' => 'Теплодинамик',
            'subtitle' => 'Пеллетные автоматические энергонезависимые котлы',
            'desc' => 'Автономная система отопления с автоматической подачей топлива. Бункер 75 кг обеспечивает непрерывную работу до 3 суток без вмешательства.',
            'badgeText' => 'Российский патент',
            'badgeLink' => 'https://rospatent.gov.ru/',
            'bgImage' => 'img/Фон.jpg',
            'boilerImage' => 'img/Рис 2.jpg',
            'ctaText' => 'Оставить заявку'
        ],
        'features' => [
            'title' => 'Преимущества Теплодинамика',
            'subtitle' => 'Инновационные решения для автономного отопления вашего дома',
            'items' => [
                ['icon' => 'check', 'title' => 'Автономная работа', 'text' => 'Полностью энергонезависимая система. Не требует подключения к электросети для работы механизмов подачи топлива.'],
                ['icon' => 'auto', 'title' => 'Автоматическая подача', 'text' => 'Механизм автоматической подачи пеллет обеспечивает стабильное горение без постоянного контроля.'],
                ['icon' => 'bunker', 'title' => 'Бункер 75 кг', 'text' => 'Вместительный бункер для пеллет обеспечивает автономную работу до 3 суток без дозагрузки топлива.'],
                ['icon' => 'power', 'title' => 'Регулировка мощности', 'text' => 'Плавная регулировка тепловой мощности позволяет адаптировать работу котла под любые условия.'],
                ['icon' => 'temp', 'title' => 'Регулировка температуры', 'text' => 'Точная регулировка температуры теплоносителя для комфортного микроклимата в помещении.'],
                ['icon' => 'steel', 'title' => 'Сталь 09Г2С', 'text' => 'Корпус из высокопрочной конструкционной стали обеспечивает долговечность и надёжность.'],
                ['icon' => 'eco', 'title' => 'Экологичность', 'text' => 'Древесные пеллеты — возобновляемое топливо. Минимальные выбросы CO₂ и зола пригодна как удобрение.'],
                ['icon' => 'factory', 'title' => 'Российское производство', 'text' => 'Полный цикл производства в России. Запчасти и сервисное обслуживание доступны без импортных задержек.']
            ]
        ],
        'specs' => [
            'title' => 'Технические характеристики',
            'subtitle' => 'Модель Теплодинамик — 10 кВт',
            'image' => 'img/Рис 1.jpg',
            'items' => [
                ['label' => 'Тепловая мощность', 'value' => '10 кВт'],
                ['label' => 'Масса котла', 'value' => '295 кг'],
                ['label' => 'Материал корпуса', 'value' => 'Сталь 09Г2С'],
                ['label' => 'Ёмкость бункера', 'value' => '75 кг пеллет'],
                ['label' => 'Автономность', 'value' => 'До 3 суток'],
                ['label' => 'Тип топлива', 'value' => 'Древесные пеллеты'],
                ['label' => 'Подача топлива', 'value' => 'Автоматическая'],
                ['label' => 'Регулировка', 'value' => 'Мощность + Температура']
            ]
        ],
        'gallery' => [
            'title' => 'Визуальный обзор',
            'cells' => [
                ['type' => 'image', 'src' => 'img/Анимация1.gif', 'label' => '3D-модель', 'link' => ''],
                ['type' => 'block', 'color' => 'red', 'icon' => 'check', 'text' => 'Патент', 'link' => 'https://rospatent.gov.ru/'],
                ['type' => 'image', 'src' => 'img/Рис 2.jpg', 'label' => 'Визуализация', 'link' => ''],
                ['type' => 'block', 'color' => 'blue', 'icon' => 'shield', 'text' => '10 кВт', 'link' => ''],
                ['type' => 'block', 'color' => 'yellow', 'icon' => 'bunker', 'text' => '75 кг', 'link' => '']
            ]
        ],
        'contacts' => [
            'phone' => '+7-913-000-00-00',
            'phoneDisplay' => '+7-913-XXX-XX-XX',
            'email' => 'info@teplodinamik.ru',
            'emailDisplay' => 'xxxxxxx@xxxxxxx.ru',
            'whatsapp' => 'https://wa.me/79130000000',
            'telegram' => 'https://t.me/teplodinamik',
            'title' => 'Свяжитесь с нами',
            'region' => 'Россия, Сибирь'
        ],
        'cta' => [
            'title' => 'Готовы к автономному отоплению?',
            'desc' => 'Получите консультацию специалиста и расчёт стоимости установки',
            'button' => 'Заказать консультацию'
        ],
        'footer' => [
            'company' => 'ТЕПЛОДИНАМИК',
            'tagline' => 'Пеллетные автоматические энергонезависимые котлы',
            'phone' => '+7-913-ХХХ-ХХ-ХХ',
            'email' => 'xxxxxxx@xxxxxxx.ru',
            'whatsapp' => 'https://wa.me/79130000000',
            'telegram' => 'https://t.me/teplodinamik',
            'copyright' => 'Российская Федерация',
            'patentLink' => 'https://rospatent.gov.ru/',
            'patentText' => 'Патент'
        ],
        'media' => [
            'phoneIcon' => 'img/телефон.png',
            'whatsappIcon' => 'img/вотсап.png',
            'telegramIcon' => 'img/телеграм.png',
            'emailIcon' => 'img/почта.png',
            'fireIcon' => 'img/огонь.png',
            'favicon' => 'img/favicon.ico'
        ],
        'seo' => [
            'title' => 'Теплодинамик — Пеллетные автоматические энергонезависимые котлы',
            'description' => 'Теплодинамик — пеллетные автоматические энергонезависимые котлы. Автономная работа до 3 суток, бункер 75 кг, сталь 09Г2С. Российский патент.',
            'keywords' => 'пеллетный котел, автоматический котел, энергонезависимый котел, твердотопливный котел, отопление пеллетами, котел Теплодинамик, котел 10 кВт',
            'ogImage' => 'https://teplodinamik.ru/og-image.jpg',
            'canonical' => 'https://teplodinamik.ru/',
            'author' => 'Теплодинамик',
            'robots' => 'index, follow'
        ],
        'theme' => [
            'orange' => '#e86a17',
            'orangeLight' => '#f08a45',
            'orangeDark' => '#c4520a',
            'dark' => '#1a1a1a',
            'darker' => '#0d0d0d',
            'gray' => '#2a2a2a',
            'grayLight' => '#444444',
            'text' => '#f0f0f0',
            'textDim' => '#aaaaaa',
            'gold' => '#d4a843'
        ],
        'admin' => [
            // Пароль по умолчанию "1234" – теперь используется bcrypt с солью
            'passwordHash' => password_hash('1234', PASSWORD_BCRYPT, ['cost' => 12]),
            'formEndpoint' => 'https://formspree.io/f/mwvglazw',
            'formReplyTo' => 'alex.typeface@gmail.com'
        ],
        'uploads' => []
    ];
}

/**
 * Генерирует надёжный хеш пароля с использованием bcrypt
 */
function generatePasswordHash($password) {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

/**
 * Проверяет пароль с поддержкой миграции со старого SHA‑256
 */
function checkAuth($password) {
    $data = getData();
    $stored = $data['admin']['passwordHash'] ?? '';

    // 1. Проверка через password_verify (bcrypt)
    if (password_verify($password, $stored)) {
        return true;
    }

    // 2. Fallback для старого SHA‑256 (длина 64 символа)
    if (strlen($stored) === 64 && hash('sha256', $password) === $stored) {
        // Обновляем хеш на bcrypt и сохраняем
        $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $data['admin']['passwordHash'] = $newHash;
        saveData($data);
        return true;
    }

    return false;
}

function uploadImage($file) {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return false;
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon'];
    if (!in_array($mime, $allowed)) {
        return false;
    }
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    if (empty($ext)) {
        $ext = 'png';
    }
    $filename = uniqid() . '.' . $ext;
    $uploadDir = __DIR__ . '/img/uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    $dest = $uploadDir . $filename;
    if (move_uploaded_file($file['tmp_name'], $dest)) {
        return 'img/uploads/' . $filename;
    }
    return false;
}

function ensureUploadsDir() {
    $dir = __DIR__ . '/img/uploads/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}
?>