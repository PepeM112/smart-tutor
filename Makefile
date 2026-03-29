BACKEND_ENV := ./backend/.env

.PHONY: up down build logs shell

up:
	docker-compose --env-file ${BACKEND_ENV} up

build:
	docker-compose --env-file ${BACKEND_ENV} up --build -d

down:
	docker-compose down

logs:
	docker-compose logs -f backend

shell:
	docker-compose exec backend bash