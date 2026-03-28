.PHONY: up down build logs shell

up:
	docker-compose up

build:
	docker-compose up --build -d

down:
	docker-compose down

logs:
	docker-compose logs -f backend

shell:
	docker-compose exec backend bash