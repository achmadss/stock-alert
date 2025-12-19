# Stock Alert

A simple service that monitors a Telegram channel and provides real-time alerts through a REST API.

## What It Is

This project listens to messages from a specific Telegram channel, saves them to a database, and makes them available through an API. It's useful for tracking announcements, alerts, or updates from Telegram channels in real-time.

## How It Works

1. The service connects to Telegram using the Telethon library
2. It monitors a specified channel for new messages
3. When a message arrives, it's saved to a PostgreSQL database
4. The message is also pushed to a real-time event stream
5. You can fetch messages either in real-time (as they arrive) or from the history

## Setup

### Requirements

- Python 3.14+
- PostgreSQL database
- Telegram API credentials (API_ID and API_HASH from https://my.telegram.org)

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create a `.env` file with your credentials:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost/dbname
API_ID=your_telegram_api_id
API_HASH=your_telegram_api_hash
CHANNEL_ID=your_channel_id
```

3. Run the service:
```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

## API Usage

The service provides two endpoints:

### GET /alert

Provides real-time message alerts using Server-Sent Events (SSE).

**How to use:**
```bash
curl -N http://localhost:8000/alert
```

This keeps the connection open and streams new messages as they arrive. Each message is sent as JSON data.

**Response format:**
```
data: {"id": 123, "text": "New alert message", "date": "2025-12-19T...", ...}
```

You can consume this in your application using EventSource in JavaScript:
```javascript
const eventSource = new EventSource('http://localhost:8000/alert');
eventSource.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('New alert:', message);
};
```

### GET /history

Retrieves past messages from the database.

**Parameters:**
- `skip` (optional): Number of messages to skip (default: 0)
- `limit` (optional): Maximum number of messages to return (default: 50)

**How to use:**
```bash
# Get the first 50 messages
curl http://localhost:8000/history

# Get the next 50 messages (skip first 50)
curl http://localhost:8000/history?skip=50&limit=50

# Get only 10 messages
curl http://localhost:8000/history?limit=10
```

**Response format:**
```json
{
  "messages": [
    {
      "id": 123,
      "chat_id": 456,
      "text": "Message content",
      "date": "2025-12-19T10:30:00",
      "sender_id": 789,
      "raw_text": "Message content",
      ...
    }
  ]
}
```

## Message Fields

Each message contains:
- `id`: Unique message ID
- `chat_id`: ID of the channel
- `sender_id`: ID of the message sender
- `text`: Message text content
- `date`: When the message was sent
- `raw_text`: Raw text without formatting
- `is_reply`: ID of the message this is replying to (if any)
- `forward`: Information about forwarded messages
- `buttons`: Any inline buttons in the message
- `file`, `photo`, `video`, etc.: Media attachments (stored as JSON)

## Running with Docker

If you have Docker installed:

```bash
docker-compose up
```

This will start both the application and PostgreSQL database.
