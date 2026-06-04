from django.urls import path
from .views import MeView

urlpatterns = [
    path("users/me/", MeView.as_view(), name="me"),
    # Password change/reset is handled by dj_rest_auth at /api/auth/password/change/
    #   POST fields: old_password, new_password1, new_password2
]
