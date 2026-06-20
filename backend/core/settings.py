import environ
import os
from pathlib import Path
from datetime import timedelta

# BASE_DIR points to the /backend folder — all relative paths resolve from here
BASE_DIR = Path(__file__).resolve().parent.parent

# django-environ lets us read .env files and cast types (bool, list, db URL, etc.)
env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

# SECURITY
SECRET_KEY = env("SECRET_KEY", default="dev-secret-key-change-in-production")
DEBUG = env("DEBUG", default=True)

# ALLOWED_HOSTS controls which domain names Django will serve — prevents HTTP Host header attacks
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    # daphne must be first — it replaces Django's default WSGI server with ASGI (needed for WebSockets)
    "daphne",
    # Django built-ins
    "django.contrib.admin",  # /admin dashboard
    "django.contrib.auth",  # authentication framework (login, permissions, groups)
    "django.contrib.contenttypes",  # lets models reference other models generically (used by permissions)
    "django.contrib.sessions",  # server-side session storage
    "django.contrib.messages",  # one-time flash messages (used by admin)
    "django.contrib.staticfiles",  # serves CSS/JS in dev
    "django.contrib.sites",  # required by allauth — supports multi-site setups
    # Django REST Framework — turns Django views into a proper REST API
    "rest_framework",
    # Token auth table used internally by dj-rest-auth even when we use JWT
    "rest_framework.authtoken",
    # Adds CORS headers so the React frontend (different port) can talk to this API
    "corsheaders",
    # allauth — handles registration flow, email verification, social auth
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    # dj-rest-auth — wraps allauth into DRF-compatible login/register/logout endpoints
    "dj_rest_auth",
    "dj_rest_auth.registration",
    # Django Channels — adds WebSocket support on top of Django
    "channels",
    # django-filter — adds ?status=open style query param filtering to API views
    "django_filters",
    # drf-spectacular — auto-generates OpenAPI schema → Swagger UI at /api/docs/
    "drf_spectacular",
    # Our apps
    "accounts",  # custom User model, profile
    "workspaces",  # workspaces, members, invites
    "projects",  # projects, tasks, subtasks, comments
    "integrations",  # Teams, Google Chat integrations (v4.3.0)
    "analytics",  # analytics metrics + report builder
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CORS middleware must be as high as possible — it needs to add headers before any response goes out
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    # CSRF protection — blocks cross-site form submissions (not needed for JWT API but keep for admin)
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # allauth requires this — handles account-related request context
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",  # allauth requires this
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Tells Django to use ASGI (not WSGI) — required for Channels/WebSockets
ASGI_APPLICATION = "core.asgi.application"

# django-environ parses the DATABASE_URL string into the dict Django expects
DATABASES = {
    "default": env.db(
        "DATABASE_URL", default="postgresql://jcn_user:jcn_pass@localhost:5432/jcn_db"
    )
}

# Channel layers are how Django Channels broadcasts messages between consumers
# Redis is the broker — when one WebSocket client sends an event, Redis fans it out to all subscribers
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [env("REDIS_URL", default="redis://localhost:6379")],
        },
    },
}

# ── Celery (v2.7.0) ───────────────────────────────────────────────────────────
CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379")
CELERY_RESULT_BACKEND = env("REDIS_URL", default="redis://localhost:6379")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

# Swap Django's built-in User model for ours (email-based, UUID pk, no username)
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True  # Store all datetimes in UTC in the DB — convert to user timezone in the frontend

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # where collectstatic dumps files for production

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"  # uploaded files (avatars, attachments) land here

# Use BigAutoField (64-bit int) for auto-generated PKs on models that don't specify one
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Required by allauth — in multi-site setups this identifies which site we're on
SITE_ID = 1

# REST Framework global defaults — can be overridden per-view
REST_FRAMEWORK = {
    # Two authentication methods are supported:
    #   1. JWT Bearer token — used by the React frontend (login flow)
    #   2. API key (jcn_...) — used by external integrations (CI, scripts, Zapier, etc.)
    # DRF tries each in order and stops at the first match.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "workspaces.authentication.APIKeyAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    # Unauthenticated requests get 403 by default
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Enables ?search=, ?ordering=, and ?field= query params across all list views
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # Paginate all list responses — prevents returning 10k tasks in one request
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    # Tells drf-spectacular how to introspect views for OpenAPI schema generation
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# JWT token lifetimes
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        hours=1
    ),  # short-lived — sent with every request
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=30
    ),  # long-lived — used to get a new access token silently
    "ROTATE_REFRESH_TOKENS": True,  # issue a new refresh token on every refresh (rolling sessions)
}

# dj-rest-auth config
REST_AUTH = {
    "USE_JWT": True,  # use JWT instead of DRF's Token auth
    "JWT_AUTH_HTTPONLY": False,  # send refresh token in response body (not httpOnly cookie) so React can store it
    # Point to our custom serializers so register/login returns our User shape
    "REGISTER_SERIALIZER": "accounts.serializers.RegisterSerializer",
    "USER_DETAILS_SERIALIZER": "accounts.serializers.UserSerializer",
    # Password reset confirm URL — frontend route that handles uid/token from the email link
    "PASSWORD_RESET_CONFIRM_URL": "reset-password/{uid}/{token}",
    # Without this, dj_rest_auth ignores old_password entirely and saves any new password.
    "OLD_PASSWORD_FIELD_ENABLED": True,
}

# allauth account behaviour
ACCOUNT_AUTHENTICATION_METHOD = "email"  # login with email, not username
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_USER_MODEL_USERNAME_FIELD = (
    None  # our User model has no username field — stops allauth looking for one
)
ACCOUNT_EMAIL_VERIFICATION = (
    "none"  # disable email verification in dev; set to "mandatory" in production
)

# Google OAuth provider — credentials come from env, no DB SocialApp record needed
SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APP": {
            "client_id": env("GOOGLE_CLIENT_ID", default=""),
            "secret": env("GOOGLE_CLIENT_SECRET", default=""),
            "key": "",
        },
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
    }
}
# Auto-connect a Google sign-in to an existing email+password account
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
SOCIALACCOUNT_STORE_TOKENS = False

# CORS — allow the React dev server to call this API
# In production, replace with your actual frontend domain
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)
CORS_ALLOW_CREDENTIALS = True  # allow cookies and auth headers cross-origin

# Swagger / OpenAPI docs metadata — visible at /api/docs/
SPECTACULAR_SETTINGS = {
    "TITLE": "JCN API",
    "DESCRIPTION": "Project Management API",
    "VERSION": "1.0.0",
}

# ── v4.3.0 — Integration settings ────────────────────────────────────────────
# Slack — create a Slack App at https://api.slack.com/apps and fill these in .env
SLACK_CLIENT_ID = env("SLACK_CLIENT_ID", default="")
SLACK_CLIENT_SECRET = env("SLACK_CLIENT_SECRET", default="")
SLACK_SIGNING_SECRET = env("SLACK_SIGNING_SECRET", default="")

# Frontend URL — used in invite email links and integration deep-links
FRONTEND_URL = env("VITE_FRONTEND_URL", default="http://localhost:5173")

# ── Email (Resend) ────────────────────────────────────────────────────────────
RESEND_API_KEY = env("RESEND_API_KEY", default="")
FROM_EMAIL = env("FROM_EMAIL", default="onboarding@resend.dev")
