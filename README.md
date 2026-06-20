# JCN — Project Management

## Quick Start

### Option A: Docker (recommended)
```bash
docker-compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs/
- Django Admin: http://localhost:8000/admin/

### Option B: Local dev (no Docker)

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Frontend:**
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
FROM_EMAIL=onboarding@resend.dev
FRONTEND_URL=http://localhost:5173
```

## First run
1. Go to http://localhost:5173/register
2. Create an account
3. You'll be prompted to create your first workspace
4. Invite teammates via the Members section

## API Endpoints
| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/auth/registration/ | Register with email + password |
| POST | /api/auth/login/ | Login (returns JWT) |
| POST | /api/auth/logout/ | Logout |
| POST | /api/auth/google/ | Login or register with Google (returns JWT) |
| GET/PATCH | /api/users/me/ | Current user profile |
| GET/POST | /api/workspaces/ | List / create workspaces |
| GET/PATCH/DELETE | /api/workspaces/:slug/ | Workspace detail |
| GET | /api/workspaces/:slug/members/ | List members |
| POST | /api/workspaces/:slug/invites/ | Invite by email (sends invite email) |
| GET | /api/workspaces/:slug/invites/pending/ | List pending invites |
| DELETE | /api/workspaces/:slug/invites/:token/ | Cancel invite |
| GET | /api/invites/:token/ | Public invite detail (workspace + inviter info) |
| POST | /api/invites/:token/accept/ | Accept invite |
