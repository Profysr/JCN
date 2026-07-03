from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from ..models import Board, WikiPage, WikiRevision, Document
from ..serializers import WikiPageSerializer, WikiRevisionSerializer, DocumentSerializer
from ..permissions import _require_board_perm
from .helpers import get_workspace_for_user


# ── v2.5.0 — Wiki & Documents ─────────────────────────────────────────────────
class WikiPageListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        pages = board.wiki_pages.filter(parent=None).prefetch_related("children")
        return Response(WikiPageSerializer(pages, many=True).data)

    def post(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        serializer = WikiPageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = serializer.save(board=board, created_by=request.user)
        return Response(WikiPageSerializer(page).data, status=status.HTTP_201_CREATED)


class WikiPageDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_page(self, workspace_id, board_id, page_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        return get_object_or_404(WikiPage, id=page_id, board=board), board

    def get(self, request, workspace_id, board_id, page_id):
        page, _ = self._get_page(workspace_id, board_id, page_id, request.user)
        return Response(WikiPageSerializer(page).data)

    def patch(self, request, workspace_id, board_id, page_id):
        page, board = self._get_page(workspace_id, board_id, page_id, request.user)
        _require_board_perm(request.user, board, "edit")
        # Save a revision before updating
        WikiRevision.objects.create(
            page=page, content=page.content, title=page.title, author=request.user
        )
        serializer = WikiPageSerializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, board_id, page_id):
        page, board = self._get_page(workspace_id, board_id, page_id, request.user)
        _require_board_perm(request.user, board, "admin")
        page.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WikiPageRevisionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, page_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        page = get_object_or_404(WikiPage, id=page_id, board=board)
        revisions = page.revisions.select_related("author")[:20]
        return Response(WikiRevisionSerializer(revisions, many=True).data)


class DocumentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        docs = workspace.documents.select_related("created_by")
        return Response(DocumentSerializer(docs, many=True).data)

    def post(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        serializer = DocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_doc(self, workspace_id, doc_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(Document, id=doc_id, workspace=workspace)

    def get(self, request, workspace_id, doc_id):
        doc = self._get_doc(workspace_id, doc_id, request.user)
        return Response(DocumentSerializer(doc).data)

    def patch(self, request, workspace_id, doc_id):
        doc = self._get_doc(workspace_id, doc_id, request.user)
        serializer = DocumentSerializer(doc, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, doc_id):
        doc = self._get_doc(workspace_id, doc_id, request.user)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
