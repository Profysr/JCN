"""
JWTAuthMiddleware — ASGI middleware that authenticates WebSocket connections
with a SimpleJWT access token, mirroring what AuthMiddlewareStack does for
session auth: it resolves scope["user"] before the consumer runs.

The token is accepted from two places (first match wins):

  1. Sec-WebSocket-Protocol header — the client requests subprotocols
     ["jwt", "<token>"]. This is what the frontend uses: browsers can't set arbitrary WS headers, but they CAN set subprotocols, and the token stays out of URLs / access logs / proxy logs. The consumer must echo the "jwt"
     subprotocol back on accept() — scope["jwt_subprotocol"] is set to signal that.
  2. Authorization: Bearer <token> header — for non-browser clients.

Auth here answers only "who is this?". "May they join workspace X?" is the
consumer's job (membership check per URL route).

Usage in asgi.py:
    "websocket": JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))
"""

import logging

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)

SUBPROTOCOL_PREFIX = "jwt"


def _resolve_token(scope):
    """Extract the raw JWT from the connection scope. Returns (token, via_subprotocol)."""
    # 1. Sec-WebSocket-Protocol: "jwt, <token>"
    subprotocols = scope.get("subprotocols") or []
    if len(subprotocols) >= 2 and subprotocols[0] == SUBPROTOCOL_PREFIX:
        return subprotocols[1], True

    # 2. Authorization: Bearer <token>
    headers = dict(scope.get("headers") or [])
    auth_header = headers.get(b"authorization", b"").decode()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip(), False

    return None, False


@database_sync_to_async
def _get_user_from_jwt(token_str):
    """Validate a JWT access token → User, or AnonymousUser if missing/expired/invalid."""
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import AccessToken
    from rest_framework_simplejwt.exceptions import TokenError

    if not token_str:
        return AnonymousUser()

    try:
        validated = AccessToken(token_str)
        user_id = validated.get("user_id")
        if not user_id:
            return AnonymousUser()
        user = get_user_model().objects.filter(id=user_id).first()
        return user or AnonymousUser()
    except TokenError as exc:
        logger.debug("WS JWT rejected: %s", exc)
        return AnonymousUser()
    except Exception:
        logger.exception("WS JWT auth unexpected failure")
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """Resolve the JWT into scope["user"] before handing off to the URLRouter/consumer."""

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            token, via_subprotocol = _resolve_token(scope)
            scope["user"] = await _get_user_from_jwt(token)
            # Consumers must echo the subprotocol on accept() or browsers drop the connection.
            scope["jwt_subprotocol"] = via_subprotocol

        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Drop-in replacement for AuthMiddlewareStack for JWT-authenticated WebSockets."""
    return JWTAuthMiddleware(inner)
