# SQLite models — defines the SQLAlchemy ORM model for the claims table

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime
)
from sqlalchemy.sql import func
from database.db import Base, engine


class Claim(Base):
    """ORM model representing a single motor insurance claim record."""

    __tablename__ = "claims"

    # Primary key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Unique claim reference (e.g. "CLM-2024-001")
    claim_id = Column(String, unique=True, nullable=False, index=True)

    # Vehicle registration number
    car_number = Column(String, nullable=False)

    # AI-assessed damage severity: "low" | "medium" | "high" | "severe"
    severity = Column(String, nullable=False)

    # Part of the car that was damaged (e.g. "front bumper"), may be absent
    damaged_part = Column(String, nullable=True)

    # Amount the policyholder is claiming (in local currency)
    claimed_amount = Column(Float, nullable=False)

    # Lower bound of AI-estimated repair cost
    estimated_cost_min = Column(Float, nullable=False)

    # Upper bound of AI-estimated repair cost
    estimated_cost_max = Column(Float, nullable=False)

    # True if the claim has been flagged as potentially fraudulent
    is_flagged = Column(Boolean, default=False, nullable=False)

    # Comma-separated or JSON-encoded list of fraud flag reasons (e.g. "over-claim,duplicate")
    flag_reasons = Column(String, nullable=True)

    # Timestamp set automatically when the row is first inserted
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return (
            f"<Claim id={self.id} claim_id={self.claim_id!r} "
            f"severity={self.severity!r} is_flagged={self.is_flagged}>"
        )


def create_tables():
    """Create all tables in the database if they do not already exist."""
    Base.metadata.create_all(bind=engine)
