# PROJECT_MEMORY.md — синхронизация DreamBoard

Обновлено: 2026-03-11 (UTC)

## 1) Согласованные требования

Ниже — требования, которые явно зафиксированы в доступных записях проекта:

1. Короткий апдейт по DreamBoard только по новым изменениям за последние 3 часа.
2. Если изменений нет, ответ должен быть строго: **«Без изменений, работаю по плану.»**
3. Heartbeat-проверка должна следовать `HEARTBEAT.md`:
   - Проверять последний commit и открытый PR.
   - Если нет нового commit с начала текущего рабочего блока — статус **BLOCKED**.
   - Проверять последний результат CI для активного PR.
   - Проверять reachability staging/API, если staging существует.
   - Не использовать формулировки: "almost done", "in progress", "nearly ready".
   - Сообщать **DONE** только при наличии одновременно: commit, PR, checks, demo.
4. Запланированы cron-процессы:
   - **DreamBoard 09:00 kickoff** (будни): выдать план на день в строго заданном формате (deliverable к 19:00, exact files, PR scope, checks).
   - **DreamBoard 19:00 audit** (будни): выдать аудит в строгом формате `STATUS/COMMIT/PR/CHECKS/DEMO/TEST_REPORT/BLOCKER`, при отсутствии доказательств — `FAIL`.

## 2) Зафиксированные готовые решения от GPT/ассистента

По доступной истории приняты и подтверждены такие решения:

1. Принят формат ответа для 3-часового апдейта с fallback-фразой при отсутствии изменений.
2. Подтверждено добавление cron-задачи **09:00 kickoff** (isolated + announce).
3. Подтверждено добавление cron-задачи **19:00 audit** (isolated + announce).
4. В heartbeat-циклах несколько раз возвращался статус **BLOCKED** с обоснованием:
   - нет commit history,
   - нет активного PR,
   - нет CI/checks,
   - staging/API endpoint не обнаружен.

## 3) Текущий статус проекта (по факту на момент аудита)

### Что сделано

- Инициализирован workspace с базовыми управляющими файлами (`AGENTS.md`, `SOUL.md`, `HEARTBEAT.md`, и т.д.).
- Ведется журнал сессии в `memory/2026-03-11-0627.md`.
- Сформулированы и приняты регламенты heartbeat и отчетности.

### Что не сделано / отсутствует

- Нет исходного кода DreamBoard (приложения/сервисов) в репозитории.
- Нет файлов приложения, модулей, тестов, конфигов CI/CD.
- Нет подтвержденного commit history по рабочему коду DreamBoard.
- Нет открытого PR и нет результатов CI для него.
- Нет артефактов demo/test-report.
- Нет явного staging/API endpoint в структуре проекта.

## 4) Сопоставление с реальной структурой папок

### Обнаруженная структура `/srv/dreamboard`

- `.openclaw/workspace-state.json`
- `AGENTS.md`
- `BOOTSTRAP.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `SOUL.md`
- `TOOLS.md`
- `USER.md`
- `memory/2026-03-11-0627.md`
- служебная директория `.git/` (технические файлы Git)

### Что уже есть

- Организационный каркас ассистента и регламент heartbeat.
- Базовая память по текущей сессии.
- Git-репозиторий как контейнер проекта.

### Чего не хватает для «боевого» DreamBoard

1. **Кодовой базы**:
   - `src/` (или эквивалент),
   - `package.json`/`pyproject.toml`/другой манифест,
   - конфиги линтеров/форматтеров.
2. **Тестового контура**:
   - unit/integration/e2e тесты,
   - команды запуска тестов,
   - отчеты (`TEST_REPORT`).
3. **CI/CD и PR-процесса**:
   - workflow-файлы CI,
   - подтвержденные статусы checks,
   - активный PR с ссылкой.
4. **Демо/стейджинга**:
   - staging URL/API endpoint,
   - демонстрационные артефакты (`DEMO`).
5. **Долгосрочной памяти проекта**:
   - отсутствует `MEMORY.md` (долгосрочная проектная память).

## 5) Важное ограничение по полноте памяти

Я зафиксировал только то, что доступно в текущем workspace и журнале сессии. Поиск в памяти (`memory_search`) не вернул дополнительных архивных записей, поэтому неизвестные старые договоренности (если они были в других чатах/вне этого workspace) сюда не вошли.

## 6) Master-plan из документа пользователя (v1.0, 25.02.2026)

Источник: присланный документ `.docx` с заголовком «DreamBoard — Полное ТЗ и мастер‑план (v1.0)».

### Продуктовая цель
- DreamBoard как интерактивная визуальная доска целей (cards/image/text/stickers/links), с drag/resize/rotate, версиями и шарингом.

### KPI (первые 3 месяца после запуска)
- Activation ≥ 60%
- Time-to-first-board ≤ 3 мин
- D1 ≥ 30%, D7 ≥ 15%
- Share rate ≥ 20%
- Crash-free ≥ 99.5%

### MVP scope
- Auth (минимум 1 метод на старте)
- Создание доски (шаблон/пустая)
- Элементы: image/text/sticker
- Жесты: drag/resize/rotate/layer/delete/duplicate
- Автосейв
- Export PNG/JPG
- Public view-only link
- Базовая аналитика

### Out of MVP
- Real-time collaboration
- AI generation
- Продвинутая анимация, marketplace, media-rich boards

### План сроков
- 5-дневный рабочий блок (текущий тактический план)
- Далее стратегический план: ~12 недель до стабильного MVP:
  - Discovery (1w)
  - Foundation (2w)
  - Core Editor (3w)
  - Templates/Export/Share (2w)
  - QA/Beta Hardening (2w)
  - Soft Launch (1w)
  - Public Launch (1w)

### Тех-ориентиры
- Backend: NestJS/Node
- DB: PostgreSQL
- Storage: S3-compatible
- Cache/Queue: Redis
- Monitoring: Sentry + metrics stack

### Ближайшие продуктовые задачи (из приложения к документу)
1) UI tokens (colors/spacing/type)
2) Mobile screen map (MVP)
3) Interactive board behavior spec (drag/resize/rotate)

## 7) Scope override (подтверждено пользователем в текущем спринте)

Финальный приоритет и границы Day 5:
- В MVP входят только:
  - Auth
  - Boards CRUD
- Отложено на следующий этап:
  - cards
  - uploads
  - editor implementation
- Для закрытия Day 5 staging не требуется; принимается локальное demo-evidence.
