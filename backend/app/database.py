import logging
import os
from typing import Any, Generator

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

logger = logging.getLogger("plearner.database")

load_dotenv()

database_url = os.getenv("DATABASE_URL")

if not database_url:
    logger.error("DATABASE_URL not found")
    raise ValueError("DATABASE_URL must be set")

# Neon requires SSL (usually in the connection string)
# echo=True enables SQLAlchemy to log every SQL query to the console
engine = create_engine(database_url, echo=True)


def get_session() -> Generator[Session, Any, None]:
    """Dependency to provide a database session to FastAPI routes."""
    with Session(engine) as session:
        yield session


def init_db() -> None:
    """Creates tables in the database based on SQLModel metadata."""
    try:
        logger.info("Syncing models with Neon database...")
        SQLModel.metadata.create_all(engine)
        logger.info("Database sync completed successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        raise
