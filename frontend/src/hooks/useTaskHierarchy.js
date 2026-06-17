import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const taskBase = (ws, proj, task) =>
  `/api/workspaces/${ws}/boards/${proj}/tasks/${task}`;

// ── Child tasks ───────────────────────────────────────────────────────────────

export function useChildTasks(workspaceId, boardId, taskId) {
  return useQuery({
    queryKey: ["children", workspaceId, boardId, taskId],
    queryFn: () => api.get(`${taskBase(workspaceId, boardId, taskId)}/children/`).then(r => r.data),
    enabled: !!taskId,
  });
}

export function useCreateChildTask(workspaceId, boardId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`${taskBase(workspaceId, boardId, taskId)}/children/`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children", workspaceId, boardId, taskId] });
      qc.invalidateQueries({ queryKey: ["task-detail", workspaceId, boardId, taskId] });
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
    },
  });
}

export function useAttachChildTask(workspaceId, boardId, parentTaskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (childTaskId) =>
      api.patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${childTaskId}/`, { parent_id: parentTaskId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children", workspaceId, boardId, parentTaskId] });
      qc.invalidateQueries({ queryKey: ["task-detail", workspaceId, boardId, parentTaskId] });
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
    },
  });
}

// ── Clone ─────────────────────────────────────────────────────────────────────

export function useCloneTask(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId) =>
      api.post(`${taskBase(workspaceId, boardId, taskId)}/clone/`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
    },
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

const templateBase = (ws, proj) =>
  `/api/workspaces/${ws}/boards/${proj}/task-templates/`;

export function useTaskTemplates(workspaceId, boardId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["task-templates", workspaceId, boardId],
    queryFn: () => api.get(templateBase(workspaceId, boardId)).then(r => r.data),
    enabled: enabled && !!boardId,
    staleTime: Infinity,
  });
}

export function useCreateTaskTemplate(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(templateBase(workspaceId, boardId), data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-templates", workspaceId, boardId] }),
  });
}

export function useDeleteTaskTemplate(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId) => api.delete(`${templateBase(workspaceId, boardId)}${templateId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-templates", workspaceId, boardId] }),
  });
}

export function useApplyTemplate(workspaceId, boardId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId) =>
      api.post(`${taskBase(workspaceId, boardId, taskId)}/apply-template/`, { template_id: templateId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", workspaceId, boardId, taskId] });
    },
  });
}
