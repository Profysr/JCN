<div align="center">

<img src="imgs/JCN.png" alt="JCN Banner" width="100%" />

# JCN — Project Management, for teams that outgrew spreadsheets but not budgets

**One workspace. Every tool your team actually uses.**

[![License: Elastic License 2.0](https://img.shields.io/badge/license-Elastic%202.0-blue.svg)](./LICENSE.md)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Contributors](https://img.shields.io/github/contributors/Profysr/JCN)](https://github.com/Profysr/JCN/graphs/contributors)
[![Stars](https://img.shields.io/github/stars/Profysr/JCN?style=social)](https://github.com/Profysr/JCN/stargazers)

<!-- [![Discord](https://img.shields.io/discord/000000000000000000?label=discord&logo=discord)](https://discord.gg/your-invite) -->

<!-- [Live Demo](https://demo.jcn.example.com) · [Documentation](https://docs.jcn.example.com) ·  -->

[Report Bug](https://github.com/Profysr/JCN/issues) · [Request Feature](https://github.com/Profysr/JCN/issues) · [Contribute](./CONTRIBUTING.md)

[![Share on LinkedIn](https://img.shields.io/badge/Share-LinkedIn-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/sharing/share-offsite/?url=https://github.com/Profysr/JCN)
[![Share on X](https://img.shields.io/badge/Share-X-000000?logo=x&logoColor=white)](https://twitter.com/intent/tweet?text=Check%20out%20JCN%20%E2%80%94%20an%20open-source%20workspace%20that%20combines%20Project%20Management%20and%20HR%20in%20one%20place%3A&url=https://github.com/Profysr/JCN)

</div>

---

## About

**JCN** is a management ecosystem for growing startups. It's not a single app, but a suite of purpose-built modules that share a common workspace, identity, and permission layer. Projects. People. HR. All in one place.

**Target:** Teams of 10–200 people who are tired of paying enterprise prices for tools that treat them like an afterthought.

### Why existing tools fail small businesses

| Tool               | The problem                                                    |
| ------------------ | -------------------------------------------------------------- |
| Jira               | Built for enterprise, feels like filing taxes                  |
| ClickUp            | So many features it becomes paralysing                         |
| Notion             | Great docs, weak structured project tracking                   |
| Linear             | Beautiful but too opinionated, no people management            |
| Asana / Monday     | Dated UX, expensive seats, weak developer experience           |
| BambooHR / Workday | HR tools that assume you have a full HR department to run them |

**JCN wins by:** one workspace, every tool your team actually uses, fast, beautiful, and priced for real businesses.

### Why this matters

Every growing team hits the same wall: Slack for chat, Jira or Asana for tasks, BambooHR for leave requests, a spreadsheet for the org chart, and a separate tool for attendance — five logins, five sources of truth, and nobody actually knows where the real status of anything lives.

JCN exists to collapse that into one place. Not by cramming every feature into one bloated app, but by sharing one identity layer, one permission model, and one workspace across purpose-built modules — so your PM tool actually knows who reports to whom, and your HR tool actually knows what people are working on.

**Use it effectively by:**

- Starting with **one module** (Projects or HR) rather than migrating everything on day one — get your team comfortable, then expand
- Using **workspaces** to cleanly separate departments or client accounts if you manage more than one team
- Connecting **integrations/webhooks** (Teams, Google Chat) early so task updates reach people where they already work, instead of relying on people to check JCN directly
- Generating an **API key** if you want to pull JCN data into your own dashboards or automate task creation from your CI/CD pipeline

## Screenshots

<div align="center">

<img src="imgs/pm-dashboard.jpeg" alt="Project dashboard" width="90%" />
<p><em>Home dashboard — overdue tasks, assigned work, and boards at a glance</em></p>

<br/>

<img src="imgs/launcher-page.png" alt="App launcher" width="90%" />
<p><em>One workspace, every module — switch between Project Management and People & HR instantly</em></p>

<br/>

<table>
<tr>
<td width="50%">
<img src="imgs/kanban-page.png" alt="Kanban board" width="100%" />
<p align="center"><em>Kanban boards for task tracking</em></p>
</td>
<td width="50%">
<img src="imgs/hr-dashboard.png" alt="HR dashboard" width="100%" />
<p align="center"><em>People & HR — departments, teams, leave, attendance</em></p>
</td>
</tr>
</table>

<img src="imgs/analytics-2.png" alt="Analytics dashboard" width="90%" />
<p><em>Built-in analytics — status distribution, priority breakdown, and team workload</em></p>

</div>

## Features

- 🗂️ **Unified workspaces** — one identity and permission layer across every module
- ✅ **Project & task tracking** without the enterprise bloat
- 👥 **People / HR management** built for teams without a dedicated HR department
- 📊 **Built-in analytics** — status, priority, and workload breakdowns out of the box
- 🔐 **Google OAuth** + email/password auth out of the box
- ⚡ **Real-time updates** via WebSockets (Daphne/ASGI)
- 📧 **Transactional email** for invites and password resets
- 🔌 **Integrations & Webhooks** — Microsoft Teams, Google Chat, and custom webhooks
- 🔑 **API Keys** for programmatic access to your workspace
- 🐳 **One-command local setup** with Docker Compose

## Tech Stack

**Backend:** Django, Django REST Framework, Celery, Channels (ASGI/Daphne), Gunicorn, Websockets, Django Channels
**Frontend:** React + Vite, TailwindCSS + shadcn/ui, TanStack Query v5, Zustand, Axios with JWT auto-refresh
**Data layer:** PostgreSQL, Redis, RabbitMQ
**Infra:** Docker, Docker Compose, Nginx

## Architecture

<div align="center">
<img src="imgs/architecture-diagram.svg" alt="JCN architecture diagram" width="90%" />
</div>

REST traffic and WebSocket traffic are served by separate processes on purpose — a slow WebSocket connection never blocks a REST worker thread, and vice versa. See `nginx.conf` for routing and inline comments in `docker-compose.yml` for worker sizing rationale.

## Quick Start

### Option A: Docker (recommended)

```bash
git clone https://github.com/Profysr/JCN.git
cd jcn
docker-compose up --build
```

| Service             | URL                                  |
| ------------------- | ------------------------------------ |
| Frontend            | http://localhost:5173                |
| Backend API         | http://localhost:8000                |
| API Docs (Swagger)  | http://localhost:8000/api/docs/      |
| Django Admin        | http://localhost:8000/admin/         |
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

| Method           | URL                                      | Description                                     |
| ---------------- | ---------------------------------------- | ----------------------------------------------- |
| POST             | `/api/auth/registration/`                | Register with email + password                  |
| POST             | `/api/auth/login/`                       | Login (returns JWT)                             |
| POST             | `/api/auth/logout/`                      | Logout                                          |
| POST             | `/api/auth/google/`                      | Login or register with Google (returns JWT)     |
| GET/PATCH        | `/api/users/me/`                         | Current user profile                            |
| GET/POST         | `/api/workspaces/`                       | List / create workspaces                        |
| GET/PATCH/DELETE | `/api/workspaces/:slug/`                 | Workspace detail                                |
| GET              | `/api/workspaces/:slug/members/`         | List members                                    |
| POST             | `/api/workspaces/:slug/invites/`         | Invite by email (sends invite email)            |
| GET              | `/api/workspaces/:slug/invites/pending/` | List pending invites                            |
| DELETE           | `/api/workspaces/:slug/invites/:token/`  | Cancel invite                                   |
| GET              | `/api/invites/:token/`                   | Public invite detail (workspace + inviter info) |
| POST             | `/api/invites/:token/accept/`            | Accept invite                                   |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full plan. Highlights:

- [ ] HR module (leave management, org chart)
- [ ] Time tracking
- [ ] Mobile app
- [ ] Self-hosted plugin marketplace

## Contributing

Contributions are what make the open source community amazing. Any contributions you make are **greatly appreciated**.

### Get the code

**Option 1 — Fork & clone (for contributing changes back):**

1. Click **Fork** at the top right of [github.com/Profysr/JCN](https://github.com/Profysr/JCN) to create your own copy
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/JCN.git
   cd JCN
   ```
3. Add the original repo as `upstream` so you can pull future updates:
   ```bash
   git remote add upstream https://github.com/Profysr/JCN.git
   ```
4. Create a branch, make your changes, and open a Pull Request — see [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

**Option 2 — Clone directly (for local use, no intent to contribute back):**

```bash
git clone https://github.com/Profysr/JCN.git
cd JCN
```

Then jump to [Quick Start](#quick-start) above to get it running.

### Making changes

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for coding standards, dev setup, and PR guidelines. Check issues tagged [`good first issue`](https://github.com/Profysr/JCN/labels/good%20first%20issue) to get started.

## Security

Found a vulnerability? Please **do not** open a public issue — see [SECURITY.md](./SECURITY.md) for how to report it responsibly.

## License

Distributed under the [Elastic License 2.0](https://www.elastic.co/licensing/elastic-license). Copyright (C) 2026 AZSsolutions. See [LICENSE.md](./LICENSE.md) for full terms. In short: you're free to use, copy, modify, and self-host JCN — you just can't offer it as a competing hosted/managed service to third parties.

## Community & Social Links

- [LinkedIn](https://www.linkedin.com/in/bilalahmad072/)
- [Discussions](https://github.com/Profysr/JCN/discussions)

## Spread the Word

If JCN is useful to you, the single highest-impact thing you can do besides contributing code is **let other people know it exists**:

<div align="center">

[![Star on GitHub](https://img.shields.io/badge/⭐_Star_this_repo-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Profysr/JCN/stargazers)
[![Share on LinkedIn](https://img.shields.io/badge/Share_on_LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/sharing/share-offsite/?url=https://github.com/Profysr/JCN)
[![Share on X](https://img.shields.io/badge/Share_on_X-000000?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/intent/tweet?text=Check%20out%20JCN%20%E2%80%94%20an%20open-source%20workspace%20that%20combines%20Project%20Management%20and%20HR%20in%20one%20place%3A&url=https://github.com/Profysr/JCN)

</div>

Stars help other teams discover JCN through GitHub's trending and search rankings — it costs nothing and takes two seconds.

---

<div align="center">
Built with ❤️ by 🌏
</div>
