# BPMN Studio

Редактор BPMN-схем: цветное моделирование как в Bizagi, проверки, прогон токена и
совместная работа как в StormBPM. План и статусы — в [docs/ROADMAP.md](docs/ROADMAP.md).

Текущее состояние: **v0.2 выпущен** — редактор BPMN с оформлением, документацией и
комментариями, экспорт в 8 форматов, проверка схемы (структура, шлюзы, события),
конфиг правил, панель проблем, DOCX-отчёт и API для CI. В `main` идёт первый срез
этапа 3 — симуляция токена (`v0.3`).

![Демо BPMN Studio: редактор, этапы внутри пула и экспорт](docs/assets/demo.gif)

## Быстрый старт

```bash
cp .env.example .env
make up          # docker compose up -d --build
```

- редактор — http://localhost
- API и Swagger — http://localhost:8000/docs
- консоль MinIO — http://localhost:9001 (`minioadmin` / `minioadmin`), только `make up-full`

Остановить: `make down`. Данные Postgres/Redis/MinIO живут в именованных томах.
Демо-данные: `make seed`.

Production-профиль собирает статический frontend за nginx, запускает backend без
`--reload`, закрывает Swagger и слушает только loopback:

```bash
cp .env.production.example .env.production
# задайте пароли, PUBLIC_ORIGIN и при необходимости BIND_ADDRESS/FRONTEND_PORT
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

UI на `http://127.0.0.1:8080`; наружу его публикует ваш reverse proxy с TLS.
В production включаются CSP/security headers, rate limiting, таймауты и отключённые
`/docs`/`/openapi.json`.

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
backend/app/api/    роуты: health, диаграммы, комментарии, экспорт
backend/app/validation/ правила BPMN, конфиг правил, DOCX-отчёт
backend/app/export/ JSON, CSV, XLSX, DOCX и PDF
backend/migrations/ миграции Alembic
frontend/           React + TypeScript + bpmn-js: редактор, экспорт, темы
docs/ROADMAP.md     дорожная карта и единственный источник статусов задач
docs/adr/           принятые архитектурные решения
infra/              инициализация Postgres, далее — nginx/Helm
scripts/tasks.py    сводка прогресса по дорожной карте
scripts/validate.py CI-проверка диаграммы через API
scripts/benchmark_validation.py бенчмарк 200/500/1000 элементов
```

## API диаграмм

| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/api/v1/diagrams` | создать (без `bpmn_xml` — сгенерируется пустая диаграмма) |
| `GET` | `/api/v1/diagrams` | список, `?limit=&offset=` |
| `GET/PATCH/DELETE` | `/api/v1/diagrams/{id}` | метаданные, переименование, удаление |
| `GET` | `/api/v1/diagrams/{id}/bpmn` | BPMN XML как `application/xml`, с `ETag` |
| `PUT` | `/api/v1/diagrams/{id}/bpmn` | сохранить XML: XSD-валидация, обязательный `If-Match` (нет — 428, устарел — 409), тело до 5 МиБ читается потоково |
| `POST` | `/api/v1/diagrams/{id}/validate` | проверить сохранённый XML; `?include=xsd,structure,gateway,event,lane`, ошибки схемы — `valid=false` при 200 |
| `GET` | `/api/v1/diagrams/{id}/validation` | то же самое для UI, помечен `deprecated` — для CI используйте `POST /validate` |
| `GET` | `/api/v1/diagrams/{id}/validation/report.docx` | DOCX-отчёт: сводка и таблица находок |
| `GET` | `/api/v1/diagrams/{id}/versions` | история версий |
| `POST` | `/api/v1/diagrams/{id}/exports/{fmt}` | `json`, `csv`, `xlsx`, `docx`, `pdf` из текущего XML |
| `POST` | `/api/v1/diagrams/{id}/exports/{fmt}/jobs` | поставить выгрузку в очередь (202) |
| `GET` | `/api/v1/diagrams/{id}/exports/jobs` | история выгрузок с прогрессом |
| `GET` | `/api/v1/diagrams/{id}/exports/jobs/{job_id}/download` | скачать готовый файл |

Правила простые: XML проверяется по официальной XSD BPMN 2.0 одним разбором,
ошибка возвращается с номером строки и колонки; `PUT /bpmn` дополнительно отдаёт
`X-Validation-Errors`/`X-Validation-Warnings`, но сохраняет черновик с ошибками;
каждая правка — новая версия; одинаковый XML версию не создаёт. В браузере доступны шаблоны «Согласование»,
«Онбординг» и «Закупка», а также экспорт текущего холста без предварительного
сохранения. SVG/PNG/BPMN собирает bpmn-js, остальные форматы — сервер.

Комментарии к элементам схемы — отдельный ресурс:
`GET/POST /api/v1/diagrams/{id}/comments`, `PATCH/DELETE .../comments/{comment_id}`
(resolve/reopen через `{"resolved": true|false}`). До этапа 4 автор — `local`.

Миграции: `make migrate` (или `cd backend && uv run alembic upgrade head`).

## Проверка схемы

В редакторе кнопка «Проверить» и панель «Проблемы» показывают ошибки с переходом
к элементу; маркеры на холсте окрашены по худшей severity. Проверяются структура
(старт/финиш, достижимость, висячие потоки, id, дорожки), шлюзы (ветки без
условия и default, смешанные шлюзы) и события (граничные, старт/финиш,
событийный шлюз). Условия не исполняются.

Для CI:

```bash
BPMN_API_URL=http://localhost:8000/api/v1 BPMN_DIAGRAM_ID=<id> \
  python3 scripts/validate.py            # код 1 при valid=false; make вернёт 2
# или
make validate DIAGRAM_ID=<id>
```

Свой набор правил — JSON-файл в `VALIDATION_RULES_FILE` (только данные, без кода):

```json
{
  "rules": {"BPMN-STRUCT-009": {"enabled": false}},
  "custom_rules": [
    {"id": "BPMN-CUSTOM-001", "kind": "max_elements", "max": 50},
    {"id": "BPMN-CUSTOM-002", "kind": "required_attribute",
     "attribute": "documentation", "node_types": ["userTask"]}
  ]
}
```

Ошибки конфига не ломают проверку: они приходят в `config_errors` и показываются
в панели отдельно. Бенчмарк: `make bench` (p95 6/13/27 мс на 200/500/1000 задач).

## Проверки

| Команда | Что делает |
|---|---|
| `make check` | всё, что должен проходить PR: линт, типы, тесты, формат |
| `make test` | pytest + vitest |
| `make lint` | ruff + eslint |
| `make typecheck` | mypy strict + tsc |
| `make tasks` | сколько задач сделано, в работе и не начато |
| `make seed` | создать демонстрационные диаграммы на запущенном стенде |
| `make gif` | пересобрать `docs/assets/demo.gif` на запущенном стеке |
| `make migrate` | применить миграции БД |
| `make validate DIAGRAM_ID=…` | проверить диаграмму через API, ненулевой код при ошибках |
| `make bench` | бенчмарк валидации 200/500/1000 элементов |
| `cd frontend && npm run test:e2e` | Playwright-сценарий редактора; нужен живой стек (`E2E_BASE_URL`, по умолчанию `http://127.0.0.1`) |

## Прогресс по дорожной карте

Статусы ведутся чекбоксами прямо в `docs/ROADMAP.md`: `[ ]` — не начато,
`[~]` — в работе, `[x]` — готово, `[!]` — блокер. Внешнего трекера нет.

```bash
make tasks                  # сводка по этапам
python3 scripts/tasks.py --stage 1 --status todo
```
