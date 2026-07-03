from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from allauth.account.models import EmailAddress
from workspaces.access import APIKeyScopePermission
from .serializers import UserSerializer


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, APIKeyScopePermission]

    def get_object(self):
        return self.request.user


class EmailVerifiedCheckView(APIView):
    """
    Public endpoint — lets the verify-email-sent page poll until the user
    confirms their address (possibly in a different browser/tab).
    GET /api/auth/email-verified/?email=user@example.com
    Returns { "verified": true|false }
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        email = request.query_params.get("email", "").strip().lower()
        if not email:
            return Response({"verified": False})
        verified = EmailAddress.objects.filter(
            email__iexact=email, verified=True
        ).exists()
        return Response({"verified": verified})
