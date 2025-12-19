from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from database import get_db, engine
from models import Message, Base
from telegram_listener import message_queue
import json

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Start the listener in background
    import asyncio
    from telegram_listener import start_listener
    asyncio.create_task(start_listener())

@app.get("/alert")
async def alert():
    async def event_generator():
        while True:
            message = await message_queue.get()
            yield f"data: {json.dumps(message)}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/history")
async def history(skip: int = 0, limit: int = 50, db=Depends(get_db)):
    result = await db.execute(select(Message).offset(skip).limit(limit))
    messages = result.scalars().all()
    return {"messages": [msg.__dict__ for msg in messages]}