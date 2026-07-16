<div align="center">

<img src="https://via.placeholder.com/1280x320/0f0f0f/ffffff?text=JCN" alt="JCN Banner" width="100%" />

# JCN — Project Management, for teams that outgrew spreadsheets but not budgets

**One workspace. Every tool your team actually uses.**

[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-blue.svg)](./LICENSE.md)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Contributors](https://img.shields.io/github/contributors/your-org/jcn)](https://github.com/your-org/jcn/graphs/contributors)
[![Stars](https://img.shields.io/github/stars/your-org/jcn?style=social)](https://github.com/your-org/jcn/stargazers)
[![Discord](https://img.shields.io/discord/000000000000000000?label=discord&logo=discord)](https://discord.gg/your-invite)

[Live Demo](https://demo.jcn.example.com) · [Documentation](https://docs.jcn.example.com) · [Report Bug](https://github.com/your-org/jcn/issues) · [Request Feature](https://github.com/your-org/jcn/issues)

</div>

---

## About

**JCN** is a management ecosystem for growing businesses — not a single app, but a suite of purpose-built modules that share a common workspace, identity, and permission layer. Projects. People. HR. All in one place.

**Target:** Teams of 10–200 people who are tired of paying enterprise prices for tools that treat them like an afterthought.

### Why existing tools fail small businesses

| Tool | The problem |
|---|---|
| Jira | Built for enterprise, feels like filing taxes |
| ClickUp | So many features it becomes paralysing |
| Notion | Great docs, weak structured project tracking |
| Linear | Beautiful but too opinionated, no people management |
| Asana / Monday | Dated UX, expensive seats, weak developer experience |
| BambooHR / Workday | HR tools that assume you have a full HR department to run them |

**JCN wins by:** one workspace, every tool your team actually uses, fast, beautiful, and priced for real businesses.

## Screenshots

<div align="center">
<img src="https://via.placeholder.com/800x450?text=Dashboard+Screenshot" width="45%" />
<img src="https://via.placeholder.com/800x450?text=Workspace+Screenshot" width="45%" />
</div>

## Features

- 🗂️ **Unified workspaces** — one identity and permission layer across every module
- ✅ **Project & task tracking** without the enterprise bloat
- 👥 **People / HR management** built for teams without a dedicated HR department
- 🔐 **Google OAuth** + email/password auth out of the box
- ⚡ **Real-time updates** via WebSockets (Daphne/ASGI)
- 📧 **Transactional email** for invites and password resets
- 🐳 **One-command local setup** with Docker Compose

## Tech Stack

**Backend:** Django, Django REST Framework, Celery, Channels (ASGI/Daphne), Gunicorn
**Frontend:** React (Vite)
**Data layer:** PostgreSQL, Redis, RabbitMQ
**Infra:** Docker, Docker Compose, Nginx

## Architecture

```
                     ┌────────────┐
        HTTP/WS ───▶ │   Nginx    │
                     └─────┬──────┘
                ┌──────────┴──────────┐
                ▼                     ▼
        ┌───────────────┐    ┌────────────────┐
        │ Gunicorn (REST)│    │ Daphne (WS)    │
        │  backend       │    │ backend-ws     │
        └───────┬────────┘    └───────┬────────┘
                │                     │
                └──────────┬──────────┘
                            ▼
        ┌─────────┐   ┌─────────┐   ┌───────────┐
        │ Postgres│   │  Redis  │   │ RabbitMQ  │
        └─────────┘   └─────────┘   └─────┬─────┘
                                           ▼
                                  ┌────────────────┐
                                  │ Celery worker  │
                                  │ Celery beat    │
                                  └────────────────┘
```

REST traffic and WebSocket traffic are served by separate processes on purpose — a slow WebSocket connection never blocks a REST worker thread, and vice versa. See `nginx.conf` for routing and inline comments in `docker-compose.yml` for worker sizing rationale.

## Quick Start

### Option A: Docker (recommended)

```bash
git clone https://github.com/your-org/jcn.git
cd jcn
docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/api/docs/ |
| Django Admin | http://localhost:8000/admin/ |
| RabbitMQ Management | http://localhost:15672 (guest/guest) |

> **Note:** `docker-compose.yml` uses dev-appropriate sizing (2 Gunicorn workers × 2 threads) tuned for an 8GB machine running the full stack side by side. Recompute worker counts against actual vCPU count before deploying to production — see inline comments in the compose file.

### Option B: Local dev (no Docker)

**Backend**

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

You'll also need Postgres, Redis, and RabbitMQ running locally (or point `DATABASE_URL` / `REDIS_URL` / `CELERY_BROKER_URL` at hosted instances).

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in the values below.

### Required (core)

```env
SECRET_KEY=your-django-secret-key
DEBUG=True
DATABASE_URL=postgres://user:password@localhost:5432/jcn
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=amqp://guest:guest@localhost:5672//
```

### Google OAuth

Sign in with Google on the login and register pages.

1. Go to [Google Cloud Console](https://console.cloud.google.com) → New Project → `JCN`
2. APIs & Services → Library → enable **Google Identity Toolkit API** and **People API**
3. APIs & Services → OAuth consent screen → External → fill in app name + email
4. APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application)
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173`
5. Copy the Client ID and Secret into your `.env`

```env
GOOGLE_CLIENT_ID=xxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxx
```

Frontend (`frontend/.env`):

```env
VITE_GOOGLE_CLIENT_ID=xxxxxxx.apps.googleusercontent.com
```

### Email (invite emails, password reset)

Uses [Resend](https://resend.com). Free tier: 3,000 emails/month.

1. Sign up at resend.com → API Keys → Create API Key
2. For local dev, use `onboarding@resend.dev` as `FROM_EMAIL` — no domain verification needed
3. For production, add and verify your own domain in the Resend dashboard, then update `FROM_EMAIL`

```env
RESEND_API_KEY=re_xxxxxxx
FROM_EMAIL=test@resend.dev
FRONTEND_URL=http://localhost:5173
```

## First Run

1. Go to http://localhost:5173/register
2. Create an account
3. You'll be prompted to create your first workspace
4. Invite teammates via the Members section

## API Reference

Full interactive docs: `http://localhost:8000/api/docs/` (Swagger) and `http://localhost:8000/api/schema/` (raw OpenAPI schema).

| Method | URL | Description |
|---|---|---|
| POST | `/api/auth/registration/` | Register with email + password |
| POST | `/api/auth/login/` | Login (returns JWT) |
| POST | `/api/auth/logout/` | Logout |
| POST | `/api/auth/google/` | Login or register with Google (returns JWT) |
| GET/PATCH | `/api/users/me/` | Current user profile |
| GET/POST | `/api/workspaces/` | List / create workspaces |
| GET/PATCH/DELETE | `/api/workspaces/:slug/` | Workspace detail |
| GET | `/api/workspaces/:slug/members/` | List members |
| POST | `/api/workspaces/:slug/invites/` | Invite by email (sends invite email) |
| GET | `/api/workspaces/:slug/invites/pending/` | List pending invites |
| DELETE | `/api/workspaces/:slug/invites/:token/` | Cancel invite |
| GET | `/api/invites/:token/` | Public invite detail (workspace + inviter info) |
| POST | `/api/invites/:token/accept/` | Accept invite |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full plan. Highlights:

- [ ] HR module (leave management, org chart)
- [ ] Time tracking
- [ ] Mobile app
- [ ] Self-hosted plugin marketplace

## Contributing

Contributions are what make the open source community amazing. Any contributions you make are **greatly appreciated**.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for coding standards, dev setup, and PR guidelines. Check issues tagged [`good first issue`](https://github.com/your-org/jcn/labels/good%20first%20issue) to get started.

## Security

Found a vulnerability? Please **do not** open a public issue — see [SECURITY.md](./SECURITY.md) for how to report it responsibly.

## License

Distributed under the Business Source License 1.1. See [LICENSE.md](./LICENSE.md) for full terms — converts to Apache 2.0 on the change date specified within.

## Community

- [LinkedIn](https://www.linkedin.com/in/bilalahmad072/)
- [Discussions](https://github.com/your-org/jcn/discussions)

---

<div align="center">
Built with ❤️
</div>