.DEFAULT_GOAL := help
SHELL := /bin/bash

.PHONY: help up up-full down ps logs build restart test test-backend test-frontend lint typecheck fmt fmt-check tasks migrate check clean

help: ## Показать команды
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Поднять локальный стек (без MinIO)
	docker compose up -d --build
	@echo "Фронтенд: http://localhost:5173 · API: http://localhost:8000/docs"

up-full: ## Поднять стек вместе с MinIO
	docker compose --profile storage up -d --build
	@echo "Фронтенд: http://localhost:5173 · API: http://localhost:8000/docs · MinIO: http://localhost:9001"

down: ## Остановить стек (данные сохраняются)
	docker compose down

ps: ## Статус контейнеров
	docker compose ps

logs: ## Логи всех сервисов
	docker compose logs -f --tail=100

build: ## Собрать образы
	docker compose build

restart: ## Перезапустить бэкенд и фронтенд
	docker compose restart backend frontend

test: test-backend test-frontend ## Все тесты

test-backend: ## Тесты бэкенда
	cd backend && uv run pytest

test-frontend: ## Тесты фронтенда
	cd frontend && npm test

lint: ## Линтеры обоих приложений
	cd backend && uv run ruff check .
	cd frontend && npm run lint

typecheck: ## Проверка типов
	cd backend && uv run mypy
	cd frontend && npm run typecheck

fmt: ## Форматирование (ruff + prettier)
	cd backend && uv run ruff format . && uv run ruff check --fix .
	cd frontend && npm run format

fmt-check: ## Проверить форматирование без изменений
	cd backend && uv run ruff format --check .
	cd frontend && npx prettier --check "src/**/*.{ts,tsx,css}"

tasks: ## Статусы задач из docs/ROADMAP.md
	python3 scripts/tasks.py

migrate: ## Применить миграции БД
	cd backend && uv run alembic upgrade head

check: lint typecheck test fmt-check ## Всё, что должен проходить PR

clean: ## Удалить артефакты сборки
	rm -rf frontend/dist frontend/node_modules backend/.venv
	rm -rf backend/.mypy_cache backend/.ruff_cache backend/.pytest_cache
