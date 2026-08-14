<?php
require_once 'functions.php';
$data = getData();
$theme = $data['theme'];
$seo = $data['seo'];
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes" />
    <title><?php echo htmlspecialchars($seo['title']); ?></title>
    <meta name="description" content="<?php echo htmlspecialchars($seo['description']); ?>" />
    <meta name="keywords" content="<?php echo htmlspecialchars($seo['keywords']); ?>" />
    <meta name="author" content="<?php echo htmlspecialchars($seo['author']); ?>" />
    <meta name="robots" content="<?php echo htmlspecialchars($seo['robots']); ?>" />
    <link rel="canonical" href="<?php echo htmlspecialchars($seo['canonical']); ?>" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Теплодинамик" />
    <meta property="og:title" content="<?php echo htmlspecialchars($seo['title']); ?>" />
    <meta property="og:description" content="<?php echo htmlspecialchars($seo['description']); ?>" />
    <meta property="og:url" content="<?php echo htmlspecialchars($seo['canonical']); ?>" />
    <meta property="og:image" content="<?php echo htmlspecialchars($seo['ogImage']); ?>" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="ru_RU" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?php echo htmlspecialchars($seo['title']); ?>" />
    <meta name="twitter:description" content="<?php echo htmlspecialchars($seo['description']); ?>" />
    <meta name="twitter:image" content="<?php echo htmlspecialchars($seo['ogImage']); ?>" />
    <meta name="geo.region" content="RU" />
    <meta name="geo.placename" content="Россия, Сибирь" />
    <link rel="icon" type="image/x-icon" href="<?php echo htmlspecialchars($data['media']['favicon']); ?>" />
    <link rel="icon" type="image/png" sizes="32x32" href="img/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="img/favicon-16x16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="img/apple-touch-icon.png" />
    <link rel="manifest" href="site.webmanifest" />
    <meta name="theme-color" content="<?php echo htmlspecialchars($theme['orange']); ?>" />

    <!-- ===== ПРЕДЗАГРУЗОЧНЫЙ МИНИ-CSS ===== -->
    <style>
        /* ---- ГЛОБАЛЬНЫЙ СБРОС ДЛЯ МАСКИ ---- */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html,
        body {
            width: 100%;
            min-height: 100vh;
            background: <?php echo htmlspecialchars($theme['darker']); ?>;
            overflow: hidden;
        }
        /* ---- МАСКА (loader) ---- */
        #loader-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: <?php echo htmlspecialchars($theme['darker']); ?>;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 24px;
            opacity: 1;
            visibility: visible;
            transition: opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                visibility 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            pointer-events: auto;
            font-family: 'Roboto', sans-serif;
            color: <?php echo htmlspecialchars($theme['text']); ?>;
            padding: 20px;
        }
        #loader-overlay.hidden {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
        }
        .loader-brand {
            font-family: 'Oswald', sans-serif;
            font-size: clamp(32px, 6vw, 56px);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 4px;
            color: #fff;
            text-shadow: 0 0 40px rgba(232, 106, 23, 0.15);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .loader-brand span {
            color: <?php echo htmlspecialchars($theme['orange']); ?>;
        }
        .loader-sub {
            font-size: clamp(14px, 1.8vw, 18px);
            font-weight: 300;
            color: #888;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-top: -8px;
        }
        .loader-spinner {
            width: 56px;
            height: 56px;
            border: 3px solid rgba(232, 106, 23, 0.12);
            border-top-color: <?php echo htmlspecialchars($theme['orange']); ?>;
            border-radius: 50%;
            animation: spin 1s cubic-bezier(0.6, 0.2, 0.4, 0.8) infinite;
            box-shadow: 0 0 30px rgba(232, 106, 23, 0.08);
            flex-shrink: 0;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loader-brand {
            opacity: 0;
            animation: brandFadeIn 0.8s ease 0.2s forwards;
        }
        .loader-sub {
            opacity: 0;
            animation: brandFadeIn 0.8s ease 0.4s forwards;
        }
        .loader-spinner {
            opacity: 0;
            animation: spin 1s cubic-bezier(0.6, 0.2, 0.4, 0.8) infinite,
                brandFadeIn 0.8s ease 0.1s forwards;
        }
        @keyframes brandFadeIn {
            0% { opacity: 0; transform: translateY(12px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        .loader-dots {
            display: flex;
            gap: 8px;
            margin-top: 4px;
        }
        .loader-dots span {
            width: 8px;
            height: 8px;
            background: <?php echo htmlspecialchars($theme['orange']); ?>;
            border-radius: 50%;
            display: inline-block;
            animation: dotPulse 1.4s ease-in-out infinite both;
        }
        .loader-dots span:nth-child(1) { animation-delay: 0s; }
        .loader-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loader-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotPulse {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.2; }
            40% { transform: scale(1); opacity: 1; }
        }
        .loader-progress {
            width: 160px;
            height: 2px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 4px;
            position: relative;
        }
        .loader-progress-bar {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, <?php echo htmlspecialchars($theme['orange']); ?>, <?php echo htmlspecialchars($theme['orangeLight']); ?>);
            border-radius: 4px;
            animation: progressFill 2.2s ease-in-out infinite alternate;
        }
        @keyframes progressFill {
            0% { width: 0%; transform: translateX(0); }
            100% { width: 100%; transform: translateX(0); }
        }
        @media (max-width: 600px) {
            .loader-brand { font-size: 28px; letter-spacing: 2px; }
            .loader-spinner { width: 44px; height: 44px; border-width: 3px; }
            .loader-progress { width: 120px; }
            .loader-sub { font-size: 13px; letter-spacing: 2px; }
        }
        @media (max-width: 400px) {
            .loader-brand { font-size: 22px; }
            .loader-spinner { width: 36px; height: 36px; border-width: 2.5px; }
            .loader-progress { width: 100px; }
            .loader-sub { font-size: 11px; }
            .loader-dots span { width: 6px; height: 6px; }
        }
    </style>

    <!-- ===== ОСНОВНОЙ СТИЛЬ ===== -->
    <style>
        /* ===== ЛОКАЛЬНЫЕ ШРИФТЫ ===== */
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

        /* ===== ГЛОБАЛЬНЫЙ СБРОС ===== */
        * { margin: 0; padding: 0; box-sizing: border-box; max-width: 100vw; }
        html { overflow-x: hidden; overflow-y: auto; max-width: 100vw; }
        body { overflow-x: hidden; overflow-y: hidden; max-width: 100vw; font-family: 'Roboto', sans-serif; color: <?php echo htmlspecialchars($theme['text']); ?>; background: <?php echo htmlspecialchars($theme['darker']); ?>; position: relative; }
        :root {
            --orange: <?php echo htmlspecialchars($theme['orange']); ?>;
            --orange-light: <?php echo htmlspecialchars($theme['orangeLight']); ?>;
            --orange-dark: <?php echo htmlspecialchars($theme['orangeDark']); ?>;
            --dark: <?php echo htmlspecialchars($theme['dark']); ?>;
            --darker: <?php echo htmlspecialchars($theme['darker']); ?>;
            --gray: <?php echo htmlspecialchars($theme['gray']); ?>;
            --gray-light: <?php echo htmlspecialchars($theme['grayLight']); ?>;
            --text: <?php echo htmlspecialchars($theme['text']); ?>;
            --text-dim: <?php echo htmlspecialchars($theme['textDim']); ?>;
            --gold: <?php echo htmlspecialchars($theme['gold']); ?>;
            --mondrian-red: #e63946;
            --mondrian-blue: #1d3557;
            --mondrian-yellow: #f4a261;
            --mondrian-black: #111;
            --mondrian-white: #f1faee;
        }
        html.modal-open, body.modal-open { overflow: hidden !important; padding-right: var(--scrollbar-width, 0px) !important; }

        /* ===== HERO ===== */
        .hero { position: relative; width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .hero-bg { position: absolute; inset: 0; background: url('<?php echo htmlspecialchars($data['hero']['bgImage']); ?>') center/cover no-repeat; filter: brightness(0.35) saturate(1.2); z-index: 0; }
        .hero-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%); z-index: 1; }
        .hero-content { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; max-width: 900px; width: 100%; }
        .hero-badge { display: inline-block; background: rgba(232,106,23,0.15); border: 1px solid var(--orange); color: var(--orange-light); padding: 6px 18px; border-radius: 30px; font-size: 13px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; transition: background .2s; text-decoration: none; color: inherit; }
        .hero-badge:hover { background: rgba(232,106,23,0.25); }
        .hero h1 { font-family: 'Oswald', sans-serif; font-size: clamp(42px, 8vw, 80px); font-weight: 700; line-height: 1.05; text-transform: uppercase; letter-spacing: 3px; color: #fff; text-shadow: 0 4px 30px rgba(0,0,0,0.5); margin-bottom: 8px; }
        .hero h1 span { color: var(--orange); }
        .hero-subtitle { font-family: 'Oswald', sans-serif; font-size: clamp(18px, 3vw, 28px); font-weight: 400; color: var(--gold); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 20px; }
        .hero-desc { font-size: 17px; line-height: 1.7; color: var(--text-dim); max-width: 600px; margin: 0 auto 28px; }
        .hero-contacts { width: 100%; max-width: 560px; margin: 0 auto 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .hero-contact-row { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px 18px; width: 100%; }
        .hero-contact-item { display: inline-flex; align-items: center; gap: 8px; }
        .hero-contact-icon-wrap { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(232,106,23,0.15); border: 1px solid rgba(232,106,23,0.3); flex-shrink: 0; }
        .hero-contact-icon-wrap--transparent { background: transparent; border: 1px solid rgba(232,106,23,0.3); }
        .hero-contact-icon { width: 18px; height: 18px; object-fit: contain; flex-shrink: 0; }
        .hero-contact-text { font-size: 15px; color: var(--text); font-weight: 500; white-space: nowrap; }
        .hero-socials { display: inline-flex; align-items: center; gap: 8px; }
        .hero-social-link { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(232,106,23,0.15); border: 1px solid rgba(232,106,23,0.3); transition: all .2s ease; position: relative; flex-shrink: 0; }
        .hero-social-link:hover { background: var(--orange); border-color: var(--orange); transform: translateY(-2px); }
        .hero-social-link[data-tooltip]::after { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%) scale(.9); background: var(--dark); color: var(--text); padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; font-family: 'Roboto', sans-serif; white-space: nowrap; border: 1px solid var(--gray-light); box-shadow: 0 6px 20px rgba(0,0,0,0.5); opacity: 0; visibility: hidden; transition: opacity .25s ease, transform .25s ease, visibility .25s ease; pointer-events: none; z-index: 20; letter-spacing: .5px; }
        .hero-social-link[data-tooltip]:hover::after { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
        .hero-social-link[data-tooltip]::before { content: ''; position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%) scale(.9); border: 6px solid transparent; border-top-color: var(--dark); opacity: 0; visibility: hidden; transition: opacity .25s ease, transform .25s ease, visibility .25s ease; pointer-events: none; z-index: 20; }
        .hero-social-link[data-tooltip]:hover::before { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
        .hero-social-icon { width: 18px; height: 18px; object-fit: contain; }
        .hero-cta { display: inline-flex; align-items: center; justify-content: center; gap: 12px; background: var(--orange); color: #fff; padding: 16px 40px; border-radius: 50px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border: none; cursor: pointer; transition: all .3s ease; box-shadow: 0 8px 30px rgba(232,106,23,0.4); text-decoration: none; margin: 0 auto; }
        .hero-cta:hover { background: var(--orange-light); transform: translateY(-2px); box-shadow: 0 12px 40px rgba(232,106,23,0.5); }
        .hero-cta svg { width: 20px; height: 20px; fill: currentColor; }

        /* ===== SCROLL INDICATOR ===== */
        .scroll-indicator {
            position: absolute;
            left: 50%;
            z-index: 3;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            opacity: 0;
            animation: scrollFadeInUp .8s ease .6s forwards;
        }
        .scroll-indicator-arrow {
            width: 28px;
            height: 40px;
            position: relative;
        }
        .scroll-indicator-arrow svg {
            width: 100%;
            height: 100%;
            fill: none;
            stroke: var(--orange);
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            animation: scrollBounce 2s ease-in-out infinite;
        }
        @keyframes scrollBounce {
            0%, 20% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(10px); opacity: .5; }
            80%, 100% { transform: translateY(0); opacity: 1; }
        }
        .scroll-indicator:hover .scroll-indicator-arrow svg {
            stroke: var(--orange-light);
            animation-duration: 1s;
        }
        .scroll-indicator-glow {
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 8px;
            height: 8px;
            background: var(--orange);
            border-radius: 50%;
            opacity: 0;
            animation: scrollGlow 2s ease-in-out infinite;
            filter: blur(2px);
        }
        @keyframes scrollGlow {
            0%, 20% { opacity: 0; transform: translateX(-50%) scale(.5); }
            50% { opacity: .6; transform: translateX(-50%) scale(1.2); }
            80%, 100% { opacity: 0; transform: translateX(-50%) scale(.5); }
        }
        @keyframes scrollFadeInUp {
            from { opacity: 0; transform: translateX(-50%) translateY(30px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        .hero-boiler { position: absolute; right: -10%; bottom: -10%; width: 60%; max-width: 700px; opacity: .25; z-index: 1; pointer-events: none; filter: drop-shadow(0 0 60px rgba(232,106,23,0.3)); }

        /* ===== ANIMATIONS ===== */
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-in { opacity: 0; animation: fadeInUp .8s ease forwards; }
        .delay-1 { animation-delay: .1s; }
        .delay-2 { animation-delay: .2s; }
        .delay-3 { animation-delay: .3s; }
        .delay-4 { animation-delay: .4s; }

        /* ===== SECTIONS ===== */
        .section { padding: 80px 20px; max-width: 1200px; margin: 0 auto; }
        .section-title { font-family: 'Oswald', sans-serif; font-size: clamp(28px, 5vw, 42px); font-weight: 700; text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 12px; color: #fff; }
        .section-title span { color: var(--orange); }
        .section-subtitle { text-align: center; color: var(--text-dim); font-size: 16px; margin-bottom: 50px; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.6; }

        /* ===== FEATURES ===== */
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
        .feature-card { background: var(--gray); border: 1px solid var(--gray-light); border-radius: 16px; padding: 32px 24px; text-align: center; transition: all .3s ease; position: relative; overflow: hidden; }
        .feature-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--orange); transform: scaleX(0); transition: transform .3s ease; }
        .feature-card:hover { border-color: var(--orange); transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
        .feature-card:hover::before { transform: scaleX(1); }
        .feature-icon { width: 56px; height: 56px; margin: 0 auto 20px; background: rgba(232,106,23,0.1); border-radius: 14px; display: flex; align-items: center; justify-content: center; }
        .feature-icon svg { width: 28px; height: 28px; fill: var(--orange); }
        .feature-card h3 { font-family: 'Oswald', sans-serif; font-size: 20px; font-weight: 500; margin-bottom: 10px; color: #fff; text-transform: uppercase; letter-spacing: 1px; }
        .feature-card p { font-size: 14px; color: var(--text-dim); line-height: 1.6; }

        /* ===== SPECS ===== */
        .specs-section { background: var(--dark); padding: 80px 20px; }
        .specs-wrapper { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
        .specs-image { position: relative; }
        .specs-image img { width: 100%; border-radius: 16px; border: 1px solid var(--gray-light); box-shadow: 0 30px 60px rgba(0,0,0,0.5); display: block; }
        .specs-image::after { content: ''; position: absolute; inset: -10px; border: 1px solid var(--orange); border-radius: 20px; opacity: .3; pointer-events: none; }
        .specs-list { display: flex; flex-direction: column; gap: 16px; }
        .spec-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: var(--gray); border-radius: 10px; border-left: 3px solid var(--orange); transition: all .2s ease; }
        .spec-row:hover { background: var(--gray-light); }
        .spec-label { font-size: 15px; color: var(--text-dim); display: flex; align-items: center; gap: 10px; }
        .spec-fire { width: 18px; height: 18px; flex-shrink: 0; }
        .spec-value { font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 500; color: #fff; }

        /* ===== MONDRIAN GALLERY ===== */
        .mondrian-gallery { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
        .mondrian-grid {
            display: grid;
            grid-template-columns: 2.5fr .9fr 2.5fr;
            grid-template-rows: 180px 180px 180px;
            gap: 12px;
            background: var(--mondrian-black);
            padding: 12px;
            border-radius: 4px;
            max-width: 1000px;
            margin: 0 auto;
        }
        .mondrian-cell {
            position: relative;
            overflow: hidden;
            border-radius: 2px;
            cursor: pointer;
            transition: transform .3s ease, box-shadow .3s ease;
        }
        .mondrian-cell:hover {
            transform: scale(1.02);
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            z-index: 2;
        }
        .mondrian-cell img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform .6s ease;
            display: block;
        }
        .mondrian-cell:hover img {
            transform: scale(1.08);
        }
        .mondrian-cell::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.6) 100%);
            opacity: 0;
            transition: opacity .3s ease;
            pointer-events: none;
        }
        .mondrian-cell:hover::after {
            opacity: 1;
        }
        .mondrian-cell .cell-label {
            position: absolute;
            bottom: 12px;
            left: 12px;
            right: 12px;
            font-family: 'Oswald', sans-serif;
            font-size: 13px;
            font-weight: 500;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0;
            transform: translateY(10px);
            transition: all .3s ease;
            z-index: 3;
            text-shadow: 0 2px 8px rgba(0,0,0,0.8);
        }
        .mondrian-cell:hover .cell-label {
            opacity: 1;
            transform: translateY(0);
        }

        /* ===== РАСКЛАДКА ГАЛЕРЕИ ===== */
        .cell-1 { grid-column: 1 / 2; grid-row: 1 / 4; }
        .cell-2 { grid-column: 2 / 3; grid-row: 3 / 4; background: var(--mondrian-red); }
        .cell-3 { grid-column: 3 / 4; grid-row: 1 / 4; }
        .cell-6 { grid-column: 2 / 3; grid-row: 1 / 2; background: var(--mondrian-blue); }
        .cell-7 { grid-column: 2 / 3; grid-row: 2 / 3; background: var(--mondrian-yellow); }

        .mondrian-cell.cell-6,
        .mondrian-cell.cell-7 {
            cursor: default;
            pointer-events: none;
        }
        .mondrian-cell.cell-6:hover,
        .mondrian-cell.cell-7:hover {
            transform: none !important;
            box-shadow: none !important;
        }
        .mondrian-cell.cell-6:hover::after,
        .mondrian-cell.cell-7:hover::after {
            opacity: 0 !important;
        }
        .mondrian-cell.cell-6 .cell-label,
        .mondrian-cell.cell-7 .cell-label {
            display: none;
        }

        .mondrian-block {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            height: 100%;
        }
        .mondrian-block svg {
            width: 28px;
            height: 28px;
            fill: rgba(255,255,255,0.9);
        }
        .mondrian-block span {
            font-family: 'Oswald', sans-serif;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: rgba(255,255,255,0.9);
        }
        .mondrian-block a {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            color: inherit;
            text-decoration: none;
            position: relative;
            z-index: 2;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 900px) {
            .specs-wrapper { grid-template-columns: 1fr; gap: 40px; }
            .contact-grid { 
                grid-template-columns: 1fr !important; 
                gap: 16px !important;
            }
            .contact-item {
                padding: 24px 16px !important;
            }
            .contact-icon {
                width: 40px !important;
                height: 40px !important;
                margin-bottom: 12px !important;
            }
            .contact-icon svg {
                width: 20px !important;
                height: 20px !important;
            }
            .contact-item h4 {
                font-size: 15px !important;
            }
            .contact-item p {
                font-size: 14px !important;
            }
            .hero-boiler { right: -15%; width: 70%; opacity: .2; }
            .mondrian-grid {
                grid-template-columns: 2fr 1fr 1fr;
                grid-template-rows: 220px 220px;
            }
            .cell-1 { grid-column: 1 / 2; grid-row: 1 / 3; }
            .cell-6 { grid-column: 2 / 3; grid-row: 1 / 2; }
            .cell-7 { grid-column: 3 / 4; grid-row: 1 / 2; }
            .cell-3 { grid-column: 2 / 4; grid-row: 2 / 3; }
            .cell-2 { display: none; }
        }
        @media (max-width: 600px) {
            .section { padding: 50px 16px; }
            .hero-boiler { display: none; }
            .mondrian-grid {
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 200px 100px 200px;
                gap: 8px;
                padding: 8px;
            }
            .cell-1 { grid-column: 1 / 3; grid-row: 1 / 2; }
            .cell-6 { grid-column: 1 / 2; grid-row: 2 / 3; }
            .cell-7 { grid-column: 2 / 3; grid-row: 2 / 3; }
            .cell-3 { grid-column: 1 / 3; grid-row: 3 / 4; }
            .cell-2 { display: none; }
            .hero-contact-row { flex-direction: column; gap: 8px; }
            .hero-contact-text { font-size: 14px; white-space: normal; }
            .hero-cta { padding: 14px 28px; font-size: 14px; }
            .hero-content { padding: 30px 16px; }

            .contact-grid { 
                grid-template-columns: 1fr !important; 
                gap: 16px !important;
            }
            .contact-item {
                padding: 24px 16px !important;
            }
            .contact-icon {
                width: 40px !important;
                height: 40px !important;
                margin-bottom: 12px !important;
            }
            .contact-icon svg {
                width: 20px !important;
                height: 20px !important;
            }
            .contact-item h4 {
                font-size: 15px !important;
            }
            .contact-item p {
                font-size: 14px !important;
            }
        }

        /* ===== CONTACT ===== */
        .contact-section { background: linear-gradient(135deg, var(--dark) 0%, var(--gray) 100%); padding: 80px 20px; position: relative; overflow: hidden; }
        .contact-section::before { content: ''; position: absolute; top: -100px; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(232,106,23,0.08) 0%, transparent 70%); pointer-events: none; }
        .contact-wrapper { max-width: 800px; margin: 0 auto; text-align: center; }
        .contact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 40px; }
        .contact-item { background: var(--gray); border: 1px solid var(--gray-light); border-radius: 16px; padding: 28px 20px; transition: all .3s ease; }
        .contact-item:hover { border-color: var(--orange); transform: translateY(-4px); }
        .contact-icon { width: 48px; height: 48px; margin: 0 auto 16px; background: rgba(232,106,23,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .contact-icon svg { width: 24px; height: 24px; fill: var(--orange); }
        .contact-item h4 { font-family: 'Oswald', sans-serif; font-size: 16px; font-weight: 500; color: #fff; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .contact-item p { font-size: 14px; color: var(--text-dim); }
        .contact-item a { color: var(--orange-light); text-decoration: none; transition: color .2s; }
        .contact-item a:hover { color: var(--orange); }

        /* ===== CTA BAR ===== */
        .cta-bar { background: var(--orange); padding: 40px 20px; text-align: center; }
        .cta-bar h3 { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #fff; margin-bottom: 16px; }
        .cta-bar p { font-size: 16px; color: rgba(255,255,255,0.85); margin-bottom: 24px; }
        .cta-bar button { background: #fff; color: var(--orange-dark); padding: 14px 36px; border-radius: 50px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border: none; cursor: pointer; transition: all .3s ease; }
        .cta-bar button:hover { background: var(--dark); color: #fff; transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }

        /* ===== FOOTER ===== */
        .footer { background: var(--darker); padding: 30px 20px; text-align: center; border-top: 1px solid var(--gray-light); }
        .footer p { font-size: 13px; color: var(--text-dim); }
        .footer strong { color: var(--orange); font-family: 'Oswald', sans-serif; font-weight: 500; }
        .footer .contact-links a { color: var(--text-dim); text-decoration: none; margin: 0 8px; transition: color .2s ease; }
        .footer .contact-links a:hover { color: var(--orange); }
        .footer .contact-links .separator { color: var(--gray-light); }

        /* ===== SCROLL ANIMATIONS ===== */
        .scroll-animate {
            opacity: 0;
            transition: opacity .9s cubic-bezier(.25,.46,.45,.94), transform .9s cubic-bezier(.25,.46,.45,.94);
        }
        .scroll-animate.animated {
            opacity: 1;
            transform: translate(0,0) scale(1) !important;
        }
        .fade-up { transform: translateY(50px); }
        .fade-down { transform: translateY(-50px); }
        .fade-left { transform: translateX(-50px); }
        .fade-right { transform: translateX(50px); }
        .zoom-in { transform: scale(.85); }
        .stagger-1 { transition-delay: .05s; }
        .stagger-2 { transition-delay: .10s; }
        .stagger-3 { transition-delay: .15s; }
        .stagger-4 { transition-delay: .20s; }
        .stagger-5 { transition-delay: .25s; }
        .stagger-6 { transition-delay: .30s; }
        .stagger-7 { transition-delay: .35s; }
        .stagger-8 { transition-delay: .40s; }

        /* ===== MODAL ===== */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transition: opacity .3s ease, visibility .3s ease;
            overflow: hidden;
        }
        .modal-overlay.active {
            opacity: 1;
            visibility: visible;
        }
        .modal-content {
            position: relative;
            width: auto;
            max-width: 100%;
            height: auto;
            max-height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            padding: 10px;
            margin: auto;
        }
        .modal-content img {
            max-width: 100%;
            max-height: calc(100vh - 160px);
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            transition: opacity .15s ease;
        }
        .modal-close {
            position: fixed;
            top: 16px;
            right: 16px;
            width: 48px;
            height: 48px;
            background: var(--gray);
            border: 1px solid var(--gray-light);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s ease;
            z-index: 1002;
            flex-shrink: 0;
        }
        .modal-close:hover {
            background: var(--orange);
            border-color: var(--orange);
            transform: rotate(90deg);
        }
        .modal-close svg {
            width: 22px;
            height: 22px;
            fill: #fff;
        }
        .modal-caption {
            font-family: 'Oswald', sans-serif;
            font-size: 15px;
            font-weight: 500;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 2px;
            text-align: center;
            flex-shrink: 0;
            padding: 0 60px;
        }
        .modal-nav {
            position: fixed;
            top: 50%;
            transform: translateY(-50%);
            width: 50px;
            height: 50px;
            background: var(--gray);
            border: 1px solid var(--gray-light);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s ease;
            z-index: 1002;
            flex-shrink: 0;
        }
        .modal-nav:hover {
            background: var(--orange);
            border-color: var(--orange);
        }
        .modal-nav svg {
            width: 24px;
            height: 24px;
            fill: #fff;
        }
        .modal-prev { left: 16px; }
        .modal-next { right: 16px; }
        @media (max-width: 768px) {
            .modal-overlay { padding: 12px; }
            .modal-content { padding: 6px; }
            .modal-content img { max-height: calc(100vh - 120px); }
            .modal-close { top: 10px; right: 10px; width: 42px; height: 42px; }
            .modal-nav { width: 42px; height: 42px; background: rgba(42,42,42,0.85); }
            .modal-prev { left: 8px; }
            .modal-next { right: 8px; }
            .modal-caption { font-size: 13px; padding: 0 50px; }
        }

        /* ===== SCROLL TOP ===== */
        .scroll-top {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 50px;
            height: 50px;
            background: var(--orange);
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            visibility: hidden;
            transform: translateY(20px);
            transition: all .3s ease;
            z-index: 999;
            box-shadow: 0 4px 20px rgba(232,106,23,0.4);
        }
        .scroll-top.visible {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
        .scroll-top:hover {
            background: var(--orange-light);
            transform: translateY(-3px);
            box-shadow: 0 8px 30px rgba(232,106,23,0.5);
        }
        .scroll-top svg {
            width: 24px;
            height: 24px;
            fill: #fff;
        }
        @media (max-width: 768px) {
            .scroll-top { right: 40px; bottom: 20px; }
        }

        /* ===== STICKY NAV (исправленная структура) ===== */
        .sticky-nav {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(13,13,13,0.92);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--gray-light);
            z-index: 101;
            padding: 0;
            transform: translateY(-100%);
            transition: transform .35s ease;
        }
        .sticky-nav.visible {
            transform: translateY(0);
        }
        .sticky-nav.always-visible {
            transform: translateY(0);
        }
        .nav-hover-zone {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 20px;
            z-index: 99;
        }
        .nav-wrapper {
            max-width: 100%;
            padding: 0 40px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 60px;
            position: relative; /* для позиционирования списка */
        }
        .nav-logo {
            font-family: 'Oswald', sans-serif;
            font-size: 20px;
            font-weight: 700;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .nav-logo span {
            color: var(--orange);
        }

        /* Десктопное меню */
        .nav-links {
            display: flex;
            gap: 40px;
            list-style: none;
        }
        .nav-links a {
            font-family: 'Oswald', sans-serif;
            font-size: 14px;
            font-weight: 500;
            color: var(--text-dim);
            text-decoration: none;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: color .2s ease;
            position: relative;
        }
        .nav-links a::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 0;
            width: 0;
            height: 2px;
            background: var(--orange);
            transition: width .3s ease;
        }
        .nav-links a:hover {
            color: #fff;
        }
        .nav-links a:hover::after {
            width: 100%;
        }

        .nav-toggle {
            display: none;
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            z-index: 102;
        }
        .nav-toggle svg {
            width: 24px;
            height: 24px;
            fill: #fff;
        }

        /* Мобильная адаптация */
        @media (max-width: 768px) {
            .sticky-nav {
                left: 16px;
                right: 16px;
                width: auto;
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                border-bottom: none;
            }
            .sticky-nav.menu-open {
                border-radius: 16px 16px 0 0;
            }
            .nav-wrapper {
                padding: 0 20px;
                height: 60px;
                position: relative;
                overflow: visible; /* чтобы список не обрезался */
            }
            .nav-links {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                width: 100%;
                background: rgba(13,13,13,0.98);
                flex-direction: column;
                padding: 16px 0;
                gap: 4px;
                /* ИСПРАВЛЕНИЕ: анимация раскрытия сверху вниз (scaleY) */
                transform: scaleY(0);
                transform-origin: top center;
                opacity: 0;
                transition: transform .35s ease, opacity .35s ease;
                border-radius: 0 0 16px 16px;
                overflow: hidden;
                pointer-events: none;
                box-shadow: 0 8px 30px rgba(0,0,0,0.5);
                z-index: 100; /* ниже, чем .sticky-nav (101) и .nav-toggle (102) */
                border-top: none;
                align-items: stretch;
                visibility: visible; /* чтобы scaleY(0) скрывал, но был доступен для анимации */
            }
            .nav-links.open {
                transform: scaleY(1);
                opacity: 1;
                pointer-events: auto;
                border-radius: 0 0 16px 16px;
            }
            .nav-links li {
                list-style: none;
                width: 100%;
            }
            .nav-links a {
                display: block;
                width: 100%;
                padding: 12px 24px;
                text-align: center;
                font-size: 16px;
                letter-spacing: 1.5px;
                color: var(--text);
                transition: background .2s ease, color .2s ease;
            }
            .nav-links a:hover {
                background: rgba(232,106,23,0.1);
                color: #fff;
            }
            .nav-links a::after {
                display: none;
            }
            .nav-toggle {
                display: block;
                margin-right: 4px;
                padding: 8px 6px;
            }
        }

        @media (max-width: 400px) {
            .sticky-nav { left: 8px; right: 8px; }
            .nav-wrapper { padding: 0 12px; height: 54px; }
            .nav-logo { font-size: 17px; }
            .nav-links { left: 0; right: 0; top: 100%; }
            .nav-links a { padding: 10px 16px; font-size: 14px; }
        }

        /* ===== CUSTOM SCROLLBAR ===== */
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: var(--darker); }
        ::-webkit-scrollbar-thumb { background: var(--orange); border-radius: 5px; border: 2px solid var(--darker); }
        ::-webkit-scrollbar-thumb:hover { background: var(--orange-light); }
        html { scrollbar-width: thin; scrollbar-color: var(--orange) var(--darker); }

        /* ===== FORM MODAL ===== */
        .form-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            opacity: 0;
            visibility: hidden;
            transition: opacity .3s ease, visibility .3s ease;
            padding: 20px;
        }
        .form-modal-overlay.active {
            opacity: 1;
            visibility: visible;
        }
        .form-modal {
            background: var(--gray);
            border: 1px solid var(--gray-light);
            border-radius: 16px;
            padding: 40px 32px;
            width: 100%;
            max-width: 420px;
            position: relative;
            transform: translateY(20px);
            transition: transform .3s ease;
        }
        .form-modal-overlay.active .form-modal {
            transform: translateY(0);
        }
        .form-modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 36px;
            height: 36px;
            background: none;
            border: 1px solid var(--gray-light);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all .2s ease;
            color: var(--text-dim);
        }
        .form-modal-close:hover {
            background: var(--orange);
            border-color: var(--orange);
            color: #fff;
        }
        .form-modal-close svg {
            width: 18px;
            height: 18px;
            fill: currentColor;
        }
        .form-modal h3 {
            font-family: 'Oswald', sans-serif;
            font-size: 24px;
            font-weight: 700;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        .form-modal p {
            font-size: 14px;
            color: var(--text-dim);
            margin-bottom: 28px;
            line-height: 1.5;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        .form-group input {
            width: 100%;
            padding: 14px 16px;
            background: var(--darker);
            border: 1px solid var(--gray-light);
            border-radius: 10px;
            color: var(--text);
            font-size: 15px;
            font-family: 'Roboto', sans-serif;
            transition: border-color .2s ease;
            outline: none;
        }
        .form-group input:focus {
            border-color: var(--orange);
        }
        .form-group input::placeholder {
            color: var(--text-dim);
            opacity: .6;
        }
        .form-submit {
            width: 100%;
            padding: 16px;
            background: var(--orange);
            border: none;
            border-radius: 50px;
            color: #fff;
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all .3s ease;
            margin-top: 8px;
        }
        .form-submit:hover {
            background: var(--orange-light);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(232,106,23,0.4);
        }

        /* ===== TOAST ===== */
        .toast {
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(-30px);
            background: var(--gray);
            border: 1px solid var(--orange);
            border-radius: 12px;
            padding: 16px 28px;
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 3000;
            opacity: 0;
            visibility: hidden;
            transition: all .4s ease;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        }
        .toast.show {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(0);
        }
        .toast-icon {
            width: 28px;
            height: 28px;
            background: rgba(232,106,23,0.15);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .toast-icon svg {
            width: 16px;
            height: 16px;
            fill: var(--orange);
        }
        .toast-text {
            font-size: 15px;
            color: var(--text);
            font-weight: 500;
        }

        @media (max-width: 400px) {
            .hero h1 { font-size: 34px; }
            .hero-subtitle { font-size: 16px; letter-spacing: 2px; }
            .hero-desc { font-size: 15px; }
            .hero-cta { padding: 12px 20px; font-size: 13px; }
            .hero-contact-text { font-size: 13px; }
            .feature-card { padding: 24px 16px; }
            .feature-card h3 { font-size: 18px; }
            .spec-row { flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 16px; }
            .spec-value { font-size: 16px; }
            .contact-grid { 
                grid-template-columns: 1fr !important; 
                gap: 16px !important;
            }
            .contact-item { padding: 20px 12px !important; }
            .mondrian-grid { grid-template-rows: 160px 80px 160px; }
            .cta-bar h3 { font-size: 20px; }
            .cta-bar button { padding: 12px 24px; font-size: 13px; }
            .form-modal { padding: 30px 20px; }
            .form-modal h3 { font-size: 20px; }
            .sticky-nav { left: 8px; right: 8px; }
            .nav-wrapper { padding: 0 12px; height: 54px; }
            .nav-logo { font-size: 17px; }
            .nav-links { left: 0; right: 0; top: 100%; }
            .nav-links a { padding: 10px 16px; font-size: 14px; }
        }
    </style>
</head>
<body>

    <!-- ==================== МАСКА ==================== -->
    <div id="loader-overlay">
        <div class="loader-spinner"></div>
        <div class="loader-brand">Тепло<span>динамик</span></div>
        <div class="loader-sub">Загрузка</div>
        <div class="loader-dots">
            <span></span><span></span><span></span>
        </div>
        <div class="loader-progress">
            <div class="loader-progress-bar"></div>
        </div>
    </div>

    <!-- ==================== ОСНОВНОЙ КОНТЕНТ ==================== -->

    <!-- ===== NAV HOVER ZONE ===== -->
    <div class="nav-hover-zone" id="navHoverZone" onmouseenter="showNavHover()" onmouseleave="hideNavHover()"></div>

    <!-- ===== STICKY NAV (исправленная структура) ===== -->
    <nav class="sticky-nav" id="stickyNav" onmouseenter="showNavHover()" onmouseleave="hideNavHover()">
        <div class="nav-wrapper">
            <div class="nav-logo">Тепло<span>динамик</span></div>
            <ul class="nav-links" id="navLinks">
                <li><a href="#features" onclick="scrollToSection(event,'features')">Преимущества</a></li>
                <li><a href="#specs" onclick="scrollToSection(event,'specs')">Характеристики</a></li>
                <li><a href="#gallery" onclick="scrollToSection(event,'gallery')">Обзор</a></li>
                <li><a href="#contact" onclick="scrollToSection(event,'contact')">Контакты</a></li>
            </ul>
            <button class="nav-toggle" id="navToggle" onclick="toggleNav()" aria-label="Меню">
                <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
            </button>
        </div>
    </nav>

    <!-- ===== HERO ===== -->
    <section class="hero" id="heroSection">
        <div class="hero-bg"></div>
        <div class="hero-overlay"></div>
        <div class="hero-content">
            <a href="<?php echo htmlspecialchars($data['hero']['badgeLink']); ?>" target="_blank" rel="noopener" class="hero-badge animate-in" style="color:inherit; text-decoration:none;"><?php echo htmlspecialchars($data['hero']['badgeText']); ?></a>
            <h1 class="animate-in delay-1"><?php
                $title = $data['hero']['title'];
                if (strpos($title, 'динамик') !== false) {
                    $parts = explode('динамик', $title);
                    echo htmlspecialchars($parts[0]) . '<span>динамик</span>';
                } else {
                    echo htmlspecialchars($title);
                }
            ?></h1>
            <p class="hero-subtitle animate-in delay-2"><?php echo htmlspecialchars($data['hero']['subtitle']); ?></p>
            <p class="hero-desc animate-in delay-3"><?php echo nl2br(htmlspecialchars($data['hero']['desc'])); ?></p>
            <div class="hero-contacts animate-in delay-4">
                <div class="hero-contact-row">
                    <div class="hero-contact-item">
                        <span class="hero-contact-icon-wrap hero-contact-icon-wrap--transparent">
                            <img class="hero-contact-icon" src="<?php echo htmlspecialchars($data['media']['phoneIcon']); ?>" alt="Телефон" />
                        </span>
                        <span class="hero-contact-text"><?php echo htmlspecialchars($data['contacts']['phoneDisplay']); ?></span>
                    </div>
                    <div class="hero-socials">
                        <a href="<?php echo htmlspecialchars($data['contacts']['whatsapp']); ?>" target="_blank" rel="noopener" class="hero-social-link" aria-label="WhatsApp" data-tooltip="WhatsApp">
                            <img class="hero-social-icon" src="<?php echo htmlspecialchars($data['media']['whatsappIcon']); ?>" alt="WhatsApp" />
                        </a>
                        <a href="<?php echo htmlspecialchars($data['contacts']['telegram']); ?>" target="_blank" rel="noopener" class="hero-social-link" aria-label="Telegram" data-tooltip="Telegram">
                            <img class="hero-social-icon" src="<?php echo htmlspecialchars($data['media']['telegramIcon']); ?>" alt="Telegram" />
                        </a>
                    </div>
                </div>
                <div class="hero-contact-row">
                    <div class="hero-contact-item">
                        <span class="hero-contact-icon-wrap hero-contact-icon-wrap--transparent">
                            <img class="hero-contact-icon" src="<?php echo htmlspecialchars($data['media']['emailIcon']); ?>" alt="Email" />
                        </span>
                        <span class="hero-contact-text">Почта: <?php echo htmlspecialchars($data['contacts']['email']); ?></span>
                    </div>
                    <div class="hero-socials" aria-hidden="true"></div>
                </div>
            </div>
            <a href="#contact" class="hero-cta animate-in delay-4" id="heroCta" onclick="scrollToSection(event,'contact')">
                <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
                <?php echo htmlspecialchars($data['hero']['ctaText']); ?>
            </a>
        </div>
        <div class="scroll-indicator" id="scrollIndicator" onclick="scrollToSection(event,'features')">
            <div class="scroll-indicator-arrow">
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                <div class="scroll-indicator-glow"></div>
            </div>
        </div>
        <img class="hero-boiler" src="<?php echo htmlspecialchars($data['hero']['boilerImage']); ?>" alt="Котел Теплодинамик" />
    </section>

    <!-- ===== FEATURES ===== -->
    <section class="section" id="features">
        <h2 class="section-title scroll-animate fade-up"><?php
            $ft = $data['features']['title'];
            if (strpos($ft, 'Теплодинамика') !== false) {
                $parts = explode('Теплодинамика', $ft);
                echo htmlspecialchars($parts[0]) . '<span>Теплодинамика</span>';
            } else {
                echo htmlspecialchars($ft);
            }
        ?></h2>
        <p class="section-subtitle scroll-animate fade-up stagger-1"><?php echo htmlspecialchars($data['features']['subtitle']); ?></p>
        <div class="features-grid">
            <?php
            $icons = [
                'check' => '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
                'auto' => '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/></svg>',
                'bunker' => '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
                'power' => '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
                'temp' => '<svg viewBox="0 0 24 24"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-2z"/></svg>',
                'steel' => '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>',
                'eco' => '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
                'factory' => '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
            ];
            foreach ($data['features']['items'] as $idx => $item):
                $icon = isset($icons[$item['icon']]) ? $icons[$item['icon']] : $icons['check'];
                $stagger = min($idx+1, 8);
            ?>
            <div class="feature-card scroll-animate fade-up stagger-<?php echo $stagger; ?>">
                <div class="feature-icon"><?php echo $icon; ?></div>
                <h3><?php echo htmlspecialchars($item['title']); ?></h3>
                <p><?php echo htmlspecialchars($item['text']); ?></p>
            </div>
            <?php endforeach; ?>
        </div>
    </section>

    <!-- ===== SPECS ===== -->
    <section class="specs-section" id="specs">
        <div class="specs-wrapper">
            <div class="specs-image scroll-animate fade-left">
                <img src="<?php echo htmlspecialchars($data['specs']['image']); ?>" alt="Чертёж котла Теплодинамик" />
            </div>
            <div>
                <h2 class="section-title scroll-animate fade-up"><?php
                    $st = $data['specs']['title'];
                    if (strpos($st, 'характеристики') !== false) {
                        $parts = explode('характеристики', $st);
                        echo htmlspecialchars($parts[0]) . '<span>характеристики</span>';
                    } else {
                        echo htmlspecialchars($st);
                    }
                ?></h2>
                <p class="section-subtitle scroll-animate fade-up stagger-1"><?php echo htmlspecialchars($data['specs']['subtitle']); ?></p>
                <div class="specs-list">
                    <?php foreach ($data['specs']['items'] as $idx => $item): ?>
                    <div class="spec-row scroll-animate fade-right stagger-<?php echo min($idx+1, 8); ?>">
                        <span class="spec-label"><img class="spec-fire" src="<?php echo htmlspecialchars($data['media']['fireIcon']); ?>" alt="🔥" /> <?php echo htmlspecialchars($item['label']); ?></span>
                        <span class="spec-value"><?php echo htmlspecialchars($item['value']); ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </section>

    <!-- ===== GALLERY ===== -->
    <section class="section" id="gallery">
        <h2 class="section-title scroll-animate fade-up"><?php
            $gt = $data['gallery']['title'];
            if (strpos($gt, 'обзор') !== false) {
                $parts = explode('обзор', $gt);
                echo htmlspecialchars($parts[0]) . '<span>обзор</span>';
            } else {
                echo htmlspecialchars($gt);
            }
        ?></h2>
        <div class="mondrian-gallery">
            <div class="mondrian-grid">
                <?php
                $cells = $data['gallery']['cells'];
                $classMap = [0 => 'cell-1', 1 => 'cell-2', 2 => 'cell-3', 3 => 'cell-6', 4 => 'cell-7'];
                $icons = [
                    'check' => '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
                    'shield' => '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>',
                    'bunker' => '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/></svg>'
                ];
                $imageIndex = 0;
                foreach ($cells as $idx => $cell):
                    $class = $classMap[$idx] ?? 'cell-1';
                    $isBlock = ($cell['type'] === 'block');
                    $isDisabled = ($class === 'cell-6' || $class === 'cell-7');
                ?>
                    <?php if ($cell['type'] === 'image'): ?>
                        <div class="mondrian-cell <?php echo $class; ?> scroll-animate zoom-in stagger-<?php echo $idx+1; ?>" onclick="openModal(<?php echo $imageIndex; ?>)">
                            <img src="<?php echo htmlspecialchars($cell['src']); ?>" alt="<?php echo htmlspecialchars($cell['label']); ?>" />
                            <span class="cell-label"><?php echo htmlspecialchars($cell['label']); ?></span>
                        </div>
                        <?php $imageIndex++; ?>
                    <?php else: ?>
                        <?php
                        $bgColor = '';
                        if ($cell['color'] == 'red') $bgColor = 'var(--mondrian-red)';
                        elseif ($cell['color'] == 'blue') $bgColor = 'var(--mondrian-blue)';
                        elseif ($cell['color'] == 'yellow') $bgColor = 'var(--mondrian-yellow)';
                        else $bgColor = '#333';
                        $link = !empty($cell['link']) ? $cell['link'] : '#';
                        $target = !empty($cell['link']) ? ' target="_blank" rel="noopener"' : '';
                        $iconHtml = isset($icons[$cell['icon']]) ? $icons[$cell['icon']] : $icons['check'];
                        ?>
                        <div class="mondrian-cell <?php echo $class; ?> mondrian-block scroll-animate zoom-in stagger-<?php echo $idx+1; ?>" style="background:<?php echo $bgColor; ?>;">
                            <?php if ($isDisabled): ?>
                                <?php echo $iconHtml; ?>
                                <span><?php echo htmlspecialchars($cell['text']); ?></span>
                            <?php else: ?>
                                <a href="<?php echo $link; ?>"<?php echo $target; ?>>
                                    <?php echo $iconHtml; ?>
                                    <span><?php echo htmlspecialchars($cell['text']); ?></span>
                                </a>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <!-- ===== CONTACT ===== -->
    <section class="contact-section" id="contact">
        <div class="contact-wrapper">
            <h2 class="section-title scroll-animate fade-up"><?php
                $ct = $data['contacts']['title'];
                if (strpos($ct, 'с нами') !== false) {
                    $parts = explode('с нами', $ct);
                    echo htmlspecialchars($parts[0]) . '<span>с нами</span>';
                } else {
                    echo htmlspecialchars($ct);
                }
            ?></h2>
            <div class="contact-grid">
                <div class="contact-item scroll-animate fade-up stagger-1">
                    <div class="contact-icon"><svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></div>
                    <h4>Телефон</h4>
                    <p><a href="tel:<?php echo preg_replace('/[^0-9+]/', '', $data['contacts']['phone']); ?>"><?php echo htmlspecialchars($data['contacts']['phoneDisplay']); ?></a></p>
                </div>
                <div class="contact-item scroll-animate fade-up stagger-2">
                    <div class="contact-icon"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg></div>
                    <h4>Email</h4>
                    <p><a href="mailto:<?php echo htmlspecialchars($data['contacts']['email']); ?>"><?php echo htmlspecialchars($data['contacts']['emailDisplay']); ?></a></p>
                </div>
                <div class="contact-item scroll-animate fade-up stagger-3">
                    <div class="contact-icon"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>
                    <h4>Регион</h4>
                    <p><?php echo htmlspecialchars($data['contacts']['region']); ?></p>
                </div>
            </div>
        </div>
    </section>

    <!-- ===== CTA BAR ===== -->
    <section class="cta-bar scroll-animate fade-up">
        <h3><?php echo htmlspecialchars($data['cta']['title']); ?></h3>
        <p><?php echo htmlspecialchars($data['cta']['desc']); ?></p>
        <button onclick="openFormModal()"><?php echo htmlspecialchars($data['cta']['button']); ?></button>
    </section>

    <!-- ===== FOOTER ===== -->
    <footer class="footer scroll-animate fade-up">
        <p><strong><?php echo htmlspecialchars($data['footer']['company']); ?></strong> — <span><?php echo htmlspecialchars($data['footer']['tagline']); ?></span></p>
        <p class="contact-links" style="margin-top:6px; font-size:14px; color:var(--text-dim);">
            <a href="tel:<?php echo preg_replace('/[^0-9+]/', '', $data['contacts']['phone']); ?>"><?php echo htmlspecialchars($data['footer']['phone']); ?></a>
            <span class="separator">|</span>
            <a href="mailto:<?php echo htmlspecialchars($data['contacts']['email']); ?>"><?php echo htmlspecialchars($data['footer']['email']); ?></a>
            <span class="separator">|</span>
            <a href="<?php echo htmlspecialchars($data['footer']['whatsapp']); ?>" target="_blank" rel="noopener">WhatsApp</a>
            <a href="<?php echo htmlspecialchars($data['footer']['telegram']); ?>" target="_blank" rel="noopener">Telegram</a>
        </p>
        <p style="margin-top:8px; font-size:12px;" id="footerYear"><?php echo date('Y'); ?> · Российская Федерация · <a href="<?php echo htmlspecialchars($data['footer']['patentLink']); ?>" target="_blank" rel="noopener" style="color:inherit; text-decoration:none;"><?php echo htmlspecialchars($data['footer']['patentText']); ?></a></p>
    </footer>

    <!-- ===== SCROLL TOP ===== -->
    <button class="scroll-top" id="scrollTopBtn" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="Наверх">
        <svg viewBox="0 0 24 24"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
    </button>

    <!-- ===== MODAL ===== -->
    <div class="modal-overlay" id="imageModal" onclick="closeModal(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
            <button class="modal-close" onclick="closeModal()" aria-label="Закрыть">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <button class="modal-nav modal-prev" onclick="changeImage(-1)" aria-label="Предыдущее">
                <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <img id="modalImage" src="" alt="" />
            <span class="modal-caption" id="modalCaption"></span>
            <button class="modal-nav modal-next" onclick="changeImage(1)" aria-label="Следующее">
                <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
        </div>
    </div>

    <!-- ===== FORM MODAL ===== -->
    <div class="form-modal-overlay" id="formModal" onclick="closeFormModal(event)">
        <div class="form-modal" onclick="event.stopPropagation()">
            <button class="form-modal-close" onclick="closeFormModal()" aria-label="Закрыть">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <h3>Заказать консультацию</h3>
            <p>Оставьте свои контакты, и наш специалист свяжется с вами в ближайшее время.</p>
            <form id="contactForm" action="<?php echo htmlspecialchars($data['admin']['formEndpoint']); ?>" method="POST">
                <input type="hidden" name="_subject" value="Новая заявка с сайта Теплодинамик" />
                <input type="hidden" name="_replyto" id="formReplyTo" value="<?php echo htmlspecialchars($data['admin']['formReplyTo']); ?>" />
                <div class="form-group">
                    <label for="formName">Имя</label>
                    <input type="text" name="name" id="formName" placeholder="Ваше имя" required />
                </div>
                <div class="form-group">
                    <label for="formEmail">Email</label>
                    <input type="email" name="email" id="formEmail" placeholder="your@email.ru" required />
                </div>
                <div class="form-group">
                    <label for="formPhone">Телефон</label>
                    <input type="tel" name="phone" id="formPhone" placeholder="+7 (___) ___-__-__" required />
                </div>
                <button type="submit" class="form-submit" id="formSubmitBtn">Отправить</button>
            </form>
        </div>
    </div>

    <!-- ===== TOAST ===== -->
    <div class="toast" id="toast">
        <div class="toast-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <span class="toast-text">Мы свяжемся с вами в ближайшее время</span>
    </div>

    <!-- ==================== СКРИПТЫ ==================== -->
    <script>
        // ============================================================
        // 1.  УПРАВЛЕНИЕ МАСКОЙ (PRELOADER)
        // ============================================================
        (function() {
            var loader = document.getElementById('loader-overlay');
            var loaderHidden = false;
            var loadStart = Date.now();

            function hideLoader() {
                if (loaderHidden) return;
                loaderHidden = true;
                loader.classList.add('hidden');
                setTimeout(function() {
                    loader.style.display = 'none';
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                }, 800);
            }

            function onLoadComplete() {
                var elapsed = Date.now() - loadStart;
                var minDisplay = 800;
                if (elapsed >= minDisplay) {
                    hideLoader();
                } else {
                    setTimeout(hideLoader, minDisplay - elapsed);
                }
            }

            if (document.readyState === 'complete') {
                onLoadComplete();
            } else {
                window.addEventListener('load', onLoadComplete);
            }
            setTimeout(function() {
                if (!loaderHidden) {
                    hideLoader();
                }
            }, 5000);
        })();

        // ============================================================
        // 2.  ОСТАЛЬНАЯ ЛОГИКА
        // ============================================================

        // === БЛОКИРОВКА СКРОЛЛА ===
        var scrollbarWidth = 0;
        function getScrollbarWidth() {
            return window.innerWidth - document.documentElement.clientWidth;
        }
        function lockScroll() {
            if (document.documentElement.classList.contains('modal-open')) return;
            scrollbarWidth = getScrollbarWidth();
            document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
            document.body.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
        }
        function unlockScroll() {
            var anyModalOpen = document.querySelector('.modal-overlay.active') ||
                document.querySelector('.form-modal-overlay.active');
            if (!anyModalOpen) {
                document.documentElement.classList.remove('modal-open');
                document.body.classList.remove('modal-open');
                document.documentElement.style.setProperty('--scrollbar-width', '0px');
                document.body.style.setProperty('--scrollbar-width', '0px');
            }
        }

        // === Галерея ===
        var galleryImages = <?php
            $images = [];
            foreach ($data['gallery']['cells'] as $cell) {
                if ($cell['type'] === 'image') {
                    $images[] = ['src' => $cell['src'], 'caption' => $cell['label']];
                }
            }
            echo json_encode($images);
        ?>;
        var currentIndex = 0;

        function openModal(index) {
            currentIndex = index;
            var modal = document.getElementById('imageModal');
            var img = document.getElementById('modalImage');
            var caption = document.getElementById('modalCaption');
            if (galleryImages && galleryImages.length > 0) {
                var idx = Math.min(index, galleryImages.length - 1);
                img.src = galleryImages[idx].src;
                caption.textContent = galleryImages[idx].caption;
            }
            modal.classList.add('active');
            lockScroll();
        }

        function closeModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('imageModal').classList.remove('active');
            unlockScroll();
        }

        function changeImage(direction) {
            if (!galleryImages || galleryImages.length === 0) return;
            currentIndex += direction;
            if (currentIndex < 0) currentIndex = galleryImages.length - 1;
            if (currentIndex >= galleryImages.length) currentIndex = 0;
            var img = document.getElementById('modalImage');
            var caption = document.getElementById('modalCaption');
            img.style.opacity = '0';
            setTimeout(function() {
                img.src = galleryImages[currentIndex].src;
                caption.textContent = galleryImages[currentIndex].caption;
                img.style.opacity = '1';
            }, 150);
        }

        document.addEventListener('keydown', function(e) {
            var modal = document.getElementById('imageModal');
            if (!modal.classList.contains('active')) return;
            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowLeft') changeImage(-1);
            if (e.key === 'ArrowRight') changeImage(1);
        });

        // ============================================================
        // === НАВИГАЦИЯ (упрощённая, с управлением классом menu-open) ===
        // ============================================================
        var stickyNav = document.getElementById('stickyNav');
        var navLinks = document.getElementById('navLinks');
        var navTimeout = null;
        var isHoveringNav = false;

        function showNavHover() {
            isHoveringNav = true;
            clearTimeout(navTimeout);
            stickyNav.classList.add('visible');
        }

        function hideNavHover() {
            isHoveringNav = false;
            navTimeout = setTimeout(function() {
                if (!isHoveringNav && window.scrollY <= 50) {
                    stickyNav.classList.remove('visible');
                }
                navLinks.classList.remove('open');
                stickyNav.classList.remove('menu-open');
            }, 300);
        }

        function toggleNav() {
            var isOpen = navLinks.classList.toggle('open');
            if (isOpen) {
                stickyNav.classList.add('visible');
                stickyNav.classList.add('menu-open');
                clearTimeout(navTimeout);
            } else {
                stickyNav.classList.remove('menu-open');
                if (window.scrollY <= 50 && !isHoveringNav) {
                    stickyNav.classList.remove('visible');
                }
            }
        }

        function scrollToSection(event, id) {
            event.preventDefault();
            var el = document.getElementById(id);
            if (el) {
                stickyNav.classList.add('visible');
                var navHeight = stickyNav.offsetHeight;
                var top = el.getBoundingClientRect().top + window.scrollY - navHeight;
                window.scrollTo({ top: top, behavior: 'smooth' });
                navLinks.classList.remove('open');
                stickyNav.classList.remove('menu-open');
                if (window.location.hash) {
                    history.replaceState(null, '', window.location.pathname + window.location.search);
                }
            }
        }

        // === Прокрутка и отображение кнопки "наверх" / always-visible ===
        var scrollTopBtn = document.getElementById('scrollTopBtn');
        window.addEventListener('scroll', function() {
            if (window.scrollY > 400) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
            if (window.scrollY > 50) {
                stickyNav.classList.add('always-visible');
                stickyNav.classList.remove('visible');
            } else {
                stickyNav.classList.remove('always-visible');
                if (!isHoveringNav && !navLinks.classList.contains('open')) {
                    stickyNav.classList.remove('visible');
                }
            }
        });

        // === Позиционирование стрелки ===
        function positionScrollIndicator() {
            var hero = document.getElementById('heroSection');
            var cta = document.getElementById('heroCta');
            var indicator = document.getElementById('scrollIndicator');
            if (!hero || !cta || !indicator) return;
            var heroRect = hero.getBoundingClientRect();
            var ctaRect = cta.getBoundingClientRect();
            var buttonBottom = ctaRect.bottom;
            var heroBottom = heroRect.bottom;
            var mid = (buttonBottom + heroBottom) / 2;
            var topOffset = mid - heroRect.top - indicator.offsetHeight / 2;
            indicator.style.top = topOffset + 'px';
        }

        window.addEventListener('load', positionScrollIndicator);
        window.addEventListener('resize', positionScrollIndicator);
        setTimeout(positionScrollIndicator, 1000);

        // === Форма ===
        function openFormModal() {
            document.getElementById('formModal').classList.add('active');
            lockScroll();
        }

        function closeFormModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('formModal').classList.remove('active');
            unlockScroll();
        }

        function submitForm(event) {
            event.preventDefault();
            var form = document.getElementById('contactForm');
            var btn = document.getElementById('formSubmitBtn');
            var originalText = btn.textContent;
            btn.textContent = 'Отправка...';
            btn.disabled = true;

            var data = new FormData(form);

            fetch(form.action, {
                method: form.method,
                body: data,
                headers: { 'Accept': 'application/json' }
            }).then(function(response) {
                btn.textContent = originalText;
                btn.disabled = false;
                if (response.ok) {
                    closeFormModal();
                    document.getElementById('formName').value = '';
                    document.getElementById('formEmail').value = '';
                    document.getElementById('formPhone').value = '';
                    showToast();
                } else {
                    alert('Ошибка отправки. Попробуйте позже или свяжитесь по телефону.');
                }
            }).catch(function(error) {
                btn.textContent = originalText;
                btn.disabled = false;
                alert('Ошибка сети. Проверьте подключение и попробуйте снова.');
            });
        }

        function showToast() {
            var toast = document.getElementById('toast');
            toast.classList.add('show');
            setTimeout(function() {
                toast.classList.remove('show');
            }, 4000);
        }

        document.addEventListener('keydown', function(e) {
            var formModal = document.getElementById('formModal');
            if (e.key === 'Escape' && formModal.classList.contains('active')) {
                closeFormModal();
            }
        });

        document.getElementById('contactForm').addEventListener('submit', submitForm);

        // === Scroll Animation Observer ===
        document.addEventListener('DOMContentLoaded', function() {
            var animElements = document.querySelectorAll('.scroll-animate');
            var observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animated');
                    } else {
                        entry.target.classList.remove('animated');
                    }
                });
            }, {
                threshold: 0.15,
                rootMargin: '0px 0px -30px 0px'
            });
            animElements.forEach(function(el) { observer.observe(el); });
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {});
        } else {
            (function initAnimations() {
                var animElements = document.querySelectorAll('.scroll-animate');
                var observer = new IntersectionObserver(function(entries) {
                    entries.forEach(function(entry) {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('animated');
                        } else {
                            entry.target.classList.remove('animated');
                        }
                    });
                }, {
                    threshold: 0.15,
                    rootMargin: '0px 0px -30px 0px'
                });
                animElements.forEach(function(el) { observer.observe(el); });
            })();
        }
    </script>

    <!-- ===== Schema.org ===== -->
    <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "Product", "name": "Теплодинамик — Пеллетный автоматический котел", "image": ["https://teplodinamik.ru/Рис%202.jpg", "https://teplodinamik.ru/Рис%201.jpg"], "description": "Пеллетные автоматические энергонезависимые котлы с бункером 75 кг. Автономная работа до 3 суток. Мощность 10 кВт. Сталь 09Г2С. Российский патент.", "brand": { "@type": "Brand", "name": "Теплодинамик" }, "manufacturer": { "@type": "Organization", "name": "Теплодинамик", "address": { "@type": "PostalAddress", "addressCountry": "RU", "addressRegion": "Сибирь" } }, "offers": { "@type": "Offer", "url": "https://teplodinamik.ru/", "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/NewCondition", "priceCurrency": "RUB", "seller": { "@type": "Organization", "name": "Теплодинамик" } }, "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "reviewCount": "24" } }
    </script>
    <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "WebSite", "url": "https://teplodinamik.ru/", "name": "Теплодинамик", "description": "Пеллетные автоматические энергонезависимые котлы", "inLanguage": "ru-RU", "publisher": { "@type": "Organization", "name": "Теплодинамик", "logo": { "@type": "ImageObject", "url": "https://teplodinamik.ru/favicon-32x32.png" } } }
    </script>
    <script type="application/ld+json">
        { "@context": "https://schema.org", "@type": "Organization", "name": "Теплодинамик", "url": "https://teplodinamik.ru/", "logo": "https://teplodinamik.ru/favicon-32x32.png", "contactPoint": { "@type": "ContactPoint", "telephone": "+7-913-000-00-00", "contactType": "sales", "areaServed": "RU", "availableLanguage": ["Russian"] } }
    </script>

</body>
</html>