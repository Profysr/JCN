"""
Custom DRF authentication class for JCN workspace API keys.
Usage: Authorization: Bearer jcn_<hex>
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from workspaces.models import WorkspaceAPIKey

class APIKeyAuthentication(BaseAuthentication):
    """
    Authenticates requests carrying  Authorization: Bearer jcn_<key>
    Sets request.user = key.created_by and request.api_key = key.
    """

    def authenticate(self, request):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer jcn_"):
            return None  # let other authenticators try

        raw = auth[len("Bearer "):]
        key = WorkspaceAPIKey.authenticate(raw)

        if key is None:
            raise AuthenticationFailed("Invalid or expired API key.")

        # Attach the key object so views can check scopes
        request.api_key = key
        return (key.created_by, key)

    def authenticate_header(self, request):
        return 'Bearer realm="JCN API"'
