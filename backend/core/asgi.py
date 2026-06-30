# ASGI entry point for the Django application.
#
# WSGI (the older standard) handles one request at a time synchronously — it can't keep a connection open. ASGI is the async upgrade that supports both normal HTTP requests AND long-lived connections like WebSockets.

# Django Channels sits on top of ASGI and adds WebSocket support. This file tells it
# how to route each connection type:
#   - HTTP  → handled by the standard Django request/response stack (views, DRF, etc.)
#   - WebSocket → handed off to our WorkspaceConsumer (see workspaces/consumers.py)

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from workspaces.middleware import JWTAuthMiddlewareStack
from workspaces.routing import websocket_urlpatterns

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

application = ProtocolTypeRouter({
    # Normal REST API requests go through the standard Django stack
    "http": get_asgi_application(),

    # WebSocket connections are authenticated via JWT (?token=<access_token>
    # in the URL query string) — the frontend stores JWTs in localStorage,
    # not cookies, so the standard AuthMiddlewareStack (session/cookie) won't
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
