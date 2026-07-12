# ==============================
# Configuration
# ==============================

FRONTEND_DIR := ./frontend
BACKEND_ENV := ./backend/.env
DOCKER_COMPOSE := docker-compose --env-file ${BACKEND_ENV}

# ==============================
# Main
# ==============================

default: help

up: ## Start all services (backend + frontend)
	$(DOCKER_COMPOSE) up

build: ## Build and start services in detached mode
	$(DOCKER_COMPOSE) up --build -d

down: ## Stop all services
	$(DOCKER_COMPOSE) down

rebuild: ## Rebuild images and restart services
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) up --build -d

# ==============================
# Frontend
# ==============================

frontend-logs: ## View frontend logs
	$(DOCKER_COMPOSE) logs -f frontend

frontend-shell: ## Open bash in frontend container
	$(DOCKER_COMPOSE) exec frontend sh

frontend-install: ## Install frontend dependencies inside container
	$(DOCKER_COMPOSE) exec frontend npm install

frontend-gen: ## Regenerate API Client SDK from OpenAPI schema
	cd frontend && npm run gen-client
# ==============================
# Backend
# ==============================

logs: ## View backend logs in real-time
	$(DOCKER_COMPOSE) logs -f backend

shell: ## Open bash shell in backend container
	$(DOCKER_COMPOSE) exec backend bash

test: ## Run tests in backend container
	$(DOCKER_COMPOSE) exec backend pytest tests/ -v

install-backend: ## Install backend dependencies in container
	$(DOCKER_COMPOSE) exec backend poetry install

# ==============================
# Database / Migrations
# ==============================

migrate-create: ## Create a new database migration
	@read -p "Enter migration name: " MSG; \
	$(DOCKER_COMPOSE) exec backend alembic revision --autogenerate -m "$$MSG"

migrate-upgrade: ## Apply pending migrations to database
	$(DOCKER_COMPOSE) exec backend alembic upgrade head

migrate-downgrade: ## Rollback last migration
	$(DOCKER_COMPOSE) exec backend alembic downgrade -1

migrate-current: ## Show current migration status
	$(DOCKER_COMPOSE) exec backend alembic current

migrate-history: ## Show migration history
	$(DOCKER_COMPOSE) exec backend alembic history --oneline

# ==============================
# Lint & Format
# ==============================

lint: ## Check linting + formatting for the whole project (no changes)
	@echo "=== Backend: ruff ==="
	$(DOCKER_COMPOSE) exec backend ruff check app/
	$(DOCKER_COMPOSE) exec backend ruff format --check app/
	@echo "\n=== Frontend: eslint + prettier ==="
	cd frontend && npm run format:check

format: ## Auto-fix linting + formatting for the whole project
	@echo "=== Backend: ruff ==="
	$(DOCKER_COMPOSE) exec backend ruff check --fix app/
	$(DOCKER_COMPOSE) exec backend ruff format app/
	@echo "\n=== Frontend: eslint + prettier ==="
	cd frontend && npm run format

format-branch: ## Auto-fix lint + format only files changed on current branch (vs dev)
	@echo "=== Backend: ruff (branch files) ==="
	@PY_FILES=$$(git diff --name-only --diff-filter=ACMR $$(git merge-base HEAD dev) | grep -E '^backend/.*\.py$$' | sed 's|^backend/||' | tr '\n' ' '); \
	if [ -n "$$PY_FILES" ]; then \
		$(DOCKER_COMPOSE) exec backend sh -c "ruff check --fix $$PY_FILES && ruff format $$PY_FILES"; \
	else \
		echo "No Python files changed."; \
	fi
	@echo "\n=== Frontend: eslint + prettier (branch files) ==="
	cd frontend && npm run format:branch

format-check: ## Check lint + format for the whole project (no changes)
	@echo "=== Backend: ruff ==="
	$(DOCKER_COMPOSE) exec backend ruff check app/
	$(DOCKER_COMPOSE) exec backend ruff format --check app/
	@echo "\n=== Frontend: eslint + prettier ==="
	cd frontend && npm run format:check

format-branch-check: ## Check lint + format only files changed on current branch (vs dev)
	@echo "=== Backend: ruff (branch files) ==="
	@PY_FILES=$$(git diff --name-only --diff-filter=ACMR $$(git merge-base HEAD dev) | grep -E '^backend/.*\.py$$' | sed 's|^backend/||' | tr '\n' ' '); \
	if [ -n "$$PY_FILES" ]; then \
		$(DOCKER_COMPOSE) exec backend sh -c "ruff check $$PY_FILES && ruff format --check $$PY_FILES"; \
	else \
		echo "No Python files changed."; \
	fi
	@echo "\n=== Frontend: eslint + prettier (branch files) ==="
	cd frontend && npm run format:branch:check

type-check: ## Run TypeScript type checking (frontend)
	cd frontend && npx tsc --noEmit

pyright: ## Run pyright type checking (backend)
	$(DOCKER_COMPOSE) exec backend poetry run pyright app/

# ==============================
# Maintenance
# ==============================

install-all: install-backend frontend-install ## Install all dependencies (BE + FE)

seed: ## Seed database with all sample tests
	bash scripts/seed.sh

clean: ## Stop services and remove containers, volumes, and local images
	$(DOCKER_COMPOSE) down -v --rmi local

clean-fe: ## Remove Next.js build and cache folders
	rm -rf frontend/.next
	rm -rf frontend/.turbo

clean-logs: ## Remove docker logs (requires sudo/root)
	@sudo find /var/lib/docker/containers -name "*.log" -delete 2>/dev/null || echo "Log cleanup failed (permissions?)"

restart: ## Restart all services
	$(DOCKER_COMPOSE) restart

help: ## Show this help menu
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

.PHONY: up build down rebuild frontend-logs frontend-shell frontend-install frontend-gen logs shell test install-backend install-all migrate-create migrate-upgrade migrate-downgrade migrate-current migrate-history lint format format-check format-branch format-branch-check type-check pyright seed clean clean-fe clean-logs restart help
