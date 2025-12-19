# Stock Alert System

A real-time stock trading alert system that monitors Telegram channels and provides a web dashboard for tracking trading signals.

## System Architecture

```
┌─────────────────┐
│ Telegram Channel│
└────────┬────────┘
         │ (Messages)
         ▼
┌─────────────────┐      ┌──────────────┐
│     Backend     │◄────►│  PostgreSQL  │
│  (FastAPI + SSE)│      │   Database   │
└────────┬────────┘      └──────────────┘
         │ (Server-Sent Events)
         ▼
┌─────────────────┐
│    Frontend     │
│ (HTML/CSS/JS +  │
│     Nginx)      │
└─────────────────┘
```

## Features

### Backend
- Telegram listener for real-time trading plan messages
- FastAPI server with Server-Sent Events (SSE)
- PostgreSQL database for historical data
- REST API for querying trading history
- Real-time broadcasting to multiple clients

### Frontend
- **Left Panel**: Live stream of all stock updates
- **Right Panel**: Favorited stocks with:
  - Latest 2 updates per stock
  - Trend indicators (↗/↘) showing buy value changes
  - Color-coded arrows (green for up, red for down)
- Persistent favorites using localStorage
- Beautiful gradient UI with smooth animations

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Telegram API credentials ([get them here](https://my.telegram.org))
- Telegram channel ID to monitor

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd stock-alert
```

2. Configure backend environment:
```bash
cd backend
cp .env.example .env
# Edit .env with your Telegram credentials
```

Required environment variables:
```env
API_ID=your_telegram_api_id
API_HASH=your_telegram_api_hash
CHANNEL_ID=your_channel_id
DATABASE_URL=postgresql+asyncpg://user:password@postgres/stock_alert
```

3. Start all services:
```bash
# From the project root
docker-compose up -d
```

This will start:
- PostgreSQL database on port `5432`
- Backend API on port `8000`
- Frontend on port `3000`

4. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Project Structure

```
stock-alert/
├── backend/
│   ├── app.py                 # FastAPI application
│   ├── models.py              # Database models
│   ├── database.py            # Database configuration
│   ├── telegram_listener.py   # Telegram client
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── public/
│   │   ├── index.html         # Main HTML
│   │   ├── styles.css         # Styling
│   │   └── app.js             # JavaScript logic
│   ├── Dockerfile
│   ├── nginx.conf
│   └── Caddyfile
├── docker-compose.yml         # Main orchestration
└── README.md
```

## API Endpoints

### Backend Endpoints

| Endpoint | Method | Type | Description |
|----------|--------|------|-------------|
| `/alert` | GET | SSE | Stream all trading alerts in real-time |
| `/alert/{stock_name}` | GET | SSE | Stream alerts for specific stock |
| `/history` | GET | REST | Get historical trading plans (with pagination) |
| `/channels` | GET | REST | List available Telegram channels |

### Example API Usage

**Stream all alerts:**
```javascript
const eventSource = new EventSource('http://localhost:8000/alert');
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('New alert:', data);
};
```

**Get historical data:**
```bash
curl http://localhost:8000/history?stock_name=MPIX&limit=10
```

## Data Format

Trading plans are structured as follows:

```json
{
  "datetime": "2025-12-19T14:30:00",
  "name": "MPIX",
  "buy": [100, 95, 90],
  "tp": [120, 130, 140],
  "sl": 85
}
```

## Development

### Running Backend Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

### Running Frontend Locally

**Option 1: Docker**
```bash
cd frontend
docker build -t stock-alert-frontend .
docker run -p 3000:3000 stock-alert-frontend
```

**Option 2: Caddy**
```bash
cd frontend
caddy run
```

### Database Management

Access PostgreSQL:
```bash
docker exec -it stock-alert-db psql -U user -d stock_alert
```

View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Docker Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Rebuild services after code changes
docker-compose up -d --build

# View running containers
docker-compose ps

# Remove all data (including database)
docker-compose down -v
```

## Troubleshooting

### Backend Issues

**Problem**: Backend can't connect to Telegram
- Check your `API_ID` and `API_HASH` in `.env`
- Ensure you've authorized the Telegram session
- First run requires interactive authentication (run locally first)

**Problem**: Database connection errors
- Ensure PostgreSQL container is healthy: `docker-compose ps`
- Check database credentials in `.env`

### Frontend Issues

**Problem**: No real-time updates
- Verify backend is running: `curl http://localhost:8000/alert`
- Check browser console for SSE connection errors
- Ensure CORS headers are configured correctly

**Problem**: Favorites not persisting
- Check browser's localStorage is enabled
- Try clearing browser cache and localStorage

## Security Notes

- The `.env` file contains sensitive credentials - never commit it to version control
- The `api.session` file stores Telegram session - keep it secure
- In production, use proper secrets management (Docker secrets, Kubernetes secrets, etc.)
- Consider using environment-specific `.env` files

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section
- Review API documentation at http://localhost:8000/docs
- Open an issue on GitHub
