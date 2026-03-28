import logging
import sys
from typing import Annotated, Any

from fastapi import Depends, FastAPI
from sqlmodel import Session, select
from uvicorn.logging import DefaultFormatter

from .database import get_session

app = FastAPI(title="PLearner API")

# --- LOGGING CONFIGURATION ---
formatter = DefaultFormatter(fmt="%(levelprefix)-10s %(message)s", use_colors=True)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

logger = logging.getLogger("plearner")
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
        result = session.exec(select(1)).first()

        logger.info("Database connection successful!")
        return {"status": "connected", "result": result}
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return {"status": "error", "detail": str(e)}
