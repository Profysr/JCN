# WebSocket URL routing — the WebSocket equivalent of urls.py.
#
# When a browser opens a WebSocket connection, Django Channels matches the URL here and hands the connection to the corresponding consumer class.

# The frontend connects to:
#   ws://localhost:8000/ws/workspaces/<workspace-slug>/
#
# (?P<workspace_slug>[\w-]+) captures the slug from the URL and makes it available
# inside the consumer as: self.scope["url_route"]["kwargs"]["workspace_slug"]

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/workspaces/(?P<workspace_slug>[\w-]+)/$", consumers.WorkspaceConsumer.as_asgi()),
]
