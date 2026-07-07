from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Create database engine
# For PostgreSQL we use psycopg2-binary
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Create local session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base for ORM models
Base = declarative_base()

# FastAPI database session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
