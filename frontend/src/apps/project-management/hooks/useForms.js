import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const formBase = (ws, proj) => `/api/workspaces/${ws}/boards/${proj}/forms/`;

// ── Public (unauthenticated) form endpoints ──────────────────────────────────
// Token-scoped, no workspace/board. Used by the standalone PublicFormPage.

export function usePublicForm(formToken) {
  return useQuery({
    queryKey: ["public-form", formToken],
    queryFn: () => api.get(`/api/forms/${formToken}/`).then((r) => r.data),
    enabled: !!formToken,
  });
}

export function useSubmitPublicForm(formToken) {
  return useMutation({
    mutationFn: (payload) =>
      api.post(`/api/forms/${formToken}/submit/`, payload).then((r) => r.data),
  });
}

export function useForms(workspaceId, boardId) {
  return useQuery({
    queryKey: ["forms", workspaceId, boardId],
    queryFn: () => api.get(formBase(workspaceId, boardId)).then((r) => r.data),
    enabled: !!boardId,
    // Kept live by the board socket (form.created/updated/deleted) — see useBoardSocket.
    staleTime: Infinity,
  });
}

export function useForm(workspaceId, boardId, formId) {
  return useQuery({
    queryKey: ["form", workspaceId, boardId, formId],
    queryFn: () =>
      api
        .get(`${formBase(workspaceId, boardId)}${formId}/`)
        .then((r) => r.data),
    enabled: !!formId,
    staleTime: Infinity,
  });
}

export function useCreateForm(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(formBase(workspaceId, boardId), data).then((r) => r.data),
    onSuccess: (form) => {
      qc.setQueryData(["form", workspaceId, boardId, form.id], form);
      qc.setQueryData(["forms", workspaceId, boardId], (old) =>
        old ? [...old, form] : [form],
      );
    },
  });
}

export function useUpdateForm(workspaceId, boardId, formId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`${formBase(workspaceId, boardId)}${formId}/`, data)
        .then((r) => r.data),
    onSuccess: (form) => {
      qc.setQueryData(["form", workspaceId, boardId, formId], form);
      qc.setQueryData(["forms", workspaceId, boardId], (old) =>
        old ? old.map((f) => (f.id === formId ? form : f)) : old,
      );
    },
  });
}

export function useDeleteForm(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId) =>
      api.delete(`${formBase(workspaceId, boardId)}${formId}/`),
    onSuccess: (_, formId) => {
      qc.removeQueries({ queryKey: ["form", workspaceId, boardId, formId] });
      qc.setQueryData(["forms", workspaceId, boardId], (old) =>
        old ? old.filter((f) => f.id !== formId) : old,
      );
    },
  });
}

export function useUpdateFormFields(workspaceId, boardId, formId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields) =>
      api
        .put(`${formBase(workspaceId, boardId)}${formId}/fields/`, fields)
        .then((r) => r.data),
    // Response is the full FormSerializer — patch both caches in one pass.
    onSuccess: (form) => {
      qc.setQueryData(["form", workspaceId, boardId, formId], form);
      qc.setQueryData(["forms", workspaceId, boardId], (old) =>
        old ? old.map((f) => (f.id === formId ? form : f)) : old,
      );
    },
  });
}

export function useFormSubmissions(workspaceId, boardId, formId) {
  return useQuery({
    queryKey: ["form-submissions", workspaceId, boardId, formId],
    queryFn: () =>
      api
        .get(`${formBase(workspaceId, boardId)}${formId}/submissions/`)
        .then((r) => r.data),
    enabled: !!formId,
    // Kept live by the board socket (form.submission_created/updated) — see useBoardSocket.
    staleTime: Infinity,
  });
}

export function useUpdateSubmissionStatus(workspaceId, boardId, formId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`${formBase(workspaceId, boardId)}${formId}/submissions/`, data)
        .then((r) => r.data),
    // Response is the single updated submission — patch it in the list in-place.
    onSuccess: (updated) => {
      qc.setQueryData(
        ["form-submissions", workspaceId, boardId, formId],
        (old) => (old ? old.map((s) => (s.id === updated.id ? updated : s)) : old),
      );
    },
  });
}
