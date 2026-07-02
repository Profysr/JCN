# WebSocket URL routing — the WebSocket equivalent of urls.py.
#
# When a browser opens a WebSocket connection, Django Channels matches the URL here and hands the connection to the corresponding consumer class.

# The frontend connects to:
#   ws://localhost:8000/ws/workspaces/<workspace_id>/
#
# The <uuid:workspace_id> converter validates the ID up front: a non-UUID never
# matches this route, so the connection is rejected before WorkspaceConsumer runs.
# Inside the consumer it arrives already parsed as a uuid.UUID at
# self.scope["url_route"]["kwargs"]["workspace_id"].

from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path("ws/workspaces/<uuid:workspace_id>/", consumers.WorkspaceConsumer.as_asgi()),
]
