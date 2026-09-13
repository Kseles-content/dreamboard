# Собственный домен DreamBoard

Основной адрес: https://dreamboard.kseles.ru/
Лендинг: https://dreamboard.kseles.ru/welcome/
Хостинг: GitHub Pages, репозиторий Kseles-content/dreamboard, main:/.
Личный сайт kseles.ru остаётся на прежнем сервере.

В GitHub Pages указать Custom domain dreamboard.kseles.ru. Затем в Cloudflare
добавить CNAME dreamboard → kseles-content.github.io, DNS only, TTL Auto.
После выпуска сертификата включить Enforce HTTPS.
Файл CNAME основной ветки сохраняет домен при следующих публикациях;
не переносить его в preview-репозиторий.

Preview: https://kseles-content.github.io/dreamboard-v14-preview/.
Старый production URL GitHub Pages после подключения домена перенаправляется.
Новый origin имеет отдельные локальные данные: экспортировать JSON на старом
адресе до переключения при необходимости, восстановить на новом и проверить фото.
На момент согласования пользовательских досок нет, только пробная доска владельца.

Сервер статистики разрешает ровно GitHub origin и https://dreamboard.kseles.ru.
Добавить новый origin также в PHOTO_SEARCH_ORIGINS на сервере, сохранив остальные
значения и секрет Pexels. Перезапустить только соответствующие службы.

Проверки после DNS: HTTPS, корень, welcome/, manifest, иконки, service worker,
поиск фото, PNG онлайн/офлайн, статистика production, установка с нового адреса.
Корневой кэш версии v30: dreamboard-root-v30; фото: dreamboard-root-photos-v1.
