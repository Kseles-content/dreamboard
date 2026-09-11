# Kseles DreamBoards

Веб-приложение для досок мечты: цели, изображения, оформление, визуализация с дыханием, экспорт PNG и резервные копии. Текущая публичная версия — статическая PWA без обязательной регистрации. Автор: Kseles, https://kseles.ru, обратная связь: leksnov@gmail.com.

Документация обновлена 11 сентября 2026 года для сборки `2026-09-11-v29-pexels-export`. Идентификатор сборки: [version.txt](version.txt).

## Лендинг, баннер и приложение

| Материал | Файл | Публичная версия |
| --- | --- | --- |
| Приложение | [index.html](index.html) | [Открыть](https://kseles-content.github.io/dreamboard/) |
| Лендинг | [welcome/index.html](welcome/index.html) | [Открыть](https://kseles-content.github.io/dreamboard/welcome/) |
| Баннер PNG 4:5, 1080 × 1350 | [welcome/banner-4x5.png](welcome/banner-4x5.png) | [Открыть PNG](https://kseles-content.github.io/dreamboard/welcome/banner-4x5.png) |
| Кликабельный баннер | [welcome/banner/index.html](welcome/banner/index.html) | [Открыть](https://kseles-content.github.io/dreamboard/welcome/banner/) |
| Об авторе | [about/index.html](about/index.html) | [Информация](https://kseles-content.github.io/dreamboard/about/) |

PNG сам по себе не содержит перехода: при размещении назначьте ему ссылку на лендинг. HTML-баннер уже ведёт на `welcome/?utm_source=personal`.

## Документация

- [Руководство пользователя](docs/app/USER_GUIDE.md).
- [Архитектура и хранение данных](docs/app/ARCHITECTURE.md).
- [Разработка, тестирование и публикация](docs/app/DEVELOPMENT.md).
- [Обслуживание и текущее состояние](docs/app/OPERATIONS.md).
- [Лендинг и баннер: редактирование](welcome/README.md).
- [Указатель документации](docs/README.md) и [история изменений](CHANGELOG.md).

## Локальный запуск

Откройте терминал в папке с этим README. Нужен Python 3:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Приложение: `http://127.0.0.1:8000/`, лендинг: `/welcome/`, баннер: `/welcome/banner/`. Для текущего фронтенда не нужны npm install, Docker или база данных. Запускайте через HTTP на localhost: открытие HTML как файла не обеспечивает работу service worker.

## Границы версии

Доски сохраняются в браузере на устройстве. Автоматическая облачная синхронизация выключена; для переноса и восстановления нужны JSON-копии. Внешний поиск фото требует сети. APK отложен. Основной язык — русский, расширение аудитории запланировано.

В репозитории сохранён прежний прототип NestJS / Next.js / Flutter. Его команды находятся в [историческом README](README-BACKEND-LEGACY.md) и не являются инструкцией запуска опубликованной PWA.
