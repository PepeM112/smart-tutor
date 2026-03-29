# ==============================
# Configuration
# ==============================

BACKEND_ENV := ./backend/.env
DOCKER_COMPOSE := docker-compose --env-file ${BACKEND_ENV}

# ==============================
# Main
# ==============================

default: help

up: ## Start all services (backend + any dependencies)
	$(DOCKER_COMPOSE) up

build: ## Build and start services in detached mode
	$(DOCKER_COMPOSE) up --build -d

down: ## Stop all services
	$(DOCKER_COMPOSE) down

rebuild: ## Rebuild images and restart services
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) up --build -d

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
# Maintenance
# ==============================

clean: ## Stop services and remove containers/volumes
	$(DOCKER_COMPOSE) down -v

clean-logs: ## Remove docker logs
	@find /var/lib/docker/containers -name "*.log" -delete

restart: ## Restart all services
	$(DOCKER_COMPOSE) restart

help: ## Show this help menu
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

.PHONY: up down build rebuild logs shell test install-backend migrate-create migrate-upgrade migrate-downgrade migrate-current migrate-history clean clean-logs restart help