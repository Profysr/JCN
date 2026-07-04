import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const wikiBase = (ws, proj) => `/api/workspaces/${ws}/boards/${proj}/wiki/`;
const docBase = (ws) => `/api/workspaces/${ws}/documents/`;

// ── Wiki pages ────────────────────────────────────────────────────────────────
// The list endpoint returns root-level pages only (parent=null).
// Child pages are fetched individually via the detail key.

export function useWikiPages(workspaceId, boardId) {
  return useQuery({
    queryKey: ["wiki", workspaceId, boardId],
    queryFn: () => api.get(wikiBase(workspaceId, boardId)).then((r) => r.data),
    enabled: !!boardId,
    // Kept live by the board socket (wiki.created/updated/deleted) — see useBoardSocket.
    staleTime: Infinity,
  });
}

export function useWikiPage(workspaceId, boardId, pageId) {
  return useQuery({
    queryKey: ["wiki-page", workspaceId, boardId, pageId],
    queryFn: () =>
      api
        .get(`${wikiBase(workspaceId, boardId)}${pageId}/`)
        .then((r) => r.data),
    enabled: !!pageId,
    staleTime: Infinity,
  });
}

export function useCreateWikiPage(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(wikiBase(workspaceId, boardId), data).then((r) => r.data),
    onSuccess: (page) => {
      // Seed the detail cache — avoids a GET on immediate navigation to the new page.
      qc.setQueryData(["wiki-page", workspaceId, boardId, page.id], page);
      // Only append to the root list when this is a root page (no parent).
      if (!page.parent) {
        qc.setQueryData(["wiki", workspaceId, boardId], (old) =>
          old ? [...old, page] : [page],
        );
      }
    },
  });
}

export function useUpdateWikiPage(workspaceId, boardId, pageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`${wikiBase(workspaceId, boardId)}${pageId}/`, data)
        .then((r) => r.data),
    onSuccess: (page) => {
      qc.setQueryData(["wiki-page", workspaceId, boardId, pageId], page);
      // Update in the root list only if this page is at root level.
      if (!page.parent) {
        qc.setQueryData(["wiki", workspaceId, boardId], (old) =>
          old ? old.map((p) => (p.id === pageId ? page : p)) : old,
        );
      }
    },
  });
}

export function useDeleteWikiPage(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId) =>
      api.delete(`${wikiBase(workspaceId, boardId)}${pageId}/`),
    onSuccess: (_, pageId) => {
      qc.removeQueries({
        queryKey: ["wiki-page", workspaceId, boardId, pageId],
      });
      // Remove immediately for instant feedback.
      qc.setQueryData(["wiki", workspaceId, boardId], (old) =>
        old ? old.filter((p) => p.id !== pageId) : old,
      );
      // Background refetch: the backend uses SET_NULL on children, so any
      // child pages of the deleted page become root-level and must appear.
      qc.invalidateQueries({ queryKey: ["wiki", workspaceId, boardId] });
    },
  });
}

export function useWikiRevisions(workspaceId, boardId, pageId) {
  return useQuery({
    queryKey: ["wiki-revisions", workspaceId, boardId, pageId],
    queryFn: () =>
      api
        .get(`${wikiBase(workspaceId, boardId)}${pageId}/revisions/`)
        .then((r) => r.data),
    enabled: !!pageId,
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────

function useDocuments(workspaceId) {
  return useQuery({
    queryKey: ["documents", workspaceId],
    queryFn: () => api.get(docBase(workspaceId)).then((r) => r.data),
    enabled: !!workspaceId,
  });
}

function useDocument(workspaceId, docId) {
  return useQuery({
    queryKey: ["document", workspaceId, docId],
    queryFn: () =>
      api.get(`${docBase(workspaceId)}${docId}/`).then((r) => r.data),
    enabled: !!docId,
  });
}

function useCreateDocument(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(docBase(workspaceId), data).then((r) => r.data),
    onSuccess: (doc) => {
      qc.setQueryData(["document", workspaceId, doc.id], doc);
      qc.setQueryData(["documents", workspaceId], (old) =>
        old ? [...old, doc] : [doc],
      );
    },
  });
}

function useUpdateDocument(workspaceId, docId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.patch(`${docBase(workspaceId)}${docId}/`, data).then((r) => r.data),
    onSuccess: (doc) => {
      qc.setQueryData(["document", workspaceId, docId], doc);
      qc.setQueryData(["documents", workspaceId], (old) =>
        old ? old.map((d) => (d.id === docId ? doc : d)) : old,
      );
    },
  });
}

function useDeleteDocument(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId) => api.delete(`${docBase(workspaceId)}${docId}/`),
    onSuccess: (_, docId) => {
      qc.removeQueries({ queryKey: ["document", workspaceId, docId] });
      qc.setQueryData(["documents", workspaceId], (old) =>
        old ? old.filter((d) => d.id !== docId) : old,
      );
    },
  });
}
