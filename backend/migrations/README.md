# Database Migrations

This folder contains Alembic migrations for the stock-alert backend.

## Auto-Migration on Startup

Migrations run automatically when the backend starts. No manual intervention needed.

## Creating New Migrations

When you modify models in `models.py`, create a new migration:

```bash
# Navigate to backend directory
cd backend

# Auto-generate migration from model changes
alembic revision --autogenerate -m "description of changes"

# Or create empty migration
alembic revision -m "description of changes"
```

## Manual Migration Commands

```bash
# Upgrade to latest
alembic upgrade head

# Downgrade one version
alembic downgrade -1

# Show current version
alembic current

# Show migration history
alembic history
```

## Migration Files

Migrations are stored in `migrations/versions/` with format:
```
YYYYMMDD_HHMM_<revision>_<description>.py
```

Example: `20251219_add_message_id.py`

## Current Migrations

- **001** (20251219_add_message_id.py) - Added `message_id` column to prevent duplicates
