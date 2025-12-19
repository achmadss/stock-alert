from sqlalchemy import Column, Integer, String, DateTime, JSON
from database import Base

class TradingPlan(Base):
    __tablename__ = "trading_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    datetime = Column(DateTime, nullable=False, index=True)
    name = Column(String, nullable=False)
    buy = Column(JSON, nullable=False)
    tp = Column(JSON, nullable=False)
    sl = Column(Integer, nullable=False)
