# BPMN Studio

Редактор BPMN-схем: цветное моделирование как в Bizagi, проверки, прогон токена и
совместная работа как в StormBPM. План и статусы — в [docs/ROADMAP.md](docs/ROADMAP.md).

Текущее состояние: **спринт 1.1** — BPMN читается, валидируется, хранится и рисуется
в режиме просмотра (зум, мини-карта). Редактирования на холсте ещё нет — спринт 1.2.

## Быстрый старт

```bash
cp .env.example .env
make up          # docker compose up -d --build
```

- редактор — http://localhost
- API и Swagger — http://localhost:8000/docs
- консоль MinIO — http://localhost:9001 (`minioadmin` / `minioadmin`)

Остановить: `make down`. Данные Postgres/Redis/MinIO живут в именованных томах.

## Без Docker

Нужны Python 3.12+, Node 20.19+, запущенные Postgres и Redis.

```bash
cd backend && uv sync
DATABASE_URL=postgresql+asyncpg://bpmn:bpmn@localhost:5432/bpmn \
REDIS_URL=redis://localhost:6379/0 \
uv run uvicorn app.main:app --reload --port 8000

cd frontend && npm ci && npm run dev
```

Фронтенд откроется на http://localhost:5173. В Docker он по-прежнему доступен
на http://localhost: порт 80 задаётся явно в команде контейнера, поэтому root-права
на хосте для локальной разработки не нужны.

Хосты в `.env` рассчитаны на compose (`postgres`, `redis`), поэтому при локальном
запуске переменные нужно переопределить, как показано выше.

## Структура

```
backend/app/bpmn/   модель BPMN, парсер, генератор XML, XSD-валидация
backend/app/db/     таблицы диаграмм, версий, прав, комментариев, вложений
backend/app/api/    роуты: health, диаграммы
backend/migrations/ миграции Alembic
frontend/           React + TypeScript + bpmn-js: список, просмотрщик, тема
docs/ROADMAP.md     дорожная карта и единственный источник статусов задач
docs/adr/           принятые архитектурные решения
infra/              инициализация Postgres, далее — nginx/Helm
scripts/tasks.py    сводка прогресса по дорожной карте
```

## API диаграмм

| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/api/v1/diagrams` | создать (без `bpmn_xml` — сгенерируется пустая диаграмма) |
| `GET` | `/api/v1/diagrams` | список, `?limit=&offset=` |
| `GET/PATCH/DELETE` | `/api/v1/diagrams/{id}` | метаданные, переименование, удаление |
| `GET` | `/api/v1/diagrams/{id}/bpmn` | BPMN XML как `application/xml`, с `ETag` |
| `PUT` | `/api/v1/diagrams/{id}/bpmn` | сохранить XML: XSD-валидация, обязательный `If-Match` (нет — 428, устарел — 409), тело до 5 МиБ читается потоково |
| `GET` | `/api/v1/diagrams/{id}/versions` | история версий |

Правила простые: XML проверяется по официальной XSD BPMN 2.0, ошибка возвращается
с номером строки и колонки; каждая правка — новая версия; одинаковый XML версию
не создаёт. Диаграмму в браузере можно создать кнопкой «Создать демо-процесс».

Комментарии к элементам схемы — отдельный ресурс:
`GET/POST /api/v1/diagrams/{id}/comments`, `PATCH/DELETE .../comments/{comment_id}`
(resolve/reopen через `{"resolved": true|false}`). До этапа 4 автор — `local`.

Миграции: `make migrate` (или `cd backend && uv run alembic upgrade head`).

## Проверки

| Команда | Что делает |
|---|---|
| `make check` | всё, что должен проходить PR: линт, типы, тесты, формат |
| `make test` | pytest + vitest |
| `make lint` | ruff + eslint |
| `make typecheck` | mypy strict + tsc |
| `make tasks` | сколько задач сделано, в работе и не начато |
| `make migrate` | применить миграции БД |
| `cd frontend && npm run test:e2e` | Playwright-сценарий редактора; нужен живой стек (`E2E_BASE_URL`, по умолчанию `http://127.0.0.1`) |

## Прогресс по дорожной карте

Статусы ведутся чекбоксами прямо в `docs/ROADMAP.md`: `[ ]` — не начато,
`[~]` — в работе, `[x]` — готово, `[!]` — блокер. Внешнего трекера нет.

```bash
make tasks                  # сводка по этапам
python3 scripts/tasks.py --stage 1 --status todo
```
