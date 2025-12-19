from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, BigInteger
from database import Base
from datetime import datetime

class Message(Base):
    __tablename__ = "messages"

    id = Column(BigInteger, primary_key=True, index=True)
    chat_id = Column(BigInteger, index=True)
    sender_id = Column(BigInteger, nullable=True)
    text = Column(Text, nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    raw_text = Column(Text, nullable=True)
    is_reply = Column(Integer, nullable=True)  # reply_to_msg_id
    forward = Column(JSON, nullable=True)  # JSON for forward info
    buttons = Column(JSON, nullable=True)  # JSON for buttons
    file = Column(JSON, nullable=True)  # JSON for file info
    photo = Column(JSON, nullable=True)
    document = Column(JSON, nullable=True)
    audio = Column(JSON, nullable=True)
    voice = Column(JSON, nullable=True)
    video = Column(JSON, nullable=True)
    video_note = Column(JSON, nullable=True)
    gif = Column(JSON, nullable=True)
    sticker = Column(JSON, nullable=True)
    contact = Column(JSON, nullable=True)
    game = Column(JSON, nullable=True)
    geo = Column(JSON, nullable=True)
    invoice = Column(JSON, nullable=True)
    poll = Column(JSON, nullable=True)
    venue = Column(JSON, nullable=True)
    action_entities = Column(JSON, nullable=True)
    via_bot = Column(Integer, nullable=True)
    via_input_bot = Column(Integer, nullable=True)