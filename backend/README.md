# Stock Alert

A service that monitors a Telegram channel for trading plan messages and provides real-time alerts through a REST API.

## What It Is

This project listens to trading plan messages from a Telegram channel, parses the key information (stock name, buy prices, take profit, stop loss), saves it to a database, and makes it available through an API. Perfect for tracking stock trading signals in real-time.

## How It Works

1. The service connects to Telegram using the Telethon library
2. It monitors a specified channel for new trading plan messages
3. When a trading plan arrives, it parses the message to extract:
   - Date/Time
   - Stock Name (e.g., MPIX, OPMS)
   - Buy prices
   - Take Profit (TP) levels
   - Stop Loss (SL) level
4. Saves the parsed data to PostgreSQL database
5. Broadcasts to all connected clients via Server-Sent Events (SSE)
6. You can get alerts in real-time or fetch historical trading plans

## Trading Plan Format

The service expects Telegram messages in this format:
```
[19/12/2025 14:30:00]
Trading Plan MPIX [Sy]:

📝 Buy: 100, 95, 90
🟢 TP: 120, 130, 140
🔴 SL: 85
```

The parsed data will be:
```json
{
  "datetime": "2025-12-19T14:30:00",
  "name": "MPIX",
  "buy": [100, 95, 90],
  "tp": [120, 130, 140],
  "sl": 85
}
```

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

## API Endpoints

### GET /alert

Stream all trading plan alerts in real-time using Server-Sent Events (SSE).

**Usage:**
```bash
curl -N http://localhost:8000/alert
```

**JavaScript example:**
```javascript
const eventSource = new EventSource('http://localhost:8000/alert');
eventSource.onmessage = (event) => {
    const tradingPlan = JSON.parse(event.data);
    console.log('New trading plan:', tradingPlan);
};
```

**Response format:**
```
data: {"datetime": "2025-12-19T14:30:00", "name": "MPIX", "buy": [100, 95], "tp": [120, 130], "sl": 85}
```

### GET /alert/{stock_name}

Stream trading plan alerts for a specific stock (case-insensitive).

**Usage:**
```bash
# Get only MPIX alerts
curl -N http://localhost:8000/alert/MPIX

# Get only OPMS alerts (case doesn't matter)
curl -N http://localhost:8000/alert/opms
```

This keeps the connection open and only sends trading plans for the specified stock.

### GET /history

Retrieve historical trading plans from the database.

**Parameters:**
- `skip` (optional): Number of records to skip (default: 0)
- `limit` (optional): Maximum number of records to return (default: 50)
- `stock_name` (optional): Filter by stock name (case-insensitive)

**Usage:**
```bash
# Get the latest 50 trading plans
curl http://localhost:8000/history

# Get trading plans for MPIX only
curl http://localhost:8000/history?stock_name=MPIX

# Get OPMS trading plans with pagination
curl http://localhost:8000/history?stock_name=OPMS&skip=10&limit=20

# Pagination
curl http://localhost:8000/history?skip=50&limit=50
```

**Response format:**
```json
{
  "trading_plans": [
    {
      "datetime": "2025-12-19T14:30:00",
      "name": "MPIX",
      "buy": [100, 95, 90],
      "tp": [120, 130, 140],
      "sl": 85
    },
    {
      "datetime": "2025-12-19T10:15:00",
      "name": "OPMS",
      "buy": [200, 195],
      "tp": [220, 230],
      "sl": 180
    }
  ]
}
```

### GET /channels

Get a list of available Telegram channels the client has access to.

**Usage:**
```bash
curl http://localhost:8000/channels
```

**Response format:**
```json
{
  "channels": [
    {
      "id": -1001234567890,
      "name": "Trading Signals"
    }
  ]
}
```

## Database Schema

The `trading_plans` table stores:
- `id`: Auto-incrementing primary key
- `datetime`: When the trading plan was published
- `name`: Stock name (e.g., "MPIX", "OPMS")
- `buy`: JSON array of buy prices
- `tp`: JSON array of take profit levels
- `sl`: Stop loss level

## Features

- **Real-time streaming**: Get alerts instantly as they arrive via SSE
- **Stock filtering**: Subscribe to specific stocks only
- **Case-insensitive**: Search for "MPIX", "mpix", or "Mpix" - all work the same
- **Historical data**: Query past trading plans with pagination
- **Clean data**: Only stores essential trading information, not entire telegram messages
- **Multiple clients**: Supports multiple concurrent connections using pub/sub pattern
- **Auto-cleanup**: Removes trailing colons and whitespace from stock names

## Architecture

```
Telegram Channel
       ↓
telegram_listener.py (monitors and parses messages)
       ↓
PostgreSQL (stores trading plans)
       ↓
pub/sub broadcaster
       ↓
FastAPI endpoints (serves data via REST/SSE)
       ↓
Clients (web, mobile, etc.)
```

## Running with Docker

If you have Docker installed:

```bash
docker-compose up
```

This will start both the application and PostgreSQL database.
