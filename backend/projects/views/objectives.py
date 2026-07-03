from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from ..models import Objective, KeyResult
from ..serializers import (
    ObjectiveSerializer,
    KeyResultSerializer,
    KeyResultLinkedTaskSerializer,
)
from core.events import broadcast
from .helpers import get_workspace_for_user


# ── v3.8.0 — OKR & Goal Tracking ─────────────────────────────────────────────
class ObjectiveListCreateView(APIView):
    """GET/POST /workspaces/:slug/objectives/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_workspace_for_user(slug, user)

    def get(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        qs = Objective.objects.filter(workspace=workspace).select_related(
            "owner"
        ).prefetch_related("key_results__tasks")
        # apply time period filter
        time_period = request.query_params.get("time_period")
        if time_period and time_period != "all":
            qs = qs.filter(time_period=time_period)
        
        return Response(
            ObjectiveSerializer(qs, many=True, context={"request": request}).data
        )

    def post(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        serializer = ObjectiveSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(workspace=workspace, owner=request.user)
        data = ObjectiveSerializer(obj, context={"request": request}).data
        broadcast(workspace_id, "objective.created", data)
        return Response(data, status=status.HTTP_201_CREATED)


class ObjectiveDetailView(APIView):
    """GET/PATCH/DELETE /workspaces/:slug/objectives/:obj_id/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_obj(self, workspace_id, obj_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(
            Objective.objects.prefetch_related("key_results__tasks").select_related(
                "owner"
            ),
            id=obj_id,
            workspace=workspace,
        )

    def get(self, request, workspace_id, obj_id):
        obj = self._get_obj(workspace_id, obj_id, request.user)
        return Response(ObjectiveSerializer(obj, context={"request": request}).data)

    def patch(self, request, workspace_id, obj_id):
        obj = self._get_obj(workspace_id, obj_id, request.user)
        serializer = ObjectiveSerializer(
            obj, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        broadcast(workspace_id, "objective.updated", serializer.data)
        return Response(serializer.data)

    def delete(self, request, workspace_id, obj_id):
        obj = self._get_obj(workspace_id, obj_id, request.user)
        obj_id_str = str(obj.id)
        obj.delete()
        broadcast(workspace_id, "objective.deleted", {"id": obj_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


class KeyResultListCreateView(APIView):
    """GET/POST /workspaces/:slug/objectives/:obj_id/key-results/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_objective(self, workspace_id, obj_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(Objective, id=obj_id, workspace=workspace)

    def get(self, request, workspace_id, obj_id):
        obj = self._get_objective(workspace_id, obj_id, request.user)
        return Response(
            KeyResultSerializer(
                obj.key_results.prefetch_related("tasks"), many=True
            ).data
        )

    def post(self, request, workspace_id, obj_id):
        obj = self._get_objective(workspace_id, obj_id, request.user)
        serializer = KeyResultSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        kr = serializer.save(objective=obj)
        broadcast(
            workspace_id, "objective.updated",
            ObjectiveSerializer(
                Objective.objects.prefetch_related("key_results__tasks").select_related("owner").get(pk=obj.pk),
                context={"request": request},
            ).data,
        )
        return Response(KeyResultSerializer(kr).data, status=status.HTTP_201_CREATED)


class KeyResultDetailView(APIView):
    """GET/PATCH/DELETE /workspaces/:slug/objectives/:obj_id/key-results/:kr_id/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_kr(self, workspace_id, obj_id, kr_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        obj = get_object_or_404(Objective, id=obj_id, workspace=workspace)
        return get_object_or_404(
            KeyResult.objects.prefetch_related("tasks"), id=kr_id, objective=obj
        )

    def get(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        return Response(KeyResultSerializer(kr).data)

    def patch(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        serializer = KeyResultSerializer(kr, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        kr = serializer.save()
        broadcast(
            workspace_id, "objective.updated",
            ObjectiveSerializer(
                Objective.objects.prefetch_related("key_results__tasks").select_related("owner").get(pk=obj_id),
                context={"request": request},
            ).data,
        )
        return Response(serializer.data)

    def delete(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        kr.delete()
        broadcast(
            workspace_id, "objective.updated",
            ObjectiveSerializer(
                Objective.objects.prefetch_related("key_results__tasks").select_related("owner").get(pk=obj_id),
                context={"request": request},
            ).data,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class KeyResultLinkedTasksView(APIView):
    """Manage tasks linked to a Key Result.
    GET    — list linked tasks
    PUT    — replace full task set { task_ids: [...] }
    POST   — link one task { task_id: "..." }
    DELETE — unlink one task { task_id: "..." }
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_kr(self, workspace_id, obj_id, kr_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        obj = get_object_or_404(Objective, id=obj_id, workspace=workspace)
        return get_object_or_404(
            KeyResult.objects.prefetch_related("tasks__status"), id=kr_id, objective=obj
        )

    def _broadcast_objective(self, workspace_id, obj_id, request):
        broadcast(
            workspace_id,
            "objective.updated",
            ObjectiveSerializer(
                Objective.objects.prefetch_related("key_results__tasks")
                .select_related("owner")
                .get(pk=obj_id),
                context={"request": request},
            ).data,
        )

    def get(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        return Response(KeyResultLinkedTaskSerializer(kr.tasks.all(), many=True).data)

    def put(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        kr.tasks.set(request.data.get("task_ids", []))
        self._broadcast_objective(workspace_id, obj_id, request)
        return Response(KeyResultSerializer(kr).data)

    def post(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        task_id = request.data.get("task_id")
        if task_id:
            kr.tasks.add(task_id)
        self._broadcast_objective(workspace_id, obj_id, request)
        return Response(KeyResultSerializer(kr).data)

    def delete(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        task_id = request.data.get("task_id")
        if task_id:
            kr.tasks.remove(task_id)
        self._broadcast_objective(workspace_id, obj_id, request)
        return Response(KeyResultSerializer(kr).data)
