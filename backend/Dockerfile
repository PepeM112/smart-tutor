# --- STAGE 1: Builder ---
FROM python:3.10-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

ARG INSTALL_DEV=false

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir poetry

COPY pyproject.toml poetry.lock* ./

# Install dependencies into this stage's system Python
RUN if [ "$INSTALL_DEV" = "true" ]; then \
      poetry install --no-interaction --no-root; \
    else \
      poetry install --no-interaction --no-root --only main; \
    fi

# --- STAGE 2: Runner ---
FROM python:3.10-slim AS runner

WORKDIR /app

# Runtime only needs libpq5 (PostgreSQL client library)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 && \
    rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1

COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
