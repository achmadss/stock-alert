# Production Deployment Guide

## Cloudflare Tunnel Setup

This guide walks you through deploying the Stock Alert System to your server using Cloudflare Tunnel.

### Prerequisites

- A server with Docker and Docker Compose installed
- A Cloudflare account with a domain (achmad.dev)
- Cloudflare Tunnel (cloudflared) installed on your server

### Subdomain Configuration

You'll need **2 subdomains** for this deployment:

1. **stock.achmad.dev** → Frontend (Nginx on port 3000)
2. **stock-api.achmad.dev** → Backend API (FastAPI on port 8000)

---

## Step 1: Server Setup

### Clone the repository on your server

```bash
git clone <your-repo-url>
cd stock-alert
```

### Configure environment variables

```bash
cd backend
cp .env.example .env
nano .env  # or use your preferred editor
```

Add your Telegram credentials:
```env
API_ID=your_telegram_api_id
API_HASH=your_telegram_api_hash
CHANNEL_ID=your_channel_id
DATABASE_URL=postgresql+asyncpg://user:password@postgres/stock_alert
```

---

## Step 2: Start Docker Containers

From the project root:

```bash
docker-compose up -d
```

Verify all services are running:
```bash
docker-compose ps
```

You should see:
- `stock-alert-db` (PostgreSQL)
- `stock-alert-backend` (FastAPI)
- `stock-alert-frontend` (Nginx)

---

## Step 3: Cloudflare Tunnel Configuration

### Install cloudflared (if not already installed)

```bash
# Download and install
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

### Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This will open a browser to authenticate with your Cloudflare account.

### Create a tunnel

```bash
cloudflared tunnel create stock-alert
```

Note the **Tunnel ID** from the output.

### Configure the tunnel

Create a configuration file:

```bash
sudo nano ~/.cloudflared/config.yml
```

Add the following configuration:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /root/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  # Frontend - stock.achmad.dev
  - hostname: stock.achmad.dev
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true

  # Backend API - stock-api.achmad.dev
  - hostname: stock-api.achmad.dev
    service: http://localhost:8000
    originRequest:
      noTLSVerify: true

  # Catch-all rule (required)
  - service: http_status:404
```

### Add DNS records

For each subdomain, add a CNAME record in Cloudflare DNS:

```bash
cloudflared tunnel route dns stock-alert stock.achmad.dev
cloudflared tunnel route dns stock-alert stock-api.achmad.dev
```

Or manually add in Cloudflare Dashboard:
- Type: `CNAME`
- Name: `stock` (for stock.achmad.dev)
- Target: `<TUNNEL_ID>.cfargotunnel.com`
- Proxy status: Proxied (orange cloud)

Repeat for `stock-api`:
- Type: `CNAME`
- Name: `stock-api`
- Target: `<TUNNEL_ID>.cfargotunnel.com`
- Proxy status: Proxied (orange cloud)

### Start the tunnel

```bash
cloudflared tunnel run stock-alert
```

### Run tunnel as a service (recommended)

Install as a system service:

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Check status:
```bash
sudo systemctl status cloudflared
```

---

## Step 4: Verify Deployment

### Test the frontend

Open your browser and navigate to:
```
https://stock.achmad.dev
```

You should see the Stock Alert dashboard.

### Test the backend API

```bash
curl https://stock-api.achmad.dev/channels
```

Or visit in browser:
```
https://stock-api.achmad.dev/docs
```

You should see the FastAPI Swagger documentation.

### Test real-time updates

In the frontend (https://stock.achmad.dev):
1. Check the connection status indicator - should show "Connected"
2. Add a favorite stock symbol
3. Wait for updates to appear

---

## Configuration Changes Made

### Frontend (`frontend/public/app.js`)

The API URL automatically switches based on environment:

```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://stock-api.achmad.dev';
```

- **Local development**: Uses `http://localhost:8000`
- **Production**: Uses `https://stock-api.achmad.dev`

### Backend (`backend/app.py`)

CORS is configured to allow requests from both local and production frontends:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",        # Local development
        "https://stock.achmad.dev",     # Production frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Troubleshooting

### Issue: "Connection Disconnected" in frontend

**Check:**
1. Backend is running: `docker-compose ps`
2. Cloudflare tunnel is running: `sudo systemctl status cloudflared`
3. DNS records are properly configured
4. CORS settings include your domain

**Debug:**
```bash
# Check backend logs
docker-compose logs -f backend

# Check tunnel logs
sudo journalctl -u cloudflared -f
```

### Issue: CORS errors in browser console

**Solution:**
Ensure your frontend domain is added to the CORS `allow_origins` list in [backend/app.py](backend/app.py:16)

### Issue: 502 Bad Gateway

**Check:**
1. Docker containers are running: `docker-compose ps`
2. Backend is listening on port 8000: `curl http://localhost:8000/channels`
3. Cloudflare tunnel configuration points to correct ports

### Issue: Database connection errors

**Check:**
```bash
# Access database
docker exec -it stock-alert-db psql -U user -d stock_alert

# Check backend environment
docker-compose logs backend | grep DATABASE
```

---

## SSL/TLS

Cloudflare automatically provides SSL/TLS certificates for your subdomains. No additional configuration needed!

Your site will be accessible via HTTPS:
- https://stock.achmad.dev
- https://stock-api.achmad.dev

---

## Updating the Application

### Pull latest changes

```bash
cd stock-alert
git pull
```

### Rebuild and restart

```bash
docker-compose down
docker-compose up -d --build
```

### Check logs

```bash
docker-compose logs -f
```

---

## Security Recommendations

1. **Environment Variables**: Never commit `.env` files to git
2. **Database**: Change default PostgreSQL credentials in production
3. **Firewall**: Only allow traffic from Cloudflare IPs (optional but recommended)
4. **Cloudflare Settings**:
   - Enable "Always Use HTTPS"
   - Enable "Automatic HTTPS Rewrites"
   - Set SSL/TLS encryption mode to "Full (strict)"

---

## Monitoring

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Cloudflare tunnel
sudo journalctl -u cloudflared -f
```

### Check resource usage

```bash
docker stats
```

### Database queries

```bash
docker exec -it stock-alert-db psql -U user -d stock_alert -c "SELECT COUNT(*) FROM trading_plans;"
```

---

## Backup

### Backup database

```bash
docker exec -t stock-alert-db pg_dump -U user stock_alert > backup_$(date +%Y%m%d).sql
```

### Restore database

```bash
docker exec -i stock-alert-db psql -U user stock_alert < backup_20251219.sql
```

---

## Summary

**URLs:**
- Frontend: https://stock.achmad.dev
- Backend API: https://stock-api.achmad.dev
- API Docs: https://stock-api.achmad.dev/docs

**Ports (on server):**
- Frontend: 3000
- Backend: 8000
- PostgreSQL: 5432

**Services:**
- Docker Compose: Manages all containers
- Cloudflare Tunnel: Exposes services to the internet
- Nginx: Serves frontend static files
- FastAPI: Backend API
- PostgreSQL: Database

Everything is configured and ready to go! 🚀
