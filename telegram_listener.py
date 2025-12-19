import asyncio
import json
from telethon import TelegramClient, events
from dotenv import load_dotenv
import os
from database import async_session
from models import Message
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

# Queue for SSE
message_queue = asyncio.Queue()

async def save_message(msg):
    async with async_session() as session:
        # Check if exists
        result = await session.execute(select(Message).where(Message.id == msg.id))
        if result.scalar_one_or_none():
            return  # Already exists

        # Create message dict
        message_data = {
            'id': msg.id,
            'chat_id': msg.chat_id,
            'sender_id': msg.sender_id,
            'text': msg.text,
            'date': msg.date,
            'raw_text': msg.raw_text,
            'is_reply': msg.reply_to_msg_id,
            'forward': json.dumps(msg.forward.to_dict()) if msg.forward else None,
            'buttons': json.dumps([btn.to_dict() for btn in msg.buttons]) if msg.buttons else None,
            'file': json.dumps(msg.file.to_dict()) if msg.file else None,
            'photo': json.dumps(msg.photo.to_dict()) if msg.photo else None,
            'document': json.dumps(msg.document.to_dict()) if msg.document else None,
            'audio': json.dumps(msg.audio.to_dict()) if msg.audio else None,
            'voice': json.dumps(msg.voice.to_dict()) if msg.voice else None,
            'video': json.dumps(msg.video.to_dict()) if msg.video else None,
            'video_note': json.dumps(msg.video_note.to_dict()) if msg.video_note else None,
            'gif': json.dumps(msg.gif.to_dict()) if msg.gif else None,
            'sticker': json.dumps(msg.sticker.to_dict()) if msg.sticker else None,
            'contact': json.dumps(msg.contact.to_dict()) if msg.contact else None,
            'game': json.dumps(msg.game.to_dict()) if msg.game else None,
            'geo': json.dumps(msg.geo.to_dict()) if msg.geo else None,
            'invoice': json.dumps(msg.invoice.to_dict()) if msg.invoice else None,
            'poll': json.dumps(msg.poll.to_dict()) if msg.poll else None,
            'venue': json.dumps(msg.venue.to_dict()) if msg.venue else None,
            'action_entities': json.dumps([e.to_dict() for e in msg.action_entities]) if msg.action_entities else None,
            'via_bot': msg.via_bot_id,
            'via_input_bot': msg.via_input_bot.to_dict() if msg.via_input_bot else None,
        }

        db_message = Message(**message_data)
        session.add(db_message)
        await session.commit()

        # Put in queue for SSE
        await message_queue.put(message_data)

async def fetch_historical():
    channel = await client.get_entity(CHANNEL_ID)
    messages = await client.get_messages(channel, limit=100)  # Adjust limit
    if messages and isinstance(messages, list):
        for msg in reversed(messages):  # Oldest first
            await save_message(msg)

@client.on(events.NewMessage(chats=CHANNEL_ID))
async def new_message_handler(event):
    await save_message(event.message)

async def start_listener():
    await client.start()  # type: ignore
    await fetch_historical()
    await client.run_until_disconnected()  # type: ignore