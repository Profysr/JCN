"""
JWTAuthMiddleware — ASGI middleware that authenticates WebSocket connections
using a Bearer JWT passed as ?token=<jwt> in the URL query string.

Django Channels' AuthMiddlewareStack handles session/cookie auth. Our app uses
JWT (stored in localStorage, not cookies), so we need this middleware to bridge
the gap. It runs before the consumer and populates scope["user"] identically to
how AuthMiddlewareStack does it — the consumer sees no difference.

Usage in asgi.py:
    "websocket": JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))
"""

import urllib.parse
import logging
from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware

logger = logging.getLogger(__name__)


@database_sync_to_async
def _get_user_from_jwt(token_str):
    """
    Validate a JWT access token and return the associated User, or
    AnonymousUser if the token is missing, expired, or invalid.
    """
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import AccessToken
    from rest_framework_simplejwt.exceptions import TokenError, InvalidToken

    User = get_user_model()

    if not token_str:
        return AnonymousUser()

    try:
        validated = AccessToken(token_str)
        user_id = validated.get("user_id")
        if not user_id:
            return AnonymousUser()
        user = User.objects.filter(id=user_id).first()
        return user if user else AnonymousUser()
    except (TokenError, InvalidToken, Exception) as exc:
        logger.debug("WS JWT auth failed: %s", exc)
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Reads ?token=<jwt> from the WebSocket URL, validates the JWT, and
    injects the resolved user into scope["user"] before handing off to
    the next layer (usually URLRouter → consumer).
    """

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            query_string = scope.get("query_string", b"")
            if isinstance(query_string, bytes):
                query_string = query_string.decode()

            params = urllib.parse.parse_qs(query_string)
            token_str = params.get("token", [None])[0]

            scope["user"] = await _get_user_from_jwt(token_str)

        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """
    Drop-in replacement for AuthMiddlewareStack for JWT-authenticated
    WebSocket endpoints. Wrap URLRouter with this in asgi.py.
    """
    return JWTAuthMiddleware(inner)
