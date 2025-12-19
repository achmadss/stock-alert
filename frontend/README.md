# Stock Alert Frontend

A real-time stock trading alerts dashboard built with pure HTML, CSS, and JavaScript.

## Features

- **Left Panel**: Displays all stock updates in real-time from the `/alert` endpoint
- **Right Panel**: Shows favorited stocks with:
  - Latest 2 updates per stock
  - Trend indicators (↗ green for price increase, ↘ red for price decrease)
  - Comparison of buy values between consecutive updates
- **Real-time Updates**: Uses Server-Sent Events (SSE) for live data streaming
- **Persistent Favorites**: Saves favorite stocks to localStorage
- **Responsive Design**: Clean, modern UI with gradient backgrounds

## Prerequisites

- Docker and Docker Compose (for containerized setup)
- OR Nginx/Caddy web server (for local development)
- Backend API running on `http://localhost:8000`

## Running the Application

### Option 1: Using Docker (Recommended)

From the **project root directory**, run:
```bash
docker-compose up
```

This will start both the backend and frontend. The frontend will be available at `http://localhost:3000`

### Option 2: Using Nginx locally

1. Build the Docker image:
```bash
docker build -t stock-alert-frontend .
docker run -p 3000:3000 stock-alert-frontend
```

### Option 3: Using Caddy locally

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Start Caddy:
```bash
caddy run
```

The frontend will be available at `http://localhost:3000`

## Usage

### Adding Favorites

1. Type a stock symbol (e.g., "MPIX") in the input field in the right panel
2. Click "Add Favorite" or press Enter
3. The stock will be added to your favorites and start receiving real-time updates

### Removing Favorites

Click the "Remove" button on any favorite stock section to stop tracking it.

### Understanding Trend Indicators

- **↗** (Green): The primary buy value has increased compared to the previous update
- **↘** (Red): The primary buy value has decreased compared to the previous update
- No indicator: First update or no change in buy value

## API Endpoints Used

- `GET /alert` - Server-Sent Events stream for all stock updates
- `GET /alert/{stock_name}` - Server-Sent Events stream for specific stock

## Project Structure

```
frontend/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # Styling with gradients and animations
│   └── app.js          # JavaScript logic for SSE and state management
├── Dockerfile         # Docker container definition
├── nginx.conf         # Nginx web server configuration
├── Caddyfile          # Caddy web server configuration (alternative)
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## Configuration

To change the backend API URL, edit the `API_BASE_URL` constant in [app.js](public/app.js:2):

```javascript
const API_BASE_URL = 'http://localhost:8000';
```

## Browser Compatibility

This application uses modern web APIs:
- EventSource (Server-Sent Events)
- LocalStorage
- ES6+ JavaScript

Supported browsers:
- Chrome/Edge 79+
- Firefox 65+
- Safari 13+

## Troubleshooting

### Connection Issues

If the connection status shows "Disconnected":
1. Ensure the backend is running on `http://localhost:8000`
2. Check browser console for CORS errors
3. The frontend will automatically attempt to reconnect every 5 seconds

### No Updates Showing

1. Verify the backend is receiving Telegram messages
2. Check that the `/alert` endpoint is accessible
3. Look for JavaScript errors in browser console

## Development

The application uses:
- **No build step**: Pure HTML/CSS/JS for simplicity
- **Nginx/Caddy**: Lightweight web servers for serving static files
- **Docker**: Containerized deployment for consistency
- **localStorage**: For persisting favorite stocks across sessions

## License

MIT
