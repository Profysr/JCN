import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const wikiBase = (ws, proj) => `/api/workspaces/${ws}/boards/${proj}/wiki/`;
const docBase = (ws) => `/api/workspaces/${ws}/documents/`;

// ── Wiki pages ────────────────────────────────────────────────────────────────

export function useWikiPages(workspaceId, boardId) {
  return useQuery({
    queryKey: ["wiki", workspaceId, boardId],
    queryFn: () => api.get(wikiBase(workspaceId, boardId)).then((r) => r.data),
    enabled: !!boardId,
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
  });
}

export function useCreateWikiPage(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(wikiBase(workspaceId, boardId), data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["wiki", workspaceId, boardId] }),
  });
}

export function useUpdateWikiPage(workspaceId, boardId, pageId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`${wikiBase(workspaceId, boardId)}${pageId}/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["wiki-page", workspaceId, boardId, pageId],
      });
      qc.invalidateQueries({ queryKey: ["wiki", workspaceId, boardId] });
    },
  });
}

export function useDeleteWikiPage(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId) =>
      api.delete(`${wikiBase(workspaceId, boardId)}${pageId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["wiki", workspaceId, boardId] }),
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["documents", workspaceId] }),
  });
}

function useUpdateDocument(workspaceId, docId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.patch(`${docBase(workspaceId)}${docId}/`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", workspaceId, docId] });
      qc.invalidateQueries({ queryKey: ["documents", workspaceId] });
    },
  });
}

function useDeleteDocument(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId) => api.delete(`${docBase(workspaceId)}${docId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["documents", workspaceId] }),
  });
}
