# Лендинг и баннер Kseles DreamBoards

[README проекта](../README.md) · Актуально на 2026-09-10.

## Файлы и ссылки

| Материал | Файл относительно корня проекта |
| --- | --- |
| Лендинг | `welcome/index.html` |
| Стили лендинга | `welcome/landing.css` |
| Кликабельный баннер | `welcome/banner/index.html` |
| Готовый PNG 4:5 | `welcome/banner-4x5.png` |

Публичные версии: [лендинг](https://kseles-content.github.io/dreamboard/welcome/), [PNG](https://kseles-content.github.io/dreamboard/welcome/banner-4x5.png), [баннер со ссылкой](https://kseles-content.github.io/dreamboard/welcome/banner/).

Кнопки лендинга ведут в приложение по относительному адресу, сохраняя preview или production. Баннер целиком является ссылкой на `../?utm_source=personal`. В PNG ссылки нет: при размещении назначьте переход на лендинг. Допустимые метки статистики: `?utm_source=telegram`, `personal` или `pilot`.

## Оформление и поведение

PNG: **1080 × 1350 пикселей**. HTML-баннер адаптивен, с пропорцией 4:5. Использованы существующие `assets/images/dream_travel.png` и `dream_career.png`, Arial и Georgia, цвета `#f5f3ec`, `#26382e`, `#a6482e`, `#e2e8d9`.

Дыхание лендинга: вдох 4 секунды, пауза 4 секунды, выдох 4 секунды, пауза 4 секунды. Масштаб 0.85–1.13, вращение 0°–180° и обратно. Есть остановка анимации и поддержка `prefers-reduced-motion`. Звука на лендинге нет.

Подключён `analytics.js` для ограниченной статистики; данные и отключение описаны в [архитектуре](../docs/app/ARCHITECTURE.md). `welcome/landing.css` входит в precache приложения, но вся рекламная часть не заявляется полностью доступной офлайн.

## Обновление PNG

1. Измените `welcome/banner/index.html` и откройте через локальный HTTP-сервер из [инструкции](../README.md).
2. В Chromium задайте viewport 1080 × 1350 и device scale factor 1. Дождитесь загрузки изображений.
3. Сохраните снимок viewport без элементов браузера как `welcome/banner-4x5.png`.
4. Проверьте размеры, текст, обрезку и переход по HTML-баннеру. Обновляйте исходник и PNG вместе.

HTML — редактируемый исходник, PNG — материал для размещения. При добавлении фотографий проверяйте условия использования и сохраняйте необходимую атрибуцию.
