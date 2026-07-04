# ASGI entry point for the Django application.
#
# WSGI (the older standard) handles one request at a time synchronously — it can't keep a connection open. ASGI is the async upgrade that supports both normal HTTP requests AND long-lived connections like WebSockets.

# Django Channels sits on top of ASGI and adds WebSocket support. This file tells it
# how to route each connection type:
#   - HTTP  → handled by the standard Django request/response stack (views, DRF, etc.)
#   - WebSocket → handed off to our WorkspaceConsumer (see workspaces/consumers.py)

import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
# Must run before any import below touches Django models/apps (e.g.
# workspaces.middleware imports django.contrib.auth.models). Under
# `manage.py runserver` this was already done by Django's own bootstrap
# before this module was imported, masking the ordering requirement — running
# `daphne core.asgi:application` directly has no such bootstrap, so it's
# required here explicitly.
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from workspaces.middleware import JWTAuthMiddlewareStack
from workspaces.routing import websocket_urlpatterns

application = ProtocolTypeRouter({
    # Normal REST API requests go through the standard Django stack
    "http": get_asgi_application(),

    # WebSocket connections are authenticated via JWT carried in the
    # Sec-WebSocket-Protocol subprotocol ["jwt", <token>] (or an Authorization
    # header for non-browser clients) — the frontend stores JWTs in localStorage,
    # not cookies, so the standard AuthMiddlewareStack (session/cookie) won't work
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
