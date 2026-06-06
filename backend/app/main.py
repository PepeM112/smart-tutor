import logging
import sys
from typing import Annotated, Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from sqlalchemy import text
from sqlalchemy.orm import Session
from uvicorn.logging import DefaultFormatter

from app.api.v1.endpoints import questions, results, review, tests, users

from .config import settings
from .database import get_session


def custom_generate_unique_id(route: APIRoute) -> str:
    """
    Generated an operation id based in the tag and the naem of the function.
    Example: tag "tests" + function "create" -> testsCreate
    """
    tag = route.tags[0] if route.tags else "default"
    # snake_case => PascalCase
    operation_name = "".join(word.capitalize() for word in route.name.split("_"))
    return f"{tag}{operation_name}"


app = FastAPI(title="SmartTutor API", generate_unique_id_function=custom_generate_unique_id)

app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(tests.router, prefix="/api/v1/tests", tags=["tests"])
app.include_router(results.router, prefix="/api/v1/results", tags=["results"])
app.include_router(questions.router, prefix="/api/v1/questions", tags=["questions"])
app.include_router(review.router, prefix="/api/v1/review", tags=["review"])

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
