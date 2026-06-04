import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * Search tasks and projects across all workspaces.
 *
 * Supported params (all optional, at least one required):
 *   q          — text search on title + description
 *   task_type  — filter by task type  (e.g. "bug", "feature")
 *   assignee   — filter by assignee name / email (contains)
 *   priority   — filter by priority   (e.g. "urgent", "high")
 *   overdue    — boolean: tasks where due_date < today
 *   today      — boolean: tasks where due_date = today
 */
export const useSearch = (query, filters = {}) => {
  const q = (query || "").trim();

  const params = new URLSearchParams();
  if (q)                params.set("q",         q);
  if (filters.task_type) params.set("task_type", filters.task_type);
  if (filters.assignee)  params.set("assignee",  filters.assignee);
  if (filters.priority)  params.set("priority",  filters.priority);
  if (filters.overdue)   params.set("overdue",   "true");
  if (filters.today)     params.set("today",     "true");

  const hasQuery = q.length >= 2
    || !!filters.task_type
    || !!filters.assignee
    || !!filters.priority
    || !!filters.overdue
    || !!filters.today;

  return useQuery({
    queryKey: ["search", q, filters.task_type, filters.assignee, filters.priority, filters.overdue, filters.today],
    queryFn: ({ signal }) =>
      api.get(`/api/search/?${params.toString()}`, { signal }).then(r => r.data),
    enabled: hasQuery,
    staleTime: 30_000,
    placeholderData: prev => prev,
  });
};
