# WorkspaceConsumer — handles the WebSocket connection for a single workspace.
#
# How it works:
#   1. Browser opens a WebSocket to ws://.../ws/workspaces/<slug>/
#   2. connect() is called — we authenticate the user and verify they're a member,
#      then subscribe them to two Redis pub/sub groups:
#        - "workspace_<slug>" → receives events broadcast to everyone in this workspace (e.g. task created, sprint started)
#        - "user_<id>"        → receives events sent to this specific user only (e.g. personal notifications, inbox items)
#   3. When something happens in the app (a task is updated, etc.), Django signals or Celery tasks call channel_layer.group_send() with an event dict. Every connected client in that group receives it immediately via workspace_event() or user_notification().
#   4. disconnect() removes the client from both groups so they stop receiving messages.

# The channel layer (backed by Redis) is what makes the "broadcast to a group" pattern possible — it acts as a message bus between Django workers and connected WebSocket clients.

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import WorkspaceMember

class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.workspace_slug = self.scope["url_route"]["kwargs"]["workspace_slug"]
        self.room_group_name = f"workspace_{self.workspace_slug}"

        user = self.scope["user"]
        # Reject unauthenticated connections immediately
        if not user.is_authenticated:
            await self.close()
            return

        # Reject users who are not members of this workspace
        is_member = await self.check_membership(user, self.workspace_slug)
        if not is_member:
            await self.close()
            return

        self.user_group_name = f"user_{user.id}"

        # Subscribe to workspace-wide events (visible to all members)
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        # Subscribe to user-specific events (personal notifications)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        # Unsubscribe from both groups so the client stops receiving messages
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def receive(self, text_data):
        # We don't accept any messages from the client — this is a server-push only channel
        pass

    async def workspace_event(self, event):
        # Called when something is sent to the "workspace_<slug>" group.
        # Forwards the payload to the browser as a JSON string.
        await self.send(text_data=json.dumps(event["data"]))

    async def user_notification(self, event):
        # Called when something is sent to the "user_<id>" group.
        # Forwards the personal notification to this specific user's browser.
        await self.send(text_data=json.dumps(event["data"]))

    @database_sync_to_async
    def check_membership(self, user, workspace_slug):
        # database_sync_to_async wraps this ORM call so it can be awaited
        # without blocking the async event loop
        return WorkspaceMember.objects.filter(
            workspace__slug=workspace_slug, user=user
        ).exists()
