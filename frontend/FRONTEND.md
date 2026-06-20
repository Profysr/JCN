# JCN Frontend Reference

This document is the single source of truth for navigating the frontend. Read it before touching any hook, view, or cache logic. Designed to minimize token consumption on future sessions — use the section headers to jump directly to what you need.

---

## Stack & Infrastructure

| Layer | Tech | File |
|---|---|---|
| HTTP client | Axios | `src/lib/api.js` |
| Server state | TanStack React Query v5 | hooks/* |
| Client state | Zustand | `src/store/authStore.js` |
| Real-time | Native WebSocket | `src/hooks/useWorkspaceSocket.js` |
| Routing | React Router v6 | `src/App.jsx` |
| Environment | Vite env vars | `src/lib/env.js` |

### `src/lib/api.js`
Single Axios instance shared by all hooks.
- Attaches `Authorization: Bearer {token}` on every request (from `localStorage.access_token`).
- On **401**: auto-refreshes via `/api/auth/token/refresh/`, retries the original request once.
- On refresh failure: clears localStorage, redirects to `/login`.

### `src/lib/env.js`
```
BACKEND_URL  = VITE_BACKEND_URL
FRONTEND_URL = VITE_FRONTEND_URL
BACKEND_WS_URL = http→ws / https→wss auto-derived from BACKEND_URL
```

### `src/store/authStore.js` (Zustand, persisted)
State: `user`, `accessToken`, `refreshToken`
Methods: `login()`, `register()`, `logout()`, `fetchMe()`, `setTokens()`, `setUser()`
- `login` / `register` / `logout` all call `queryClient.clear()` to wipe the entire React Query cache.

---

## Query Key Registry

The master index of every React Query key used in the codebase. Prefix-match invalidation: calling `invalidateQueries({ queryKey: ["tasks", ws, proj] })` hits **all** keys that start with that prefix, including the 4-element filtered variant.

```
# Auth / User
["me"]

# Workspaces
["workspaces"]
["workspace", workspaceId]
["workspace-members", workspaceId]
["onboarding", workspaceId]

# Boards (named "projects" in URLs)
["boards", workspaceId]
["board", workspaceId, boardId]
["project-members", workspaceId, boardId]
["statuses", workspaceId, boardId]
["saved-views", workspaceId, boardId]
["labels", workspaceId, boardId]

# Tasks
["tasks", workspaceId, boardId, filters]    ← 4-element; use 3-element prefix to invalidate all variants
["task-detail", workspaceId, boardId, taskId]
["subtasks", workspaceId, boardId, taskId]
["comments", workspaceId, boardId, taskId]  ← infinite query
["activities", workspaceId, boardId, taskId] ← infinite query
["children", workspaceId, boardId, taskId]
["dependencies", workspaceId, boardId, taskId]
["attachments", workspaceId, boardId, taskId]
["approvals", workspaceId, boardId, taskId]
["fields", workspaceId, boardId]
["field-values", workspaceId, boardId, taskId]

# Sprints
["sprints", workspaceId, boardId]           ← list (name, dates, status)
["sprint", workspaceId, boardId, sprintId]  ← detail (task counts, completion)
["burndown", workspaceId, boardId, sprintId]

# Automations
["automations", workspaceId, boardId]

# Forms / Wiki
["forms", workspaceId, boardId]
["form", workspaceId, boardId, formId]
["form-submissions", workspaceId, boardId, formId]
["wiki", workspaceId, boardId]
["wiki-page", workspaceId, boardId, pageId]
["wiki-revisions", workspaceId, boardId, pageId]
["documents", workspaceId]
["document", workspaceId, docId]

# Inbox / Notifications
["inbox", workspaceId]  (+ tab, eventType, limit in the key via factory)
["inbox-unread-count", workspaceId]

# Integrations / API keys / Webhooks
["integrations", workspaceId]
["integrations", workspaceId, "mappings", platform?]
["api-keys", workspaceId]
["webhooks", workspaceId]
["webhooks", workspaceId, hookId, "deliveries"]

# Import
["import", workspaceId, "sources"]
["import", workspaceId, "jobs"]
["import", workspaceId, "jobs", jobId]

# Analytics
["analytics", "overview", workspaceId, boardId]
["analytics", "velocity", workspaceId, boardId, limit]
["analytics", "cycle-time", workspaceId, boardId, days]
["analytics", "lead-time", workspaceId, boardId, days]
["analytics", "throughput", workspaceId, boardId, period, days]
["analytics", "cfd", workspaceId, boardId, days]
["analytics", "burnup", workspaceId, sprintId, boardId, days]
["analytics", "workload-heatmap", workspaceId, boardId, days]
["analytics", "time-in-status", workspaceId, boardId, days]
["analytics", "overdue-aging", workspaceId, boardId]
["analytics", "completion-rate", workspaceId, boardId, limit]
["analytics", "estimation-accuracy", workspaceId, boardId, limit]

# Goals / OKR
["objectives", workspaceId, timePeriod?]

# My Work / Portfolio
["my-work"]
["portfolio", workspaceId]

# Presence
["presence", workspaceId, resourceType, resourceId]
["presence", workspaceId, "all"]
```

---

## Stale Time Reference

How long data is considered fresh before React Query will refetch on next mount/focus.

| staleTime | Keys |
|---|---|
| `Infinity` (never auto-stale) | `workspace`, `workspaces`, `boards`, `board`, `workspace-members`, `labels`, `statuses`, `saved-views`, `onboarding`, `import sources`, `presence` |
| `60_000` (1 min) | `portfolio`, all `analytics` keys, `burndown` |
| `30_000` (30 s) | `inbox`, `inbox-unread-count`, `integrations`, `api-keys`, `sprint detail`, `objectives` |
| `15_000` (15 s) | `import jobs`, `webhook deliveries` |
| default (`0`) | `tasks`, `task-detail`, `sprints list`, `approvals`, `attachments`, `automations`, `forms`, `wiki`, `children`, `dependencies` |

**Rules for choosing:**
- `Infinity`: near-static config (workspace settings, board list, members, labels). Only invalidate on explicit mutation.
- `60s`: aggregate data that changes when tasks change but a 1-min lag is acceptable (analytics, burndown).
- `30s`: user-facing counters and integration status.
- `0` (default): anything task-level — needs to stay fresh.

---

## Hooks — Detailed Reference

### `useWorkspaceSocket.js`

Opens one WebSocket per workspace. Call once at the page level (KanbanPage). All cache mutations happen here for server-pushed events.

WebSocket URL: `ws(s)://BACKEND/ws/workspaces/{workspaceId}/?token={access_token}`

#### Event → Cache Action Map

| Event | Cache action | Keys affected |
|---|---|---|
| `task.created` | `invalidateQueries` | `["tasks", ws, board_id]`, `["sprint", ws, board_id]` |
| `task.updated` | `setQueriesData` (prefix) + `setQueryData` | `["tasks", ws, board_id]`, `["task-detail", ws, board_id, id]`, + invalidates `["sprint", ws, board_id]` |
| `task.moved` | `setQueriesData` (prefix) | `["tasks", ws, board_id]`, + invalidates `["sprint", ws, board_id]` |
| `task.deleted` | `setQueriesData` filter | `["tasks", ws, board_id]`, + invalidates `["sprint", ws, board_id]` |
| `comment.created` | `setQueryData` | `["task-detail", ws, board_id, task_id]` |
| `comment.deleted` | `setQueryData` | `["task-detail", ws, board_id, task_id]` |
| `reaction.updated` | `setQueryData` | `["task-detail", ws, board_id, task_id]` |
| `notification.created` | `invalidateQueries` | `["inbox", ws]`, `["inbox-unread-count", ws]` |
| `approval.created/updated` | `invalidateQueries` | `["approvals", ws, board_id, task_id]`, `["tasks", ws, board_id]` |
| `typing.update` | DOM custom event | `window → "jcn:typing"` |
| `presence.updated` | `invalidateQueries` | `presenceKey(...)`, `["presence", ws, "all"]` |

**Why `setQueriesData` (not `setQueryData`):**
`useTasks` stores data under `["tasks", ws, boardId, filters]` (4-element key). `setQueryData` requires an exact match and would miss the filtered variant. `setQueriesData` with a 3-element prefix hits every active filter combination.

---

### `useTasks.js`

The heaviest hook. All task CRUD + comments + subtasks.

#### Query Key Factories
```js
tasksKey(ws, proj, filters)   → ["tasks", ws, proj, filters]
detailKey(ws, proj, taskId)   → ["task-detail", ws, proj, taskId]
subtasksKey(ws, proj, taskId) → ["subtasks", ws, proj, taskId]
commentsKey(ws, proj, taskId) → ["comments", ws, proj, taskId]
```

#### Queries

| Hook | Key | URL | staleTime | enabled |
|---|---|---|---|---|
| `useTasks` | `tasksKey(ws, proj, filters)` | `GET /tasks/?{qs}` | default | `!!ws && !!proj` |
| `useTaskDetail` | `detailKey(...)` | `GET /tasks/{id}/` | default | `!!taskId` |
| `useTaskSubtasks` | `subtasksKey(...)` | `GET /tasks/{id}/subtasks/` | default | `!!taskId` |
| `useTaskComments` | `commentsKey(...)` | `GET /tasks/{id}/comments/` (cursor) | default | `!!taskId` |
| `useTaskActivities` | `["activities", ws, proj, taskId]` | `GET /tasks/{id}/activities/` (cursor) | default | `!!taskId` |

`useTaskComments` and `useTaskActivities` are **infinite queries**. `getNextPageParam` returns `lastPage.next` (full cursor URL).

#### Filter Builder

`buildTaskParams(filters)` converts the filter object to a URL query string:
- `search`, `sprint`, `start`, `end`
- `priorities[]`, `assignees[]`, `labels[]`, `types[]`, `due[]`
- `pendingMyApproval → pending_approval=true`

#### Mutations

**`useCreateTask`**
- `POST /tasks/`
- onSuccess: invalidates `["tasks", ws, proj]`, `["sprint", ws, proj]`

**`useUpdateTask`** ← used by board-level views (Kanban, Calendar, Gantt)
- `PATCH /tasks/{taskId}/`
- onSuccess: invalidates `["tasks", ws, proj]`, `["children", ws, proj]`, `["sprint", ws, proj]`

**`useUpdateTaskDetail`** ← used by TaskDetailPanel only
- `PATCH /tasks/{taskId}/`
- onSuccess:
  1. `setQueryData(detailKey)` — merges `{ ...old, ...updated }` immediately
  2. `invalidateQueries(["tasks", ws, proj])` — refreshes all list views
  3. `invalidateQueries(["sprint", ws, proj])` — refreshes sprint counts

**`useDeleteTask`**
- `DELETE /tasks/{taskId}/`
- onSuccess: invalidates `["tasks", ws, proj]`, `["sprint", ws, proj]`

**`useMoveTask`** ← Kanban drag-drop, most complex mutation
- `PATCH /tasks/{taskId}/move/` with `{ status_id, order }`
- **Optimistic update:**
  - `onMutate`: `cancelQueries` → snapshot all `["tasks", ws, proj, *]` variants → `setQueriesData` with `{ status_id, order }` immediately
  - `onError`: restores all snapshots (rollback)
  - `onSuccess(data)`:
    1. `setQueriesData(["tasks", ws, proj])` — merges full server response `{ ...t, ...data }`
    2. `setQueryData(detailKey)` — syncs open task detail panel
    3. `setQueriesData(["children", ws, proj])` — syncs any parent-child views
    4. `invalidateQueries(["sprint", ws, proj])` — refreshes sprint counts

**`useCreateComment`**
- `POST /tasks/{taskId}/comments/`
- onSuccess (`setQueryData` only, no invalidate):
  - Top-level: appends to last page of infinite query
  - Reply: nests under parent comment in the page
  - Increments `comment_count` on `detailKey`

**`useDeleteComment`**
- `DELETE /tasks/{taskId}/comments/{commentId}/`
- onSuccess (`setQueryData` only):
  - Filters from pages (top-level) or from parent's replies array
  - Decrements `comment_count`

**`useCreateSubtask`** / **`useToggleSubtask`** / **`useDeleteSubtask`**
- All update `subtasksKey` and `detailKey` directly via `setQueryData`
- All also `invalidateQueries(["tasks", ws, proj])` so task cards (which show subtask counts) refresh

---

### `useSprints.js`

Two separate keys: `sprints` (list) and `sprint` (detail). Note the singular vs plural.

| Hook | Key | staleTime | Notes |
|---|---|---|---|
| `useSprints` | `["sprints", ws, proj]` | default | list of sprint names/dates/status |
| `useSprintDetail` | `["sprint", ws, proj, sprintId]` | `30_000` | task counts, completion %; invalidated by all task mutations |
| `useSprintBurndown` | `["burndown", ws, proj, sprintId]` | `60_000` | analytics endpoint |

**When sprint detail goes stale:**
All task mutations (`create`, `update`, `updateDetail`, `delete`, `move`) and all WebSocket task events invalidate `["sprint", ws, proj]` (prefix match → hits all sprint detail entries for that board).

#### Mutations

| Hook | URL | Invalidates |
|---|---|---|
| `useCreateSprint` | `POST /sprints/` | `["sprints", ws, proj]` |
| `useUpdateSprint` | `PATCH /sprints/{id}/` | `["sprints", ws, proj]`, `["sprint", ws, proj, id]` |
| `useDeleteSprint` | `DELETE /sprints/{id}/` | `["sprints", ws, proj]` |

---

### `useProjects.js` (Boards)

Despite the file name, this manages boards (the backend calls them "projects" in URLs).

| Hook | Key | staleTime |
|---|---|---|
| `useBoards` | `["boards", ws]` | `Infinity` |
| `useBoard` | `["board", ws, boardId]` | `Infinity` |

`useBoard` has `retry: false` — a 403/404 response surfaces immediately (used for the "Access denied" error screen in KanbanPage).

Board mutations also invalidate `["portfolio", ws]` since the portfolio shows board summaries.

---

### `useStatusManagement.js`

```
["statuses", workspaceId, boardId]   staleTime: Infinity, refetchOnWindowFocus: false
```

- `useCreateStatus` invalidates `["board", ws, boardId]` — **not** the statuses key. The board refetch returns statuses embedded in the board response.
- `useBatchSaveStatuses` uses `setQueryData` directly (no invalidate) — the PUT response is the new statuses array.

---

### `useMembers.js`

```
["workspace-members", workspaceId]   staleTime: Infinity
```

Members list only changes via explicit mutations. Every mutation invalidates the members key.

`useAcceptInvite(token)` invalidates both `["workspaces"]` and `["workspace-members"]` (prefix only, no workspaceId — affects all workspaces in cache).

---

### `useLabels.js`

```
["labels", workspaceId, boardId]   staleTime: Infinity
```

Labels are static config. Create/delete both invalidate the labels key.

---

### `useSavedViews.js`

```
["saved-views", workspaceId, boardId]   staleTime: Infinity
```

Only changes via create/delete. Both invalidate the key.

---

### `usePresence.js`

Presence is special — it's both query-driven and effect-driven.

- `usePresence(ws, type, id)`: polls every 90s (`refetchInterval: 90_000`), `staleTime: Infinity` (never stale between polls).
- `useWorkspaceOnlineUsers(ws)`: same polling pattern, key `["presence", ws, "all"]`.
- `useAnnouncePresence(ws, type, id)`: side-effect only hook. POSTs on mount, sends heartbeat every 90s, DELETEs on unmount. Then invalidates `presenceKey`.
- WebSocket `presence.updated` events also invalidate presence keys.

---

### `useWorkspace.js`

```
["workspaces"]                          staleTime: Infinity, refetchOnWindowFocus: false
["workspace", workspaceId]              staleTime: Infinity, refetchOnWindowFocus: false
```

`useUpdateWorkspace` both invalidates `["workspaces"]` and does `setQueryData` for the single workspace.

---

### `useInbox.js`

```
["inbox", workspaceId, tab, eventType, limit]   staleTime: 30_000
["inbox-unread-count", workspaceId]             staleTime: 30_000
```

Inbox key factory filters out falsy params. Both mutations (`useUpdateInboxItem`, `useBulkUpdateInbox`) invalidate both keys. WebSocket `notification.created` also invalidates both.

---

### `useAnalyticsV2.js`

All analytics hooks share a `STALE = 60_000` constant. All keys follow the pattern `["analytics", metricName, workspaceId, ...params]`. None are invalidated by task mutations — they're read-only aggregates that tolerate a 1-minute lag.

URLs follow: `/api/workspaces/{workspaceId}/analytics/{metric_name}/` with params.

---

### `useCustomFields.js`

```
["fields", workspaceId, boardId]
["field-values", workspaceId, boardId, taskId]
```

`useUpsertFieldValue` uses `setQueryData` on `task-detail` (upsert: finds by field_id and replaces, or appends). No invalidation — field values live inside the task detail cache.

---

### `useApprovals.js`

```
["approvals", workspaceId, boardId, taskId]   no staleTime
```

WebSocket `approval.created` / `approval.updated` events invalidate both `["approvals", ...]` and `["tasks", ...]`. This is because approvals affect the `pending_approval_count` field on task cards.

---

### `useTaskHierarchy.js`

```
["children", workspaceId, boardId, taskId]
```

`useChildTasks(ws, boardId, taskId)` — `enabled: !!taskId`. Pass `null` as `taskId` to keep the hook mounted but dormant (no fetch). **ListView uses this pattern**: each `TaskRow` calls `useChildTasks(ws, boardId, expanded ? task.id : null)` so the fetch fires only when the user clicks expand. The expand button is shown when `task.child_count > 0`; the skeleton renders exactly `task.child_count` placeholder rows while loading.

`useCreateChildTask` and `useAttachChildTask` invalidate three keys: `children`, `task-detail`, and the parent `tasks` list.

`useCloneTask` only invalidates `["tasks", ws, proj]`.

---

### `useDependencies.js`

```
["dependencies", workspaceId, boardId, taskId]
```

Add/remove both invalidate this key only.

---

### `useAttachments.js`

```
["attachments", workspaceId, boardId, taskId]
```

Upload/delete both invalidate this key only.

---

### `useCommentReactions.js`

`useToggleReaction` updates `["task-detail", ws, proj, taskId]` via `setQueryData` — it replaces the reactions array on the matching comment. No invalidation (no round-trip).

---

### `useAutomations.js`

```
["automations", workspaceId, boardId]
```

All mutations invalidate this key.

---

### `useForms.js`

```
["forms", workspaceId, boardId]
["form", workspaceId, boardId, formId]
["form-submissions", workspaceId, boardId, formId]
```

`useUpdateForm` invalidates both the list and the single form. `useUpdateFormFields` (PUT, replaces fields array) invalidates only the single form. `useUpdateSubmissionStatus` invalidates submissions only.

---

### `useWiki.js`

```
["wiki", workspaceId, boardId]
["wiki-page", workspaceId, boardId, pageId]
["wiki-revisions", workspaceId, boardId, pageId]
["documents", workspaceId]
["document", workspaceId, docId]
```

`useUpdateWikiPage` invalidates both the page and the list. Revisions are read-only (no mutations). Documents follow the same pattern as wiki pages.

---

### `useWebhooks.js`

```
["webhooks", workspaceId]
["webhooks", workspaceId, hookId, "deliveries"]   staleTime: 15_000
```

`useTestWebhook` fires and forgets — no cache change. Deliveries have a 15s stale time.

---

### `useIntegrations.js`

```
["integrations", workspaceId]                           staleTime: 30_000, retry: false
["integrations", workspaceId, "mappings", platform?]    staleTime: 30_000
```

All integrations mutations (save/disconnect Teams, Google Chat) invalidate the top-level key. Channel mapping mutations use 3-element prefix `["integrations", ws, "mappings"]` to invalidate all platform variants at once.

---

### `useAPIKeys.js`

```
["api-keys", workspaceId]   staleTime: 30_000
```

Create/revoke both invalidate this key.

---

### `useImport.js`

```
["import", workspaceId, "sources"]   staleTime: Infinity
["import", workspaceId, "jobs"]      staleTime: 15_000
["import", workspaceId, "jobs", jobId]  refetchInterval: 2000 when status === "importing"
```

`useImportJob` polls every 2 seconds while an import is running. Sources never change so `Infinity` is correct.

---

### `useProjectPermissions.js`

Not a React Query hook — wraps `useBoard()` and derives permissions.

```js
// Returns
{
  role,         // "admin" | "member" | "viewer" | null
  isLoaded,     // false until board data arrives
  canView,      // always true if isLoaded
  canEdit,      // role !== "viewer"
  canDelete,    // canEdit
  canAdmin,     // role === "admin"
  isViewer,     // role === "viewer"
}
```

---

### `useGanttModel.js`

Pure computation — no API calls.

Exports:
- `GROUP_H = 40`, `ROW_H = 36` — pixel heights for canvas rows
- `parseDate(str)`, `dateKey(date)`, `daysBetween(a, b)`, `addDays(date, n)` — date utils
- `computeRange(tasks, sprints)` — returns `{ start, end }` date range with padding
- `computeCriticalPath(tasks)` — DP algorithm returning longest dependency chain
- `useGanttModel(tasks, sprints, collapsedSet, statuses)` — returns `{ rows, undated, totalH }`
- `firstVisibleIdx(rows, scrollTop)` — binary search for virtualized scrolling

---

### `useProjectMembers.js`

```
["project-members", workspaceId, boardId]
```

Board-level member management. Separate from workspace members. `useBulkAddBoardMembers` is for adding multiple members at once (used in the ProjectMembersModal).

---

### `useGoals.js` (OKR)

```
["objectives", workspaceId, timePeriod?]   staleTime: 30_000
```

Key factory filters out falsy `timePeriod`. All mutations (objectives, key results, task links) invalidate the top-level `["objectives", ws]` prefix.

---

### `useMyWork.js`

```
["my-work"]          staleTime: 30_000
["portfolio", ws]    staleTime: 60_000
```

`my-work` is cross-workspace (no workspaceId). Board mutations (create/update) also invalidate `portfolio` since portfolio shows board summaries.

---

### `useOnboarding.js`

```
["onboarding", workspaceId]   staleTime: Infinity, refetchOnWindowFocus: false
```

`useUpdateOnboarding` uses `setQueryData` only — onboarding state never needs a server round-trip after an update.

---

### `useDebounce.js`

```js
const debouncedValue = useDebounce(value, delay = 300)
```

Pure React hook (useState + useEffect). Used in KanbanPage for search: `useDebounce(filters.search, 350)`.

---

### `useKeyboardShortcuts.js`

Global keyboard shortcut manager. Not React Query.

Shortcuts:
- `Ctrl/Cmd+K` — command palette
- `?` — help modal
- `c` — create task (fires `window.dispatchEvent(new CustomEvent("jcn:create-task"))`)
- `/` — focus search
- `g p` — go to projects
- `g d` — go to dashboard
- `g m` — go to my work
- `g i` — go to inbox
- `g a` — go to analytics
- `g g` — go to goals

KanbanPage listens for `jcn:create-task` to open CreateTaskModal.

---

## Data Flow — View Layer

All views live inside `KanbanPage.jsx` as conditional renders (no unmount on view switch). `allTasks` is fetched once at the page level and passed as props.

```
KanbanPage
  useTasks(ws, boardId, apiFilters)  → allTasks
  useStatuses(ws, boardId)           → statuses
  useMembers(ws)                     → members
  useSprints(ws, boardId, enabled)   → sprints  (only when view ∈ sprint|list|timeline)
  useLabels(ws, boardId)             → labels
  useBoard(ws, boardId)              → board
  useBoardPermissions(ws, boardId)   → perms

  ├── KanbanView   (DragDropContext + KanbanColumn[])     receives: statuses, tasks filtered by status
  ├── ListView     (table)                                receives: allTasks, statuses, members, workspaceId, boardId
  │     └── TaskRow (per root task)                      lazily calls useChildTasks when expanded; skeleton uses task.child_count rows
  ├── SprintView                                          receives: allTasks, statuses, members
  │     └── useSprintDetail(ws, boardId, activeSprintId) — sprint metadata only (not tasks)
  │         tasks = allTasks.filter(t => t.sprint_id === activeSprint.id)
  ├── CalendarView                                        receives: allTasks, statuses
  └── GanttView                                          receives: allTasks, statuses, members, sprints
        └── useGanttModel()  (pure computation, no API)

TaskDetailPanel  (Suspense-lazy, shown as modal overlay)
  useTaskDetail(ws, boardId, taskId)
  useUpdateTaskDetail(ws, boardId, taskId)    ← all task field edits go through this
  useTaskComments / useTaskActivities         ← infinite queries
  useApprovals / useAttachments / useDependencies / useChildTasks / useCustomFields
```

**Key insight:** All views read `allTasks` from a single React Query entry. When that entry is invalidated and refetched, all views update simultaneously. There is no per-view separate fetch.

---

## Cache Update Strategies

### `invalidateQueries`
Marks the cache stale and triggers a background refetch. The component immediately re-renders with the old data, then re-renders again with fresh data when the fetch resolves.

Use when: data shape is unknown/unpredictable (e.g., `task.created` — we don't know if the new task passes the current filter), or when the server computes aggregates (sprint counts, board stats).

### `setQueryData`
Writes directly into the cache, no network round-trip. The component re-renders immediately with the new value.

Use when: you have the exact new state in hand and the shape matches the existing cache entry. Examples: comment optimistic append, field value upsert, onboarding state update.

### `setQueriesData`
Same as `setQueryData` but uses prefix matching to update multiple cache entries at once.

Use when: the same entity exists in multiple filtered variants (e.g., `["tasks", ws, proj, {priorities: ["high"]}]` and `["tasks", ws, proj, {}]` both need the moved task updated).

### Optimistic Updates (`onMutate` / `onError`)
Used only in `useMoveTask`. Pattern:
1. `cancelQueries` — stop any in-flight refetch that would overwrite your optimistic state
2. `getQueriesData` — snapshot current state for rollback
3. `setQueriesData` — apply the expected result immediately
4. `onError`: restore all snapshots
5. `onSuccess`: merge full server response (which may differ from optimistic state)

---

## When to Invalidate Which Key

Quick reference for when you're writing a new mutation or adding a new feature:

| Change | Keys to invalidate or update |
|---|---|
| Task field changed (assignee, dates, priority, sprint) | `["tasks", ws, proj]`, `["sprint", ws, proj]` |
| Task status changed | `["tasks", ws, proj]`, `["sprint", ws, proj]` |
| Task created | `["tasks", ws, proj]`, `["sprint", ws, proj]` |
| Task deleted | `["tasks", ws, proj]`, `["sprint", ws, proj]` |
| Task moved (Kanban drag) | `setQueriesData` on `["tasks"]` + `["sprint"]` invalidate |
| Comment added/deleted | `setQueryData` on `["task-detail"]` only |
| Subtask added/toggled/deleted | `setQueryData` on `["subtasks"]` + `["task-detail"]` + invalidate `["tasks"]` |
| Child task created/attached | `["children"]`, `["task-detail"]`, `["tasks"]` |
| Sprint created/deleted | `["sprints"]` (list only) |
| Sprint updated | `["sprints"]` + `["sprint", ws, proj, id]` |
| Board member added/removed | `["project-members", ws, proj]` |
| Workspace member added/removed | `["workspace-members", ws]` |
| Label created/deleted | `["labels", ws, proj]` |
| Status created | `["board", ws, proj]` (board embeds statuses) |
| Statuses bulk-saved | `setQueryData` on `["statuses", ws, proj]` |
| Board created/updated | `["boards", ws]`, `["portfolio", ws]` |

---

## Infinite Queries

Two infinite queries exist:

**`useTaskComments`** — key `["comments", ws, proj, taskId]`
- Each page: `{ results: Comment[], next: string | null, previous: string | null }`
- `getNextPageParam`: `lastPage.next` (full URL with cursor)
- Mutations update cache directly via `setQueryData` (no refetch)

**`useTaskActivities`** — key `["activities", ws, proj, taskId]`
- Same pagination shape
- Read-only — no mutations

When writing to an infinite query cache (e.g., appending a new comment), iterate `old.pages` and mutate the last page's `results` array. Never invalidate these — they'd reset to page 1 and lose scroll position.

---

## WebSocket Custom Events (DOM)

Some WebSocket events bypass React Query and go to the DOM directly.

| WS Event | DOM Event | Listener |
|---|---|---|
| `typing.update` | `jcn:typing` | TaskDetailPanel |
| *(keyboard shortcut)* | `jcn:create-task` | KanbanPage |

---

## Common Pitfalls

1. **Using `setQueryData` instead of `setQueriesData` for task lists** — `useTasks` uses a 4-element key with a filters object. An exact-match `setQueryData(["tasks", ws, proj])` writes to a ghost entry nobody reads. Always use `setQueriesData` with a 3-element prefix.

2. **Not invalidating `["sprint", ws, proj]` on task mutations** — Sprint detail holds task counts/completion that become stale when tasks change. Every task mutation must invalidate this key.

3. **Adding `staleTime: Infinity` to dynamic data** — Only use `Infinity` for config that changes exclusively through mutations you control (labels, statuses, members). Never use it for task-derived data.

4. **Invalidating comment/subtask/activity queries unnecessarily** — These are updated in-place via `setQueryData`. Calling `invalidateQueries` on them resets the infinite scroll position and causes a flash.

5. **Not cancelling in-flight queries before an optimistic update** — If you do an optimistic `setQueriesData` without first calling `cancelQueries`, the in-flight refetch can overwrite your optimistic state when it resolves.

6. **Forgetting the detail cache when a mutation returns the full updated task** — `useUpdateTaskDetail` and `useMoveTask.onSuccess` both call `setQueryData(detailKey)` to sync the open task panel. If you add a new mutation that changes a task, do the same.

---

## Dead Code — Unused Pages & Hooks

These files exist in the repo but are not reachable at runtime. All confirmed by checking `App.jsx` routes and grepping for imports across the full `src/` tree.

---

### Pages

#### `src/pages/projects/AutomationsPage.jsx`
**Status:** Intentionally disabled — import and route both commented out in `App.jsx`.

```js
// App.jsx line 26
// ‼️ Automation disabled — const AutomationsPage = lazy(() => import("@/pages/projects/AutomationsPage"));

// App.jsx lines 111-115
{/* ‼️ Automation disabled
<Route path="boards/:boardId/automations" element={<AutomationsPage />} />
*/}
```

What it does: full automation rule builder — triggers (task created/status changed/etc.), conditions, and actions (assign user, move status, send notification). The backend `useAutomations.js` hook is also dead because of this (see Hooks section below).

**Safe to delete?** Yes, when you're ready to rebuild automations from scratch (likely using Redis queues per the CLAUDE.md note). Keep the file if you plan to reference the UI logic.

---

#### `src/pages/projects/RoadmapPage.jsx`
**Status:** Superseded — import and route both commented out in `App.jsx`.

```js
// App.jsx line 23
// ‼️ Merged this view into Timeline view - const RoadmapPage = lazy(() => import("@/pages/projects/RoadmapPage"));

// App.jsx line 118
{/* <Route path="roadmap" element={<RoadmapPage />} /> */}
```

What it does: sprint-centric timeline — horizontal bar chart of sprints with tasks as rows, drag to reschedule. This functionality was merged into `GanttView` (the Timeline tab in KanbanPage).

**Safe to delete?** Yes. GanttView covers this use case.

---

#### `src/pages/workspace/InboxPage.jsx`
**Status:** Built but never routed — no route exists in `App.jsx`, no import anywhere.

What it does: a full inbox UI — tabbed view (all / assigned / mentioned / watching), filter by event type, individual item actions (mark read, archive, snooze), bulk actions. The underlying hooks (`useInbox`, `useInboxUnreadCount`, `useUpdateInboxItem`, `useBulkUpdateInbox`) are **alive** — they power the notification bell and sidebar unread count. Only the page itself is unreachable.

**Safe to delete?** Only if you don't plan to ship an `/inbox` route. If you want to add inbox as a page, the component is ready — just add a route in `App.jsx` and a nav link.

---

#### `src/pages/projects/AccessDeniedPage.jsx`
**Status:** Orphaned — never imported, no route.

What it does: a 403 error screen with a "Request access" button and the board name displayed.

**Safe to delete?** Yes. The board 403 case is already handled inline inside `KanbanPage.jsx` (the `boardError` block that checks `is403` / `is404`).

---

### Hooks

#### `src/hooks/useAutomations.js`
**Status:** Dead — its only consumer is the disabled `AutomationsPage.jsx`.

Grep confirms zero active imports:
```
useAutomations  →  found only in: useAutomations.js, AutomationsPage.jsx
```

Exports: `useAutomations`, `useCreateAutomation`, `useUpdateAutomation`, `useDeleteAutomation`
Query key: `["automations", workspaceId, boardId]`

**Safe to delete?** Yes, together with `AutomationsPage.jsx`. Delete both at the same time to avoid confusion. The `["automations", ...]` query key can be removed from the Query Key Registry when you do.

---

### Summary Table

| File | Type | Status | Safe to delete |
|---|---|---|---|
| `pages/projects/AutomationsPage.jsx` | Page | Disabled (commented route) | Yes (with hook) |
| `pages/projects/RoadmapPage.jsx` | Page | Superseded by GanttView | Yes |
| `pages/workspace/InboxPage.jsx` | Page | Built, no route | Only if not planning inbox route |
| `pages/projects/AccessDeniedPage.jsx` | Page | Orphaned, duplicate of inline UI | Yes |
| `hooks/useAutomations.js` | Hook | Only used by dead AutomationsPage | Yes (with page) |

**Hooks confirmed alive despite dead pages:** `useInbox`, `useInboxUnreadCount`, `useUpdateInboxItem`, `useBulkUpdateInbox` — all used by `NotificationBell.jsx` and `Sidebar.jsx`. Do not delete these.
