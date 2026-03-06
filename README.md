# Infra Manager

A full-stack infrastructure asset management application for tracking projects, servers, databases, and components — with role-based access control, encrypted credential storage, uptime monitoring, and a complete audit trail.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy, PostgreSQL, Alembic |
| Auth | JWT (PyJWT), bcrypt, RBAC |
| Encryption | Fernet (cryptography library) |
| Scheduling | APScheduler (uptime monitoring) |
| Frontend | React 19, TypeScript, Vite, TailwindCSS v4 |
| Serving | Nginx (production), Uvicorn (backend) |
| Containers | Docker + Docker Compose |

## Getting Started

### Prerequisites
- Docker & Docker Compose, **or** Python 3.11+ and Node.js 20+
- A running PostgreSQL instance (if running locally without Docker)

### 1. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL and ENCRYPTION_KEY

# Generate a Fernet encryption key
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Frontend (only needed for local dev)
cp frontend/.env.example frontend/.env
# VITE_API_URL=http://localhost:8000
```

### 2. Run with Docker (recommended)

```bash
docker-compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:8888
- API docs: http://localhost:8888/docs

### 3. Run locally

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
python seed_admin.py   # creates initial admin user
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## Features

- **Projects** — Group servers, databases, and components under a project; track primary domain and uptime status
- **Servers** — Store VM/host details with encrypted SSH credentials
- **Databases** — Track database connections with encrypted passwords
- **Components** — Flexible entries for any infrastructure piece with arbitrary encrypted key-value config fields
- **Uptime Monitoring** — Background scheduler periodically checks servers (TCP) and projects (HTTP) and updates online status
- **Access Control** — Users belong to Groups; Groups are granted access to Projects; three roles: Viewer, Editor, Admin; Superuser flag for full access
- **Audit Logs** — Every create/update/delete is logged with user, action, resource type, and timestamp; visible to superusers only
- **Settings** — Key-value application configuration store

## Project Structure

```
Infra-Manager/
├── backend/
│   ├── app/
│   │   ├── main.py          # App factory, router registration, scheduler startup
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── auth.py          # JWT utilities
│   │   ├── dependencies.py  # FastAPI dependencies, RBAC helpers
│   │   ├── encryption.py    # EncryptedString / EncryptedJSON type decorators
│   │   ├── monitor.py       # Uptime check scheduler
│   │   ├── audit.py         # Audit log helpers
│   │   └── routers/         # One file per resource
│   └── alembic/             # Database migration scripts
├── frontend/
│   └── src/
│       ├── App.tsx           # Route definitions
│       ├── pages/            # Full-page components
│       ├── components/       # Layout, Navbar, Sidebar, ProtectedRoute
│       ├── contexts/         # AuthContext (JWT state)
│       └── utils/api.ts      # Axios client with auth interceptor
└── docker-compose.yml
```

## Database Migrations

```bash
cd backend
alembic upgrade head                               # Apply all pending migrations
alembic revision --autogenerate -m "description"  # Generate migration from model changes
```

> Always update `requirements.txt` before installing new packages (`pip freeze > requirements.txt`).
