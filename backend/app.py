from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from database import get_db, engine
from models import TradingPlan, Base
from telegram_listener import add_subscriber, remove_subscriber, get_channels
from typing import Optional
import json
from alembic.config import Config
from alembic import command
import os

app = FastAPI()

# CORS configuration for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",           # Local development
        "https://stock.achmad.dev",        # Production frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

listener_task = None


def run_migrations():
    """Run Alembic migrations on startup."""
    print("Running database migrations...")
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    print("Migrations completed successfully")


@app.on_event("startup")
async def startup_event():
    global listener_task

    # Run migrations first
    run_migrations()

    # Create tables (Alembic handles schema, this is for safety)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    import asyncio
    from telegram_listener import start_listener

    async def run_listener():
        try:
            await start_listener()
        except Exception as e:
            print(f"ERROR in listener task: {e}")
            import traceback
            traceback.print_exc()

    listener_task = asyncio.create_task(run_listener())
    print("Listener task started")

@app.get("/alert")
async def alert():
    """Stream all trading plan alerts via Server-Sent Events."""
    queue = add_subscriber()

    async def event_generator():
        try:
            while True:
                trading_plan = await queue.get()
                trading_plan_copy = trading_plan.copy()
                trading_plan_copy['datetime'] = trading_plan_copy['datetime'].isoformat()
                yield f"data: {json.dumps(trading_plan_copy)}\n\n"
        finally:
            remove_subscriber(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/alert/{stock_name}")
async def alert_by_stock(stock_name: str):
    """Stream trading plan alerts for a specific stock (case-insensitive)."""
    queue = add_subscriber()
    stock_name_lower = stock_name.lower()

    async def event_generator():
        try:
            while True:
                trading_plan = await queue.get()
                if trading_plan['name'].lower() == stock_name_lower:
                    trading_plan_copy = trading_plan.copy()
                    trading_plan_copy['datetime'] = trading_plan_copy['datetime'].isoformat()
                    yield f"data: {json.dumps(trading_plan_copy)}\n\n"
        finally:
            remove_subscriber(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/history")
async def history(skip: int = 0, limit: int = 50, stock_name: Optional[str] = None, db=Depends(get_db)):
    """Get historical trading plans, optionally filtered by stock name (case-insensitive)."""
    query = select(TradingPlan).order_by(TradingPlan.datetime.desc())

    if stock_name:
        query = query.where(TradingPlan.name.ilike(stock_name))

    result = await db.execute(query.offset(skip).limit(limit))
    trading_plans = result.scalars().all()

    return {
        "trading_plans": [
            {
                "message_id": tp.message_id,
                "datetime": tp.datetime.isoformat(),
                "name": tp.name,
                "buy": tp.buy,
                "tp": tp.tp,
                "sl": tp.sl
            }
            for tp in trading_plans
        ]
    }

@app.get("/channels")
async def channels():
    """Get list of available telegram channels."""
    return {"channels": await get_channels()}
