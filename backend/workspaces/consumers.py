import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import WorkspaceMember


class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.workspace_slug = self.scope["url_route"]["kwargs"]["workspace_slug"]
        self.room_group_name = f"workspace_{self.workspace_slug}"

        user = self.scope["user"]
        if not user.is_authenticated:
            await self.close()
            return

        is_member = await self.check_membership(user, self.workspace_slug)
        if not is_member:
            await self.close()
            return

        self.user_group_name = f"user_{user.id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def receive(self, text_data):
        pass

    async def workspace_event(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def user_notification(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    @database_sync_to_async
    def check_membership(self, user, workspace_slug):
        return WorkspaceMember.objects.filter(
            workspace__slug=workspace_slug, user=user
        ).exists()
