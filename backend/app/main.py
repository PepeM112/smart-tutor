import logging
import sys
from typing import Annotated, Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from uvicorn.logging import DefaultFormatter

from app.api.v1.endpoints import users

from .config import settings
from .database import get_session

app = FastAPI(title="SmartTutor API")

app.include_router(users.router, prefix="/api/v1/users", tags=["users"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LOGGING CONFIGURATION ---
formatter = DefaultFormatter(fmt="%(levelprefix)-10s %(message)s", use_colors=True)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

logger = logging.getLogger("smarttutor")
logger.handlers = [console_handler]
logger.setLevel(logging.INFO)
logger.propagate = False


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/db-test")
def test_db(session: Annotated[Session, Depends(get_session)]) -> dict[str, Any]:
    logger.info("Testing database connection to Neon...")
    try:
        result = session.execute(text("SELECT 1")).scalar()

        logger.info("Database connection successful!")
        return {"status": "connected", "result": result}
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return {"status": "error", "detail": str(e)}
