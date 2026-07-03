# WorkspaceConsumer — handles the WebSocket connection for a single workspace.
#
# How it works:
#   1. Browser opens a WebSocket to ws://.../ws/workspaces/<workspace_id>/
#      (authenticated by JWTAuthMiddleware — see workspaces/middleware.py for
#      the three accepted token transports).
#   2. connect() verifies the resolved user is a member of the workspace, then
#      subscribes them to two channel-layer groups:
#        - "workspace_<id>" → events broadcast to everyone in this workspace
#        - "user_<id>"      → events sent to this specific user only
#   3. Mutations call core.events.broadcast()/broadcast_to_user(), which
#      group_send() into those groups; every connected client receives the
#      payload via workspace_event() / user_notification().
#   4. disconnect() removes the client from both groups.
#
# Close codes (frontend can branch on these instead of blind-retrying):
#   4401 — unauthenticated: token missing/expired/invalid → refresh the JWT and reconnect
#   4403 — authenticated but not a member of this workspace → do NOT retry
#
# The channel layer (backed by RabbitMQ — see CHANNEL_LAYERS in core/settings.py)
# is the message bus between Django workers and connected WebSocket clients.

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from workspaces.middleware import SUBPROTOCOL_PREFIX
from .models import Workspace

logger = logging.getLogger(__name__)

CLOSE_UNAUTHENTICATED = 4401
CLOSE_NOT_A_MEMBER = 4403


class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        workspace_id = self.scope["url_route"]["kwargs"]["workspace_id"]

        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            logger.warning("WS rejected: unauthenticated (workspace=%s)", workspace_id)
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        # Resolve the workspace and confirm membership (None if either fails).
        workspace = await self.get_workspace(workspace_id, user)
        if workspace is None:
            logger.warning("WS rejected: user=%s not a member of workspace=%s", user.id, workspace_id)
            await self.close(code=CLOSE_NOT_A_MEMBER)
            return

        # Group names must match core.events.broadcast()/broadcast_to_user().
        self.workspace_group_name = f"workspace_{workspace.id}"
        self.user_group_name = f"user_{user.id}"

        logger.info("WS connect: user=%s workspace_group=%s user_group=%s", user.id, self.workspace_group_name, self.user_group_name)

        await self.channel_layer.group_add(self.workspace_group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)

        # If the client authenticated via Sec-WebSocket-Protocol, the handshake
        # must echo the subprotocol back or browsers abort the connection.
        if self.scope.get("jwt_subprotocol"):
            await self.accept(subprotocol=SUBPROTOCOL_PREFIX)
        else:
            await self.accept()

    async def disconnect(self, close_code):
        # Unsubscribe from both groups so the client stops receiving messages
        if hasattr(self, "workspace_group_name"):
            await self.channel_layer.group_discard(self.workspace_group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def receive(self, text_data):
        # We don't accept any messages from the client — server-push only.
        pass

    async def workspace_event(self, event):
        # Something was sent to the "workspace_<id>" group — forward to the browser.
        await self.send(text_data=json.dumps(event["data"]))

    async def user_notification(self, event):
        # Something was sent to the "user_<id>" group — forward to this user's browser.
        await self.send(text_data=json.dumps(event["data"]))

    @database_sync_to_async
    def get_workspace(self, workspace_id, user):
        """Return the workspace iff `user` is a member, else None."""
        return Workspace.objects.filter(id=workspace_id, members__user=user).first()
