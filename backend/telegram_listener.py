import asyncio
from telethon import TelegramClient
from dotenv import load_dotenv
import os
from datetime import datetime
from database import async_session
from models import TradingPlan
from sqlalchemy import select

load_dotenv()

API_ID_STR = os.getenv('API_ID')
if API_ID_STR is None:
    raise ValueError("API_ID environment variable is not set")
API_ID = int(API_ID_STR)

API_HASH = os.getenv('API_HASH')
if API_HASH is None:
    raise ValueError("API_HASH environment variable is not set")

CHANNEL_ID_STR = os.getenv('CHANNEL_ID')
if CHANNEL_ID_STR is None:
    raise ValueError("CHANNEL_ID environment variable is not set")
CHANNEL_ID = int(CHANNEL_ID_STR)

client = TelegramClient('api', API_ID, API_HASH)

subscribers = []

def add_subscriber():
    """Create and register a new subscriber queue."""
    queue = asyncio.Queue()
    subscribers.append(queue)
    return queue

def remove_subscriber(queue):
    """Remove a subscriber queue."""
    if queue in subscribers:
        subscribers.remove(queue)

async def broadcast_trading_plan(parsed):
    """Broadcast trading plan to all subscribers."""
    for queue in subscribers:
        await queue.put(parsed)

def parse_trading_plan(text, message_id):
    """Parse trading plan message and extract relevant data."""
    lines = text.split('\n')
    if len(lines) < 5:
        return None

    date_str = lines[0].strip('[]')
    dt = datetime.strptime(date_str, '%d/%m/%Y %H:%M:%S')

    name_line = lines[1]
    if 'Trading Plan' not in name_line:
        return None
    name = name_line.split('Trading Plan ')[1].split(' [Sy]:')[0].rstrip(':').strip()

    buy_line = next((l for l in lines if l.startswith('📝 Buy:')), None)
    if not buy_line:
        return None
    buy = [int(x.strip()) for x in buy_line.split(':')[1].split(',')]

    tp_line = next((l for l in lines if l.startswith('🟢 TP:')), None)
    if not tp_line:
        return None
    tp = [int(x.strip()) for x in tp_line.split(':')[1].split(',')]

    sl_line = next((l for l in lines if l.startswith('🔴 SL:')), None)
    if not sl_line:
        return None
    sl = int(sl_line.split(':')[1].strip())

    return {
        'message_id': message_id,
        'datetime': dt,
        'name': name,
        'buy': buy,
        'tp': tp,
        'sl': sl
    }

async def save_message(msg):
    """Parse and save trading plan from telegram message."""
    if not msg.text or 'Trading Plan' not in msg.text:
        return

    parsed = parse_trading_plan(msg.text, msg.id)
    if not parsed:
        return

    async with async_session() as session:
        # Check if message_id already exists (primary duplicate check)
        result = await session.execute(
            select(TradingPlan).where(
                TradingPlan.message_id == parsed['message_id']
            )
        )
        if result.scalar_one_or_none():
            print(f"Duplicate message_id {parsed['message_id']} - skipping")
            return

        trading_plan = TradingPlan(**parsed)
        session.add(trading_plan)
        await session.commit()

        await broadcast_trading_plan(parsed)

async def fetch_historical():
    """Fetch historical messages from the channel."""
    try:
        print("=== FETCH HISTORY ===")
        channel = await client.get_entity(CHANNEL_ID)
        messages = await client.get_messages(channel, limit=100)

        if messages and isinstance(messages, list):
            for msg in reversed(messages):
                await save_message(msg)
    except Exception as e:
        print(f"Error fetching historical messages: {e}")
        print(f"CHANNEL_ID value: {CHANNEL_ID}")
        print("Make sure CHANNEL_ID is either:")
        print("  1. A channel username (e.g., @channelname)")
        print("  2. A valid channel ID (negative number for channels, e.g., -100123456789)")
        print("Note: You need to be a member of the channel to fetch messages.")

async def new_message_handler(event):
    """Handle new messages from the channel."""
    await save_message(event.message)

async def get_channels():
    """Get list of available channels."""
    dialogs = await client.get_dialogs()
    channels = []
    for dialog in dialogs:
        if dialog.is_channel:
            channels.append({
                "id": dialog.entity.id,
                "name": dialog.entity.title
            })
    return channels

async def start_listener():
    """Start the telegram listener."""
    print("Starting Telegram listener...")
    await client.start()
    print("Telegram client started successfully")
    await fetch_historical()
    print("Fetch historical completed, now listening for new messages...")
    await client.run_until_disconnected()
