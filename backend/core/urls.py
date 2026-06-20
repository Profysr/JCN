from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from projects.views import GlobalSearchView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth
    path("api/auth/", include("dj_rest_auth.urls")),
    path("api/auth/registration/", include("dj_rest_auth.registration.urls")),
    # Apps
    path("api/", include("accounts.urls")),
    path("api/", include("workspaces.urls")),
    path("api/", include("projects.urls")),
    path("api/", include("integrations.urls")),
    path("api/", include("analytics.urls")),
    path("api/", include("organization.urls")),
    # Global search
    path("api/search/", GlobalSearchView.as_view()),
    # API Docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
