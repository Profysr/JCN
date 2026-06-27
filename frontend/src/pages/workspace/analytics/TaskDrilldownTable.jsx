import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { getPriority } from "@/shared/lib/constants";
import { Avatar } from "@/shared/components/ui/avatar";
import { useTaskDrilldown } from "@/shared/hooks/useAnalyticsV2";
import Modal from "@/shared/components/ui/Modal";

// ── Shared styling ──────────────────────────────────────────────────────────

const PRIORITY_BADGE = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  medium:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  no_priority: "bg-muted text-muted-foreground",
};

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d)
    ? "—"
    : d.toLocaleDateString("default", { month: "short", day: "numeric" });
}

function overdueBadge(days) {
  if (!days) return null;
  const tone =
    days > 14
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : days > 7
        ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300";
  return (
    <span
      className={cn(
        "font-bold tabular-nums px-2 py-0.5 rounded-full text-[11px]",
        tone,
      )}
    >
      {days}d
    </span>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

/**
 * Reusable interactive task drill-down. Rows are clickable and deep-link to the
 * board with the task panel open (/w/{ws}/boards/{board_id}?task={id}).
 *
 * Cursor-paginated by ticket via useTaskDrilldown — "Load more" fetches the next
 * cursor page (no offset, so it stays fast at any depth).
 *
 * @param params      forwarded to the backend (filter[…], order, …)
 * @param showOverdue render the "Overdue" column (for the overdue view)
 */
export default function TaskDrilldownTable({
  workspaceId,
  params = {},
  searchable = true,
  showOverdue = false,
  emptyText = "No tasks match this view",
  maxHeight = 460,
}) {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search box → backend `search` param (server-side title match).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const mergedParams = useMemo(
    () => ({ ...params, ...(search ? { search } : {}) }),
    [params, search],
  );

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useTaskDrilldown(workspaceId, { params: mergedParams });

  const rows = useMemo(
    () => (data?.pages || []).flatMap((p) => p.results || []),
    [data],
  );

  const openTask = (t) =>
    navigate(`/w/${workspaceId}/boards/${t.board_id}?task=${t.id}`);

  return (
    <div className="space-y-3">
      {/* Search + count */}
      <div className="flex items-center gap-2">
        {searchable && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tasks…"
              className="text-xs bg-background border border-border rounded-lg pl-8 pr-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring w-48"
            />
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} loaded{hasNextPage ? "+" : ""}
        </span>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-9 bg-muted animate-pulse rounded"
              style={{
                opacity: 0.35 + i * 0.04,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      ) : !rows.length ? (
        <p className="text-xs text-muted-foreground py-10 text-center">
          {emptyText}
        </p>
      ) : (
        <>
          <div
            className="overflow-auto rounded-lg border border-border"
            style={{ maxHeight }}
          >
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border sticky top-0 z-10">
                <tr>
                  <Th>Task</Th>
                  <Th>Board</Th>
                  <Th>Assignee</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Due</Th>
                  {showOverdue && <Th>Overdue</Th>}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => {
                  const pri = getPriority(t.priority);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => openTask(t)}
                      className="group cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-2.5 px-3 max-w-[260px]">
                        <p
                          className="font-medium truncate text-foreground"
                          title={t.title}
                        >
                          {t.title}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                        {t.board || "—"}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {t.assignee ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar
                              user={t.assignee}
                              name={t.assignee.name}
                              size="xs"
                            />
                            <span className="text-foreground">
                              {t.assignee.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap",
                            PRIORITY_BADGE[t.priority] ||
                              PRIORITY_BADGE.no_priority,
                          )}
                        >
                          {pri?.label || t.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {t.status ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: t.status.color }}
                            />
                            {t.status.name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.due_date)}
                      </td>
                      {/* {showOverdue && (
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {overdueBadge(t.days_overdue)}
                        </td>
                      )} */}
                      <td className="py-2.5 px-2 text-right">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted border border-border rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {isFetchingNextPage && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
      {children}
    </th>
  );
}

export function TaskDrilldownModal({
  open,
  onClose,
  workspaceId,
  title,
  description,
  params = {},
  showOverdue = false,
}) {
  if (!open) return null;
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      description={description}
      showFooter={false}
      maxWidth="920px"
    >
      <div className="p-4">
        <TaskDrilldownTable
          workspaceId={workspaceId}
          params={params}
          showOverdue={showOverdue}
        />
      </div>
    </Modal>
  );
}
