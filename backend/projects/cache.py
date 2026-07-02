"""
Redis cache layer for comments.

Key schema
  rxn:<comment_uuid>          → JSON  → {emoji: [{id, user_id, name}]}   TTL 2 h
  ws_members:<workspace_uuid> → JSON  → [{id, keys: [...]}]               TTL 5 min

Why Redis and not Django's cache framework:
  Django's default cache is in-memory and per-process — useless across workers.
  Redis is our dedicated caching layer (the message broker is RabbitMQ), so this
  connects to REDIS_URL directly.
"""

import json
import logging

import redis as redis_lib
from django.conf import settings

logger = logging.getLogger(__name__)

_pool = None
REACTION_TTL = 60 * 60 * 2  # 2 hours


def _redis():
    global _pool
    if _pool is None:
        _pool = redis_lib.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=50,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return redis_lib.Redis(connection_pool=_pool)


def _key(comment_id):
    return f"rxn:{comment_id}"


def get_reactions(comment_id):
    """Return cached grouped reactions or None on miss/error."""
    try:
        data = _redis().get(_key(comment_id))
        return json.loads(data) if data else None
    except Exception:
        logger.warning("Redis reaction cache read failed for comment %s", comment_id)
        return None


def set_reactions(comment_id, grouped):
    """Write grouped reactions to cache. Silently no-ops on Redis error."""
    try:
        _redis().setex(_key(comment_id), REACTION_TTL, json.dumps(grouped))
    except Exception:
        logger.warning("Redis reaction cache write failed for comment %s", comment_id)


def invalidate_reactions(comment_id):
    """Delete cached reactions for a comment. Silently no-ops on Redis error."""
    try:
        _redis().delete(_key(comment_id))
    except Exception:
        logger.warning("Redis reaction cache delete failed for comment %s", comment_id)
