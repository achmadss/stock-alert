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
import sys
import asyncio
from datetime import datetime, timedelta
import pytz


def run_migrations():
    """Run Alembic migrations before starting the app."""
    try:
        print("=" * 50)
        print("Running database migrations...")
        print("=" * 50)
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("=" * 50)
        print("✓ Migrations completed successfully")
        print("=" * 50)
    except Exception as e:
        print("=" * 50)
        print(f"✗ MIGRATION FAILED: {e}")
        print("=" * 50)
        print("Cannot start application without successful migrations.")
        import traceback
        traceback.print_exc()
        sys.exit(1)


# Run migrations BEFORE creating FastAPI app
print("Initializing Stock Alert Backend...")
run_migrations()

# Now create the app
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


def get_today_range_utc7():
    """Get start and end datetime for today in UTC+7 timezone."""
    # Get current time in UTC+7
    utc7 = pytz.timezone('Asia/Jakarta')  # UTC+7
    now_utc7 = datetime.now(utc7)

    # Get start of today (00:00:00) in UTC+7
    start_of_day = now_utc7.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get end of today (23:59:59) in UTC+7
    end_of_day = now_utc7.replace(hour=23, minute=59, second=59, microsecond=999999)

    # Convert to naive datetime (remove timezone info) since database stores naive datetimes
    start_naive = start_of_day.replace(tzinfo=None)
    end_naive = end_of_day.replace(tzinfo=None)

    return start_naive, end_naive


@app.on_event("startup")
async def startup_event():
    global listener_task

    # Create tables (migrations already ran)
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
    print("=" * 50)
    print("✓ Backend started successfully")
    print("=" * 50)

@app.get("/alert")
async def alert():
    """Stream all trading plan alerts via Server-Sent Events."""
    queue = add_subscriber()

    async def event_generator():
        try:
            # Send immediate keep-alive to indicate connection established
            yield ": connected\n\n"

            while True:
                try:
                    trading_plan = await asyncio.wait_for(queue.get(), timeout=30.0)
                    trading_plan_copy = trading_plan.copy()
                    trading_plan_copy['datetime'] = trading_plan_copy['datetime'].isoformat()
                    yield f"data: {json.dumps(trading_plan_copy)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            remove_subscriber(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

@app.get("/alert/{stock_name}")
async def alert_by_stock(stock_name: str):
    """Stream trading plan alerts for a specific stock (case-insensitive)."""
    queue = add_subscriber()
    stock_name_lower = stock_name.lower()

    async def event_generator():
        try:
            # Send immediate keep-alive to indicate connection established
            yield ": connected\n\n"

            while True:
                try:
                    trading_plan = await asyncio.wait_for(queue.get(), timeout=30.0)
                    if trading_plan['name'].lower() == stock_name_lower:
                        trading_plan_copy = trading_plan.copy()
                        trading_plan_copy['datetime'] = trading_plan_copy['datetime'].isoformat()
                        yield f"data: {json.dumps(trading_plan_copy)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            remove_subscriber(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

@app.get("/history")
async def history(skip: int = 0, limit: int = 50, stock_name: Optional[str] = None, db=Depends(get_db)):
    """Get historical trading plans for today only, optionally filtered by stock name (case-insensitive)."""
    # Get today's date range in UTC+7
    start_of_day, end_of_day = get_today_range_utc7()

    # Filter by today's date
    query = select(TradingPlan).where(
        TradingPlan.datetime >= start_of_day,
        TradingPlan.datetime <= end_of_day
    ).order_by(TradingPlan.datetime.desc())

    if stock_name:
        query = query.where(TradingPlan.name.ilike(f"%{stock_name}%"))

    result = await db.execute(query.offset(skip).limit(limit))
    trading_plans = result.scalars().all()

    # For each trading plan, fetch the previous one for the same stock (within today only)
    enriched_plans = []
    for tp in trading_plans:
        # Query for the previous update of the same stock (within today's range)
        prev_query = select(TradingPlan).where(
            TradingPlan.name == tp.name,
            TradingPlan.datetime < tp.datetime,
            TradingPlan.datetime >= start_of_day  # Only get previous from today
        ).order_by(TradingPlan.datetime.desc()).limit(1)

        prev_result = await db.execute(prev_query)
        prev_tp = prev_result.scalar_one_or_none()

        plan_data = {
            "message_id": tp.message_id,
            "datetime": tp.datetime.isoformat(),
            "name": tp.name,
            "buy": tp.buy,
            "tp": tp.tp,
            "sl": tp.sl
        }

        if prev_tp:
            plan_data["previous"] = {
                "message_id": prev_tp.message_id,
                "datetime": prev_tp.datetime.isoformat(),
                "buy": prev_tp.buy,
                "tp": prev_tp.tp,
                "sl": prev_tp.sl
            }

        enriched_plans.append(plan_data)

    return {
        "trading_plans": enriched_plans,
        "skip": skip,
        "limit": limit,
        "count": len(trading_plans)
    }

@app.get("/channels")
async def channels():
    """Get list of available telegram channels."""
    return {"channels": await get_channels()}
