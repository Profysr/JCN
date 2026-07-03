"""
workspaces/throttling.py — rate limiting for API-key traffic.

Only requests authenticated with a workspace API key (Bearer jcn_…) are throttled
here; the bucket is keyed on the key's hash, so each key gets its own limit.
JWT/session requests return a None cache key and are left untouched (get_cache_key
returning None makes SimpleRateThrottle allow the request).

The rate is configured in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["api_key"]
and the throttle uses the Redis-backed default cache (see CACHES in core/settings.py).
"""

from rest_framework.throttling import SimpleRateThrottle


class APIKeyRateThrottle(SimpleRateThrottle):
    scope = "api_key"

    def get_cache_key(self, request, view):
        key = getattr(request, "api_key", None)
        if key is None:
            return None  # not an API-key request — this throttle does not apply
        return self.cache_format % {"scope": self.scope, "ident": key.key_hash}
