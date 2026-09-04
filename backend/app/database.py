import logging
import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger("smarttutor.database")

load_dotenv()

database_url = os.getenv("DATABASE_URL")

if not database_url:
    logger.error("DATABASE_URL not found")
    raise ValueError("DATABASE_URL must be set")


class Base(DeclarativeBase):
    pass


# Neon requires SSL (usually in the connection string)
# echo=True enables SQLAlchemy to log every SQL query to the console
engine = create_engine(
    database_url,
    echo=os.getenv("ENVIRONMENT", "development") == "development",
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session() -> Generator[Session, None, None]:
    """Dependency to provide a database session to FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Creates tables in the database based on SQLAlchemy metadata."""
    try:
        logger.info("Syncing models with Neon database...")
        Base.metadata.create_all(engine)
        logger.info("Database sync completed successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
