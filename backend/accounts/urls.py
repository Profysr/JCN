from django.urls import path
from .views import MeView
from .social_views import GoogleLogin

urlpatterns = [
    path("users/me/", MeView.as_view(), name="me"),
    path("auth/google/", GoogleLogin.as_view(), name="google-login"),
]
