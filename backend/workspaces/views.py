from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Workspace, WorkspaceMember, WorkspaceInvite, Notification
from .serializers import WorkspaceSerializer, WorkspaceMemberSerializer, WorkspaceInviteSerializer, NotificationSerializer


class WorkspaceListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspaces = Workspace.objects.filter(members__user=request.user).distinct()
        serializer = WorkspaceSerializer(workspaces, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        serializer = WorkspaceSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, slug, user):
        return get_object_or_404(Workspace, slug=slug, members__user=user)

    def get(self, request, slug):
        workspace = self.get_object(slug, request.user)
        return Response(WorkspaceSerializer(workspace, context={"request": request}).data)

    def patch(self, request, slug):
        workspace = self.get_object(slug, request.user)
        serializer = WorkspaceSerializer(workspace, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug):
        workspace = self.get_object(slug, request.user)
        if workspace.owner != request.user:
            return Response({"detail": "Only the owner can delete this workspace."}, status=status.HTTP_403_FORBIDDEN)
        workspace.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class WorkspaceMemberListView(ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceMemberSerializer

    def get_queryset(self):
        workspace = get_object_or_404(Workspace, slug=self.kwargs["slug"], members__user=self.request.user)
        return workspace.members.select_related("user").all()


class WorkspaceMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, slug, member_id, user):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=user)
        return get_object_or_404(WorkspaceMember, workspace=workspace, id=member_id), workspace

    def patch(self, request, slug, member_id):
        member, workspace = self.get_object(slug, member_id, request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()

        if not is_admin:
            return Response({"detail": "Only admins can update member roles."}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = WorkspaceMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug, member_id):
        member, workspace = self.get_object(slug, member_id, request.user)
        if member.user == request.user:
            return Response({"detail": "You cannot remove yourself."}, status=status.HTTP_400_BAD_REQUEST)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()
        if not is_admin:
            return Response({"detail": "Only admins can remove members."}, status=status.HTTP_403_FORBIDDEN)
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteMemberView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        serializer = WorkspaceInviteSerializer(
            data=request.data,
            context={"request": request, "workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceInviteListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        invites = workspace.invites.filter(status=WorkspaceInvite.Status.PENDING).select_related("invited_by")
        return Response(WorkspaceInviteSerializer(invites, many=True).data)

    def delete(self, request, slug):
        """Cancel all pending invites for a given email (bulk cancel not used — see token endpoint)."""
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)


class WorkspaceInviteCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, slug, token):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()
        if not is_admin:
            return Response({"detail": "Only admins can cancel invites."}, status=status.HTTP_403_FORBIDDEN)
        invite = get_object_or_404(WorkspaceInvite, token=token, workspace=workspace)
        invite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteDetailView(APIView):
    """Public endpoint — returns invite info so the accept page can display it before login."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        invite = get_object_or_404(WorkspaceInvite, token=token, status=WorkspaceInvite.Status.PENDING)
        return Response({
            "token": str(invite.token),
            "email": invite.email,
            "role": invite.role,
            "workspace": {"name": invite.workspace.name, "slug": invite.workspace.slug},
            "invited_by": invite.invited_by.full_name or invite.invited_by.email,
        })


class AcceptInviteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, token):
        invite = get_object_or_404(WorkspaceInvite, token=token, status=WorkspaceInvite.Status.PENDING)
        if invite.email != request.user.email:
            return Response({"detail": "This invite is for a different email address."}, status=status.HTTP_403_FORBIDDEN)
        WorkspaceMember.objects.get_or_create(
            workspace=invite.workspace,
            user=request.user,
            defaults={"role": invite.role, "invited_by": invite.invited_by},
        )
        invite.status = WorkspaceInvite.Status.ACCEPTED
        invite.save()
        return Response(WorkspaceSerializer(invite.workspace, context={"request": request}).data)


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        notifs = Notification.objects.filter(recipient=request.user).select_related("actor")[:50]
        return Response(NotificationSerializer(notifs, many=True).data)


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        notif_id = request.data.get("id")
        if notif_id:
            Notification.objects.filter(id=notif_id, recipient=request.user).update(read=True)
        else:
            Notification.objects.filter(recipient=request.user, read=False).update(read=True)
        return Response({"status": "ok"})
