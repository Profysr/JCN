from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from ..models import Board, Form, FormField, FormSubmission, TaskStatus, Task
from ..serializers import (
    FormSerializer,
    FormFieldSerializer,
    FormSubmissionSerializer,
    PublicFormSerializer,
)
from .helpers import (
    _parse_pk,
    get_workspace_for_user,
    _require_board_perm,
)


# ── v2.6.0 — Forms & Intake ───────────────────────────────────────────────────


class FormListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        forms = board.forms.prefetch_related("fields")
        return Response(FormSerializer(forms, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        serializer = FormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = serializer.save(board=board, created_by=request.user)
        return Response(FormSerializer(form).data, status=status.HTTP_201_CREATED)


class FormDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_form(self, workspace_id, project_id, form_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(Form, id=form_id, board=board), board

    def get(self, request, workspace_id, project_id, form_id):
        form, _ = self._get_form(workspace_id, project_id, form_id, request.user)
        return Response(FormSerializer(form).data)

    def patch(self, request, workspace_id, project_id, form_id):
        form, board = self._get_form(workspace_id, project_id, form_id, request.user)
        _require_board_perm(request.user, board, "edit")
        serializer = FormSerializer(form, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, form_id):
        form, board = self._get_form(workspace_id, project_id, form_id, request.user)
        _require_board_perm(request.user, board, "admin")
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormFieldsBulkUpdateView(APIView):
    """PUT /forms/:id/fields/ — replace all fields in one shot (drag-drop reorder support)."""

    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, workspace_id, project_id, form_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        form = get_object_or_404(Form, id=form_id, board=board)
        form.fields.all().delete()
        new_fields = []
        for i, f in enumerate(request.data):
            new_fields.append(
                FormField(
                    form=form,
                    label=f.get("label", ""),
                    field_type=f.get("field_type", "short_text"),
                    placeholder=f.get("placeholder", ""),
                    is_required=f.get("is_required", False),
                    options=f.get("options", []),
                    order=i,
                )
            )
        FormField.objects.bulk_create(new_fields)
        return Response(FormSerializer(form).data)


class PublicFormView(APIView):
    """GET /forms/:token/ — unauthenticated, returns public form definition."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, form_token):
        form = get_object_or_404(Form, token=form_token, is_active=True)
        return Response(PublicFormSerializer(form).data)


class PublicFormSubmitView(APIView):
    """POST /forms/:token/submit/ — unauthenticated public submission."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, form_token):
        form = get_object_or_404(Form, token=form_token, is_active=True)
        answers = request.data.get("answers", {})
        submitter_email = request.data.get("email", "")

        submission = FormSubmission.objects.create(
            form=form,
            answers=answers,
            submitter_email=submitter_email,
        )

        # Auto-create task if configured
        cfg = form.config or {}
        if cfg.get("create_task", True):
            title_field_id = cfg.get("title_field_id")
            title = (
                answers.get(title_field_id, "")
                if title_field_id
                else f"Submission from {submitter_email or 'form'}"
            )
            if not title:
                title = f"Form submission — {form.name}"
            status_id = cfg.get("default_status_id")
            task_status = None
            if status_id:
                try:
                    task_status = TaskStatus.objects.get(id=status_id, board=form.board)
                except TaskStatus.DoesNotExist:
                    task_status = form.board.statuses.first()
            else:
                task_status = form.board.statuses.first()

            task = Task.objects.create(
                board=form.board,
                title=title[:500],
                description=f"**Via form:** {form.name}\n\n**Submitter:** {submitter_email}",
                status=task_status,
                created_by=None,
            )
            submission.task = task
            submission.save(update_fields=["task"])

        return Response(
            {"success": True, "submission_id": str(submission.id)},
            status=status.HTTP_201_CREATED,
        )


class FormSubmissionListView(APIView):
    """GET /forms/:id/submissions/ — authenticated, returns all submissions."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, form_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        form = get_object_or_404(Form, id=form_id, board=board)
        subs = form.submissions.select_related("task").order_by("-submitted_at")
        return Response(FormSubmissionSerializer(subs, many=True).data)

    def patch(self, request, workspace_id, project_id, form_id):
        """Update a submission status."""
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        form = get_object_or_404(Form, id=form_id, board=board)
        sub_id = request.data.get("id")
        sub = get_object_or_404(FormSubmission, id=sub_id, form=form)
        new_status = request.data.get("status")
        if new_status in [s[0] for s in FormSubmission.Status.choices]:
            sub.status = new_status
            sub.save(update_fields=["status"])
        return Response(FormSubmissionSerializer(sub).data)
