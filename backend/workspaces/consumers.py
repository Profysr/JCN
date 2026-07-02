# WorkspaceConsumer — handles the WebSocket connection for a single workspace.
#
# How it works:
#   1. Browser opens a WebSocket to ws://.../ws/workspaces/<workspace_id>/
#   2. connect() is called — we authenticate the user and verify they're a member,
#      then subscribe them to two channel-layer groups:
#        - "workspace_<id>" → receives events broadcast to everyone in this workspace (e.g. task created, sprint started)
#        - "user_<id>"      → receives events sent to this specific user only (e.g. personal notifications, inbox items)
#   3. When something happens in the app (a task is updated, etc.), Django signals or Celery tasks call channel_layer.group_send() with an event dict. Every connected client in that group receives it immediately via workspace_event() or user_notification().
#   4. disconnect() removes the client from both groups so they stop receiving messages.

# The channel layer (backed by RabbitMQ — see CHANNEL_LAYERS in core/settings.py) is what makes the "broadcast to a group" pattern possible — it acts as a message bus between Django workers and connected WebSocket clients.

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Workspace

logger = logging.getLogger(__name__)

class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        workspace_id = self.scope["url_route"]["kwargs"]["workspace_id"]

        # JWTAuthMiddleware (asgi.py) resolves scope["user"] from ?token= before
        # this consumer runs — treat it exactly like AuthMiddlewareStack does.
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            logger.warning("WS rejected: unauthenticated (workspace=%s)", workspace_id)
            await self.close()
            return

        # Resolve the workspace and confirm membership (returns None if either fails).
        workspace = await self.get_workspace(workspace_id, user)
        if workspace is None:
            await self.close()
            return

        # Group name must match broadcast() which uses the plain UUID from URL params.
        self.workspace_group_name = f"workspace_{workspace.id}"
        self.user_group_name = f"user_{user.id}"

        logger.info("WS connect: user=%s workspace_group=%s user_group=%s", user.id, self.workspace_group_name, self.user_group_name)

        # Subscribe to workspace-wide events (visible to all members)
        await self.channel_layer.group_add(self.workspace_group_name, self.channel_name)
        # Subscribe to user-specific events (personal notifications)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        # Unsubscribe from both groups so the client stops receiving messages
        if hasattr(self, "workspace_group_name"):
            await self.channel_layer.group_discard(self.workspace_group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def receive(self, text_data):
        # We don't accept any messages from the client — this is a server-push only channel
        pass

    async def workspace_event(self, event):
        # Called when something is sent to the "workspace_<id>" group.
        # Forwards the payload to the browser as a JSON string.
        await self.send(text_data=json.dumps(event["data"]))

    async def user_notification(self, event):
        # Called when something is sent to the "user_<id>" group.
        # Forwards the personal notification to this specific user's browser.
        await self.send(text_data=json.dumps(event["data"]))

    @database_sync_to_async
    def get_workspace(self, workspace_id, user):
        """Return the workspace iff `user` is a member, else None
        """
        return Workspace.objects.filter(id=workspace_id, members__user=user).first()
