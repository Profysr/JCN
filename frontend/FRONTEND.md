# JCN Frontend Reference

This document is the single source of truth for navigating the frontend. Read it before touching any hook, view, or cache logic. Designed to minimize token consumption on future sessions — use the section headers to jump directly to what you need.

---

## Stack & Infrastructure

| Layer        | Tech                    | File                                       |
| ------------ | ----------------------- | ------------------------------------------ |
| HTTP client  | Axios                   | `src/shared/lib/api.js`                    |
| Server state | TanStack React Query v5 | `src/apps/*/hooks/*`, `src/shared/hooks/*` |
| Client state | Zustand                 | `src/store/authStore.js`                   |
| Real-time    | Native WebSocket        | `src/shared/hooks/useWorkspaceSocket.js`   |
| Routing      | React Router v6         | `src/App.jsx`                              |
| Environment  | Vite env vars           | `src/shared/lib/env.js`                    |

> **Path note:** Some older sections below still reference legacy `src/lib/`, `src/hooks/`, `src/components/`, `src/pages/` paths. Since vB.0 these live under either `src/shared/` (cross-app primitives, layout, lib, shared hooks) or `src/apps/<module>/` (feature code). When a path looks stale, resolve it via the Directory Architecture map below.

---

## Directory Architecture (`src/apps/` modular layout)

Since **vB.0** the frontend is feature-sliced. Each product module is a self-contained entity that ships and could be extracted independently.

```
src/apps/project-management/   — PM: boards, tasks, sprints, kanban, gantt, wiki, forms, time
   ├── pages/        KanbanPage, BoardsPage, WikiPage, FormsPage, …
   ├── components/   tasks/*, projects/*, GettingStartedChecklist
   └── hooks/        useTasks, useBoards, useSprints, useBoardMembers, useBoardPermissions, useBulkActions, useBoardShortcuts, … (see Hooks reference)
src/apps/org-structure/        — Org: departments, teams, org chart, job titles, profiles
   ├── pages/        DepartmentsPage, TeamsPage, OrgChartPage
   ├── components/   GettingStartedChecklist
   └── hooks/        useOrg.js (all org data hooks)
src/apps/hr-management/        — HR: leave, attendance, HR dashboard, employee docs/notes
   ├── pages/        HRDashboardPage, LeavePage, AttendancePage, MemberDetailPage
   ├── components/   GettingStartedChecklist
   └── hooks/        useLeave, useAttendance, useHRDashboard, useEmployeeDocs, useEmployeeNotes
src/shared/                    — cross-app primitives
   ├── components/   layout/ (AppLayout, Sidebar), CommandPalette, ui/*
   ├── hooks/        useWorkspace, useMembers, useModules, useWorkspaceSocket, usePresence, …
   └── lib/          api.js, env.js, navLinks.js, queryClient.js, constants.js, dateUtils.js, utils.js, boardTypes.js
src/store/                     — Zustand stores (authStore, themeStore) — NOT under shared/
```

### The separation rule (enforced by convention)

> A file under `src/apps/<module>/` may import **only** from its own module folder or from `src/shared/` (and `src/store/`). It must **never** import from a sibling app.

This is what makes a module extractable: cut the `apps/<module>` folder + its `src/shared` dependencies and it stands alone.

**Known exception (downward dependency):** `hr-management/pages/MemberDetailPage.jsx` imports `useOrgProfile` from `@/apps/org-structure/hooks/useOrg`. This mirrors the backend `hr_management → org_structure` `depends_on` edge — HR genuinely builds on org profiles. It is the **only** cross-app import in the tree. If HR is ever extracted standalone, this hook must be promoted into `src/shared/hooks/` (or the org-profile read endpoint re-exposed). Treat any _new_ cross-app import as a violation; route it through `src/shared/` instead.

---

## RBAC — Custom Role Permissions (vD.2)

Workspace-level permission gating. Every workspace member has a `CustomRole` with a `permissions` map.

| Layer                   | Location                                               | Role                                                                               |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Backend source of truth | `backend/workspaces/constants.py` → `PERMISSIONS` dict | key → human description for 22 permission keys                                     |
| System roles            | `SYSTEM_ROLE_PERMISSIONS`                              | Admin (all), Member (default), Viewer (read-only)                                  |
| DB enforcement          | `has_workspace_permission(user, ws, key)`              | called in views                                                                    |
| Frontend hooks          | `src/shared/hooks/useRoles.js`                         | `useRoles`, `useCreateRole`, `useUpdateRole`, `useDeleteRole`, `useAssignRole`     |
| Frontend context        | `src/contexts/PermissionsContext.jsx`                  | `PermissionsProvider` (in AppLayout) + `usePermission()` → `{ can(key), isOwner }` |

**Permission keys** (grouped):

- Projects/Boards: `project.create`, `project.delete`, `project.admin`
- Kanban/Tasks: `task.view`, `task.create`, `task.edit`, `task.delete`, `task.move`, `task.comment`, `sprint.manage`, `automation.manage`
- People & HR: `member.invite`, `member.remove`, `member.view_profile`, `hr.view`, `hr.manage_leave`, `hr.manage_attendance`, `org.view`, `org.manage`
- Workspace: `report.view`, `settings.manage`, `api_keys.manage`

**Nav gating** — `navLinks.js` items carry a `permission` field. `Sidebar` calls `can(item.permission)` and hides items that return false. Workspace owner always passes. Items without a `permission` field are always visible.

**Query key** — `["workspace-roles", workspaceId]` — `staleTime: Infinity`.

**Role assignment** — `POST /api/workspaces/:id/members/:memberId/assign-role/ { role: <uuid> }`. On `MembersPage`, admins see a dropdown of all roles (system roles shown with 🔒 suffix). Selecting fires `useAssignRole`.

**Role builder** — `Settings → Roles & Permissions` section. Left panel = role list with member count. Right panel = name/desc fields + per-permission toggles grouped by category. Dependency rules auto-enable required permissions (e.g. `hr.manage_leave` enables `hr.view`). System roles are read-only; custom roles can be saved, duplicated, or deleted (delete blocked if `member_count > 0`).

---

## Module System (feature gating)

JCN's product areas are licensed as modules. The system spans backend + frontend:

| Layer                      | Location                                      | Role                                                                                                   |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Registry (source of truth) | `backend/core/modules.py` → `MODULE_REGISTRY` | tier (`free`/`pro`/`enterprise`), `always_on`, `depends_on`, icon                                      |
| DB state                   | `WorkspaceModule` model (`workspaces` app)    | which modules each workspace has enabled                                                               |
| Backend enforcement        | `require_module(workspace, key)`              | raises HTTP 403 if disabled; called at the top of every org/HR view                                    |
| Frontend context           | `src/shared/hooks/useModules.js`              | `ModulesContext` (provided in `AppLayout`) + `useModules()` → `{ isEnabled(key), isLoading, modules }` |

**Modules:** `projects` (free, always_on), `org_structure` (pro), `hr_management` (enterprise, `depends_on: ["org_structure"]`), `analytics_advanced` (pro).

### Hooks

- `useModulesQuery(ws)` — `GET /api/workspaces/:id/modules/`, key `["workspace-modules", ws]`, `staleTime 5min`.
- `useToggleModule(ws)` — `PATCH /api/workspaces/:id/modules/:key/ { is_enabled }`; invalidates the modules query.
- `useModules()` — reads `ModulesContext`; call `isEnabled("org_structure")` anywhere under `AppLayout`.

### Frontend module gating (implemented)

The frontend consumes `isEnabled` at the nav layer:

- **Nav items carry a `moduleKey`.** Each per-app `nav.js` (`apps/<module>/nav.js`) tags its items with `moduleKey` (e.g. HR items → `"hr_management"`). Items without one are always shown.
- **`Sidebar` filters by it** — `useModules()` → `isEnabled`; an item renders only when `!item.moduleKey || modulesLoading || isEnabled(item.moduleKey)`. (`modulesLoading` keeps items visible during the first fetch, then they resolve once modules load.)
- **App metadata** lives in `navLinks.js → APP_DEFS` (`key`, `label`, `shortLabel`, `icon`, `landing`, `colors`) — consumed by AppSwitcher, AppLauncher, and SettingsPage. There are no `welcome` or `locked` fields — first-run onboarding is handled by per-module getting-started checklists instead.

---

### `src/shared/lib/api.js`

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
- `register()` checks `data.access` before calling `setTokens` — when `ACCOUNT_EMAIL_VERIFICATION=mandatory` the response has no tokens, only `{"detail": "Verification e-mail sent."}`. Callers check `data.access` to decide whether to navigate to the app or to `/verify-email`.

---

## Shared constants & helpers (DRY — never redefine locally)

> Rule: a value/derivation used by 2+ files lives in `shared/lib` and is **imported**, never re-derived per component. Changing it in one place must propagate everywhere.

### `src/shared/lib/constants.js`

Single source for cross-app config. Each entry ships a getter that always returns a valid object:

- **Priority** — `PRIORITIES` (array w/ `value, label, order, icon, textCls, dotCls, hex, filterActiveCls, modalBtnCls`), `PRIORITY_MAP` (value→object, for keyed lookups), `getPriority(value)`, `PRIORITY_ORDER`. **Do not** build `Object.fromEntries(PRIORITIES.map(...))` in a component — use `getPriority()` / `PRIORITY_MAP`.
- **Task types** — `TASK_TYPES`, `getTaskType(value)`.
- **Sprint status** — `SPRINT_STATUSES`, `getSprintStatus(value)` (returns `{ value, label, badgeCls }`).
- **Colours** — `APP_COLORS` (8-colour palette for projects/roadmap/labels/avatars), `pickColor(str)` (deterministic hash), `LABEL_COLORS`.
- **Project roles / permission matrix** — `PROJECT_ROLES`, `PROJECT_ROLE_WEIGHT`, `ACTION_MIN`, `ROLE_BADGE_VARIANT`, `ROLE_PERMS`, `PERMISSION_MATRIX_ACTIONS` (all derived — edit `ACTION_MIN`, never the matrix).
- **Appearance / focus** — `THEMES`, `ACCENT_COLORS`, `DENSITIES`, `FOCUS_DURATIONS`.

### `src/shared/lib/dateUtils.js`

Shared date primitives (previously duplicated across `useGanttModel`, `CalendarView`, the deleted `RoadmapPage`):

- Labels: `MONTH_NAMES`, `MONTH_NAMES_SHORT`, `DAY_LABELS`.
- Parsing/keys: `parseDate("YYYY-MM-DD")` (TZ-safe, null-safe), `dateKey(date)`.
- Arithmetic: `addDays(date, n)`, `daysBetween(a, b)`.
- Comparisons: `isSameDay(a, b)`, `isToday(date)`.
- Formatting: `formatShortDate(value)` → `"Jun 23"` (accepts string or Date, null-safe).
  > `useGanttModel.js` re-exports `parseDate/dateKey/daysBetween/addDays` from here so `GanttCanvas` (which imports them from the model) keeps working without redefining them.

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
["board-role-definitions", workspaceId, boardId]   ← role→action map, staleTime Infinity

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

# Analytics (V2 — 4 endpoints only; staleTime Infinity, manual Refresh)
["analytics", "summary",   workspaceId, params]            ← KPI counts
["analytics", "aggregate", workspaceId, query]             ← group_by counts (board/status/priority/type/assignee/date)
["analytics", "team",      workspaceId, query, pageUrl]    ← per-member workload + heatmap
["analytics", "tasks",     workspaceId, query]             ← infinite drill-down list
# (The old per-metric keys — velocity, cycle-time, lead-time, throughput, cfd,
#  burnup, workload-heatmap, time-in-status, overdue-aging, completion-rate,
#  estimation-accuracy, overview — were REMOVED with the backend's AnalyticsMetricView.)

# Goals / OKR
["objectives", workspaceId, timePeriod?]

# My Work / Portfolio
["my-work"]
["portfolio", workspaceId]

# Presence
["presence", workspaceId, resourceType, resourceId]
["presence", workspaceId, "all"]

# Org Structure
["org-departments",  workspaceId]
["org-dept-members", workspaceId, deptId]
["org-teams",        workspaceId]
["org-team-members", workspaceId, teamId]
["org-job-titles",   workspaceId]
["org-chart",        workspaceId]
["org-profile",      workspaceId, memberId]

# HR — Leave (src/apps/hr-management/hooks/useLeave.js)
["hr-leave-policies",  workspaceId]
["hr-leave-requests",  workspaceId, statusFilter|"all"]
["hr-leave-balances",  workspaceId]
["hr-whos-off",        workspaceId]

# HR — Attendance (useAttendance.js)
["hr-attendance-policy",  workspaceId]
["hr-attendance-my",      workspaceId, dateFrom, dateTo]
["hr-attendance-list",    workspaceId, employee, dateFrom, dateTo]   ← admin
["hr-attendance-summary", workspaceId, dateFrom, dateTo]
["hr-attendance-qr",      workspaceId]                               ← admin, on-demand

# HR — Dashboard / Lifecycle (useHRDashboard.js, useEmployeeDocs.js, useEmployeeNotes.js)
["hr-dashboard",       workspaceId]
["hr-employee-docs",   workspaceId, memberId]
["hr-employee-notes",  workspaceId, memberId]

# Module system
["workspace-modules",  workspaceId]
```

---

## Stale Time Reference

How long data is considered fresh before React Query will refetch on next mount/focus.

| staleTime                     | Keys                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Infinity` (never auto-stale) | `workspace`, `workspaces`, `boards`, `board`, `workspace-members`, `labels`, `statuses`, `saved-views`, `onboarding`, `import sources`, `presence`, `org-departments`, `org-dept-members`, `org-teams`, `org-team-members`, `org-job-titles`, `hr-leave-policies`, `hr-attendance-policy`, `inbox-unread-count` (event-driven — see useInbox) |
| `60_000` (1 min)              | `portfolio`, `burndown`, `hr-leave-balances`, `hr-whos-off`, `hr-attendance-qr`, `hr-employee-docs`, `hr-employee-notes`                                                                                                                                                                                                                       |
| `Infinity` (analytics V2)     | **All `analytics` keys** (`summary`, `aggregate`, `team`, `tasks`) — never auto-stale; refreshed only by the AnalyticsPage **Refresh** button (`invalidateQueries(["analytics"])`). `STALE = Infinity` in `useAnalyticsV2.js`.                                                                                                                  |
| `5 * 60_000` (5 min)          | `org-chart`, `workspace-modules`                                                                                                                                                                                                                                                                                                              |
| `2 * 60_000` (2 min)          | `org-profile`, `hr-dashboard`                                                                                                                                                                                                                                                                                                                 |
| `30_000` (30 s)               | `inbox`, `integrations`, `api-keys`, `sprint detail`, `hr-leave-requests`, `hr-attendance-my`, `hr-attendance-list`, `hr-attendance-summary`                                                                                                                                                                                                  |
| `15_000` (15 s)               | `import jobs`, `webhook deliveries`                                                                                                                                                                                                                                                                                                           |
| global default `30_000`       | `tasks`, `task-detail`, `sprints list`, `approvals`, `attachments`, `automations`, `forms`, `wiki`, `children`, `dependencies`                                                                                                                                                                                                                |

> **The global default is `30_000`, not `0`** — set in `src/shared/lib/queryClient.js`. Any query with no explicit `staleTime` inherits 30s. (Earlier revisions of this doc said `0`; that was wrong.)

**Rules for choosing:**

- `Infinity`: near-static config (workspace settings, board list, members, labels). Only invalidate on explicit mutation.
- `60s`: aggregate data that changes when tasks change but a 1-min lag is acceptable (analytics, burndown).
- `30s`: user-facing counters, integration status, and task-level data (the global default).
- Never `Infinity` on task-derived data — see Pitfalls.

### `SOCKET_BACKED` — kill redundant focus refetch on socket-driven queries

`src/shared/lib/queryClient.js` exports `SOCKET_BACKED = { refetchOnWindowFocus: false }`. Spread it into any query whose cache is already kept live by a WebSocket event, so RQ's default "refetch on every window focus" (which fires once the 30s `staleTime` lapses) doesn't duplicate what the socket already pushed.

- Keeps `refetchOnReconnect` (RQ default `true`) as the resync safety net for events missed during a dropped socket.
- Does **not** raise `staleTime` — a fresh mount still background-refreshes once.
- **Applied to:** `tasks`, `task-detail`, `comments`, `activities`, `approvals` (board socket); `sprint` detail (invalidated by board socket task events); `inbox` list (workspace socket). `inbox-unread-count` goes further (`staleTime: Infinity`) because the socket _increments it in place_ — a cheap counter, not a payload.
- **Not applied to** queries with no matching WS event — `subtasks`, `attachments`, `dependencies`, custom fields — they keep focus-refetch as their only cross-tab sync.

---

## Hooks — Detailed Reference

### `useWorkspaceSocket.js` _(two scoped connections)_

Connects to the workspace WebSocket. The backend pushes **every** event to every connection; a stable module-level `handle(type, payload, qc, ws)` decides which events each connection acts on, so the two scopes never double-process the same event.

WebSocket URL (both): `ws(s)://BACKEND/ws/workspaces/{workspaceId}/?token={access_token}`

| Hook                     | Mounted in             | Lifetime                   | Handles                                                                                |
| ------------------------ | ---------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `useWorkspaceSocket(ws)` | **`AppLayout`** (once) | whole session, every page  | workspace-wide events: `notification.created`, `objective.*`, `presence.updated`       |
| `useBoardSocket(ws)`     | **`KanbanPage`**       | only while a board is open | board events: `task.*`, `comment.*`, `approval.*`, `typing.update`, `reaction.updated` |

> **Why two connections (vB.x):** workspace-wide events (the inbox badge especially) must stay live on _every_ page, but task/board events only matter while a board is open. Previously the single socket lived only in `KanbanPage`, so the inbox badge fell back to 30s-stale + focus refetch everywhere else. Splitting lets the badge be event-driven app-wide while board traffic stays scoped to the board. The second connection is cheap (same endpoint, scoped handler).

#### Workspace scope — `handleWorkspaceEvent`

| Event                                       | Cache action                                                                      | Keys affected                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `notification.created`                      | `setQueryData` (**increment in place, no GET**) + `invalidateQueries` on the list | `["inbox-unread-count", ws]` (+1), `["inbox", ws]`       |
| `objective.created` / `updated` / `deleted` | `invalidateQueries`                                                               | `["objectives", ws]` (prefix — all time-period variants) |
| `presence.updated`                          | `setQueryData` (upsert/remove user in place)                                      | `presenceKey(...)`, `["presence", ws, "all"]` — **zero GETs**; 90s poll is the resync safety net |

#### Board scope — `handleBoardEvent`

| Event                      | Cache action                               | Keys affected                                                                                            |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `task.created`             | `invalidateQueries`                        | `["tasks", ws, board_id]`, `["sprint", ws, board_id]`                                                    |
| `task.updated`             | `setQueriesData` (prefix) + `setQueryData` | `["tasks", ws, board_id]`, `["task-detail", ws, board_id, id]`, + invalidates `["sprint", ws, board_id]` |
| `task.moved`               | `setQueriesData` (prefix)                  | `["tasks", ws, board_id]`, + invalidates `["sprint", ws, board_id]`                                      |
| `task.deleted`             | `setQueriesData` filter                    | `["tasks", ws, board_id]`, + invalidates `["sprint", ws, board_id]`                                      |
| `comment.created`          | `setQueryData`                             | `["task-detail", ws, board_id, task_id]`                                                                 |
| `comment.deleted`          | `setQueryData`                             | `["task-detail", ws, board_id, task_id]`                                                                 |
| `reaction.updated`         | `setQueryData`                             | `["task-detail", ws, board_id, task_id]`                                                                 |
| `approval.created/updated` | `setQueryData` (patch in place)            | `["approvals", ws, board_id, task_id]` patched directly; `["tasks", ws, board_id]` approval counts recomputed from the patched list — **zero network requests** |
| `typing.update`            | DOM custom event                           | `window → "jcn:typing"`                                                                                  |

**Inbox badge is poll-free:** `useInboxUnreadCount` uses `staleTime: Infinity` + `refetchOnWindowFocus/Reconnect: false`. It fetches once per session, then the count only moves via three events — **created** (workspace socket increments in place), and **read / bulk-read** (`useUpdateInboxItem` / `useBulkUpdateInbox` invalidate the key). No window-focus refetching.

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

| Hook                | Key                                | URL                                    | staleTime | enabled          |
| ------------------- | ---------------------------------- | -------------------------------------- | --------- | ---------------- |
| `useTasks`          | `tasksKey(ws, proj, filters)`      | `GET /tasks/?{qs}`                     | default   | `!!ws && !!proj` |
| `useTaskDetail`     | `detailKey(...)`                   | `GET /tasks/{id}/`                     | default   | `!!taskId`       |
| `useTaskSubtasks`   | `subtasksKey(...)`                 | `GET /tasks/{id}/subtasks/`            | default   | `!!taskId`       |
| `useTaskComments`   | `commentsKey(...)`                 | `GET /tasks/{id}/comments/` (cursor)   | default   | `!!taskId`       |
| `useTaskActivities` | `["activities", ws, proj, taskId]` | `GET /tasks/{id}/activities/` (cursor) | default   | `!!taskId`       |

`useTaskComments` and `useTaskActivities` are **infinite queries**. `getNextPageParam` returns `lastPage.next` (full cursor URL).

#### Filter Builder

`buildTaskParams(filters)` converts the filter object to a URL query string:

- `search`, `sprint`, `start`, `end`
- `priorities[]`, `assignees[]`, `labels[]`, `types[]`, `due[]`
- `pendingMyApproval → pending_approval=true`

#### Mutations

> **Mutations merge, they do not refetch (perf).** Every PATCH/move/delete returns (or implies) the full task, so the high-frequency mutations patch the cache in place via `setQueriesData` instead of `invalidateQueries(["tasks"])` — which would refetch the **entire board task list** from the backend on every small edit. Only `useCreateTask` still invalidates (a brand-new task's filter membership is unknown). Other clients are reconciled by the board socket. Shared helpers: `mergeTaskInLists` (lists + children), `patchSubtaskCounts`, `maybeInvalidateSprint`.

**`useCreateTask`**

- `POST /tasks/`
- onSuccess: invalidates `["tasks", ws, proj]`, `["sprint", ws, proj]` — **the one mutation that still refetches the list** (new task may or may not match active filters).

**`useUpdateTask`** ← used by board-level views (Kanban, Calendar, Gantt)

- `PATCH /tasks/{taskId}/`
- onSuccess: `mergeTaskInLists` (server response → `["tasks"]` + `["children"]`) + `setQueryData(detailKey)`; `maybeInvalidateSprint` (only if the payload touched `status_id`/`sprint_id`/`sprint`). **No task-list refetch.**

**`useUpdateTaskDetail`** ← used by TaskDetailPanel only

- `PATCH /tasks/{taskId}/`
- onSuccess:
  1. `setQueryData(detailKey)` — merges `{ ...old, ...updated }` immediately
  2. `mergeTaskInLists` — patches the updated task into every `["tasks", ws, proj, *]` variant + `["children"]` (no refetch)
  3. `maybeInvalidateSprint` — refreshes sprint counts **only** when a sprint-affecting field changed

**`useDeleteTask`**

- `DELETE /tasks/{taskId}/`
- onSuccess: `setQueriesData(["tasks"])` filters the id out, `removeQueries(detailKey)`, invalidates `["sprint", ws, proj]` (deletion always affects completion). No list refetch.

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

- All update `subtasksKey` via `setQueryData`, then call `patchSubtaskCounts` which writes the recomputed `subtask_count` + `done_subtask_count` into `detailKey` **and** every `["tasks", ws, proj, *]` variant.
- **No `invalidateQueries(["tasks"])`** — the card progress bar updates from the patched counts, so toggling a checklist item no longer refetches the whole board.

---

### `useBulkActions.js` _(new)_

Single export `useBulkUpdateTasks(ws, boardId)` — mutation only, no query.

- `POST …/boards/{pid}/tasks/bulk/` — body carries the selected task ids + the field(s) to change (status / priority / assignee).
- onSuccess: invalidates `["tasks", ws, boardId]` (3-element prefix → all filter variants).
- Consumed by `BulkActionBar.jsx` (the slide-in bar shown when ≥1 task is checkbox-selected across Kanban/List).

---

### `useBoardShortcuts.js` _(new — not a React Query hook)_

Effect-based keyboard handler for board views. Signature:

```js
useBoardShortcuts({ tasks, selectedTaskId, focusedTaskId, setFocusedTaskId, onOpenTask, onCloseTask });
```

- Reads the user's custom key bindings via `useShortcutBindings()` (`src/shared/hooks/`).
- Handles `board:focus-up`, `board:focus-down`, `board:open-task`, `board:close`, plus 2-key task-action chords (e.g. `z` then `e`).
- Task-property chords dispatch a DOM `window → "jcn:task-action"` custom event that the card/detail layer listens for.

---

### `useSprints.js`

Two separate keys: `sprints` (list) and `sprint` (detail). Note the singular vs plural.

| Hook                | Key                                | staleTime | Notes                                                        |
| ------------------- | ---------------------------------- | --------- | ------------------------------------------------------------ |
| `useSprints`        | `["sprints", ws, proj]`            | default   | list of sprint names/dates/status                            |
| `useSprintDetail`   | `["sprint", ws, proj, sprintId]`   | `30_000`  | task counts, completion %; invalidated by all task mutations |
| `useSprintBurndown` | `["burndown", ws, proj, sprintId]` | `60_000`  | analytics endpoint                                           |

**When sprint detail goes stale:**
All task mutations (`create`, `update`, `updateDetail`, `delete`, `move`) and all WebSocket task events invalidate `["sprint", ws, proj]` (prefix match → hits all sprint detail entries for that board).

#### Mutations

| Hook              | URL                     | Invalidates                                         |
| ----------------- | ----------------------- | --------------------------------------------------- |
| `useCreateSprint` | `POST /sprints/`        | `["sprints", ws, proj]`                             |
| `useUpdateSprint` | `PATCH /sprints/{id}/`  | `["sprints", ws, proj]`, `["sprint", ws, proj, id]` |
| `useDeleteSprint` | `DELETE /sprints/{id}/` | `["sprints", ws, proj]`                             |

---

### `useBoards.js` (Boards) _(renamed from `useProjects.js`)_

Manages boards (the backend calls them "projects" in URLs; the cache key is `boards`).

| Hook        | Key                      | staleTime  |
| ----------- | ------------------------ | ---------- |
| `useBoards` | `["boards", ws]`         | `Infinity` |
| `useBoard`  | `["board", ws, boardId]` | `Infinity` |

`useBoard` has `retry: false` — a 403/404 response surfaces immediately (used for the "Access denied" error screen in KanbanPage).

**Mutations** (all via the `useInvalidatingMutation` wrapper):

| Hook            | URL                            | Invalidates                       |
| --------------- | ------------------------------ | --------------------------------- |
| `useCreateBoard`| `POST …/boards/`               | `["boards", ws]`, `["portfolio", ws]` |
| `useUpdateBoard`| `PATCH …/boards/{boardId}/`    | `["board", ws, boardId]`, `["portfolio", ws]` |
| `useDeleteBoard`| `DELETE …/boards/{boardId}/`   | `["portfolio", ws]`               |

Board mutations also invalidate `["portfolio", ws]` since the portfolio shows board summaries.

**Board icon convention:** Boards do not have a dedicated icon field. The `board_type` value (`general`, `software`, `marketing`, etc.) is the board's visual identifier.

- **`src/lib/boardTypes.js`** — single source of truth. Exports `BOARD_TYPES` (array with `value`, `label`, `icon`) and `getBoardIcon(board_type)` (returns the Lucide component, falls back to `LayoutGrid`).
- **`src/components/ui/BoardTypeIcon.jsx`** — reusable display component. Renders the icon inside a `bg-primary/10` rounded container. Props: `board_type` (string), `size` (`xs` | `sm` | `md` | `lg` | `xl` | `2xl`, default `sm`), `className`.

Used in 6 locations: `CreateBoardModal` (2xl, board-type picker preview), `BoardsPage` (lg, board card), `DashboardsPage` (md, recent boards), `KanbanPage` header (sm), `CommandPalette` board results (sm), `Sidebar` board nav items (xs).

Never render a board avatar as a letter or generic icon — always use `<BoardTypeIcon board_type={board.board_type} size={...} />`.

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

**Invite hooks** (all live here — do **not** re-query invite endpoints inline in pages):

- `useInviteMember(ws)` — `POST …/invites/` (used by InviteModal **and** SetupWizard).
- `usePendingInvites(ws, { refetchInterval? })` — `GET …/invites/pending/`, key `["workspace-invites", ws]` (MembersPage).
- `useCancelInvite(ws)` — `DELETE …/invites/:token/`; invalidates the pending-invites key (MembersPage).
- `useInviteDetails(token)` — public `GET /api/invites/:token/`, key `["invite", token]`, `retry: false`, `enabled: !!token` (AcceptInvitePage landing).

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
- WebSocket `presence.updated` events patch presence keys in-place via `setQueryData` (no GET).

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

### `useAnalyticsV2.js` _(src/shared/hooks/)_

The analytics layer was rewritten to match the backend's 4 flat-param endpoints (the old per-metric `/analytics/{metric}/` router and its ~12 hooks are gone). **`STALE = Infinity`** for all four — data never auto-staled; the AnalyticsPage **Refresh** button is the only refetch trigger (`invalidateQueries({ queryKey: ["analytics"] })`). None are touched by task mutations.

| Hook | Key | URL | Type |
| ---- | --- | --- | ---- |
| `useWorkspaceSummary(ws, {params})` | `["analytics","summary",ws,params]` | `GET …/analytics/summary/` | query — KPI counts `{total, open, done, overdue}` |
| `useAggregate(ws, {params})` | `["analytics","aggregate",ws,query]` | `GET …/analytics/aggregate/` | query — `group_by` counts; `metric:"count"` injected by default |
| `useTeamWorkload(ws, {days=14, params, pageUrl})` | `["analytics","team",ws,query,pageUrl]` | `GET …/analytics/team/` | query — per-member rollup + heatmap; cursor page via `pageUrl` |
| `useTaskDrilldown(ws, {params, pageSize=25, enabled})` | `["analytics","tasks",ws,query]` | `GET …/analytics/tasks/` | **infinite** query — `getNextPageParam: last.next` |

**`buildTaskParams(filters, boardId)`** (exported here) — the single source that converts Kanban-style filter state (`search`, `priorities[]`, `assignees[]`, `types[]`, `labels[]`, `due[]`) + a board id into the flat comma-separated params (`priority=high,low`, `assignee=id1,id2`, …) every endpoint accepts. Use it so every tab/chart/drill-down filters identically.

> **Known dead call:** `useSprintBurndown` (in `useSprints.js`) still GETs `/analytics/sprint_burndown/`, which no longer exists in `analytics/urls.py` (only `summary`/`team`/`tasks`/`aggregate`). The burndown chart is commented out in `SprintPanel`, so this hook is effectively unused — wire a real endpoint or remove it before relying on burndown.

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

WebSocket `approval.created` / `approval.updated` events patch the approvals list in-place via `setQueryData` and recompute badge counts on the affected task — no network round-trip. See `handleBoardEvent` in `useWorkspaceSocket.js`.

**Hooks:**

| Hook | Purpose |
|------|---------|
| `useApprovals(ws, boardId, taskId)` | Fetch approvals list for a task |
| `useRequestApproval(ws, boardId, taskId)` | `POST …/approvals/` — create new approval request |
| `useReviewApproval(ws, boardId, taskId, approvalId)` | `POST …/approvals/{id}/review/` — reviewer submits verdict |
| `useResubmitApproval(ws, boardId, taskId, approvalId)` | `POST …/approvals/{id}/resubmit/` — requester resubmits |
| `useAdminOverrideApproval(ws, boardId, taskId, approvalId)` | `POST …/approvals/{id}/admin-override/` — workspace admin force-changes status, bypassing reviewers |

**`useAdminOverrideApproval`** — body: `{ status, comment? }`. On success invalidates `["approvals", ws, boardId, taskId]`. The backend logs a `approval_admin_overridden` `TaskActivity` entry and broadcasts `approval.updated` to all board members. Requires `isOwner || can("board.admin")` check in the UI before rendering.

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

**Public (unauthenticated) form hooks** — token-scoped, no workspace/board. Used by `PublicFormPage`:

- `usePublicForm(formToken)` — `GET /api/forms/:token/`, key `["public-form", token]`.
- `useSubmitPublicForm(formToken)` — `POST /api/forms/:token/submit/`. Success/error UI is handled at the call site via `mutate`'s second-arg callbacks.

---

### `useAccount.js` _(src/shared/hooks/)_

Current-user account mutations (profile, avatar, password). UI feedback is left to the call site; these own the data layer only. Consumed by `UserSettingsModal`.

- `useUpdateProfile()` — `PATCH /api/users/me/`; syncs `["me"]` cache **and** the Zustand auth store. Used by both the profile form and the avatar picker.
- `useChangePassword()` — `POST /api/auth/password/change/` (dj_rest_auth).
- `useRequestPasswordReset()` — `POST /api/auth/password/reset/`; pass the email as the mutate arg.

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

### `useOrg.js` _(src/apps/org-structure/hooks/useOrg.js)_

All data hooks for the Org Structure module. Follows the same key-factory pattern as `useTasks.js`. All list/detail keys use `staleTime: Infinity` (near-static config data); `org-chart` uses `5 * 60_000`; `org-profile` uses `2 * 60_000`.

```
["org-departments",  workspaceId]                  staleTime: Infinity
["org-dept-members", workspaceId, deptId]          staleTime: Infinity
["org-teams",        workspaceId]                  staleTime: Infinity
["org-team-members", workspaceId, teamId]          staleTime: Infinity
["org-job-titles",   workspaceId]                  staleTime: Infinity
["org-chart",        workspaceId]                  staleTime: 5 * 60_000
["org-profile",      workspaceId, memberId]        staleTime: 2 * 60_000
```

#### Query hooks

| Hook                               | Key                | URL                                  |
| ---------------------------------- | ------------------ | ------------------------------------ |
| `useDepartments(ws)`               | `org-departments`  | `GET /org/departments/`              |
| `useDepartmentMembers(ws, deptId)` | `org-dept-members` | `GET /org/departments/{id}/members/` |
| `useTeams(ws)`                     | `org-teams`        | `GET /org/teams/`                    |
| `useTeamMembers(ws, teamId)`       | `org-team-members` | `GET /org/teams/{id}/members/`       |
| `useJobTitles(ws)`                 | `org-job-titles`   | `GET /org/job-titles/`               |
| `useOrgChart(ws)`                  | `org-chart`        | `GET /org/chart/`                    |
| `useOrgProfile(ws, memberId)`      | `org-profile`      | `GET /org/members/{id}/profile/`     |

#### Mutation hooks

All mutations invalidate their respective list key. `useRemoveDepartmentMember` / `useRemoveTeamMember` also invalidate the member sub-key.

| Hook                                                                  | Invalidates                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| `useCreateDepartment` / `useUpdateDepartment` / `useDeleteDepartment` | `org-departments`                                         |
| `useAddDepartmentMember` / `useRemoveDepartmentMember`                | `org-departments`, `org-dept-members`                     |
| `useCreateTeam` / `useUpdateTeam` / `useDeleteTeam`                   | `org-teams`                                               |
| `useAddTeamMember` / `useRemoveTeamMember`                            | `org-teams`, `org-team-members`                           |
| `useCreateJobTitle`                                                   | `org-job-titles`                                          |
| `useUpdateOrgProfile(ws, memberId)`                                   | `setQueryData` on `org-profile` + invalidates `org-chart` |

**`useUpdateOrgProfile`** — PATCH `/org/members/{id}/profile/`

- `onSuccess`: `setQueryData(profileKey)` with the server response (no network round-trip for the panel), then `invalidateQueries(chartKey)` so the org chart node reflects the updated job title.

#### `OrgProfileSerializer` response shape

```json
{
  "id": "...",
  "job_title": { "id": "...", "name": "Senior Engineer", "level": 3 },
  "job_title_id": "<write-only>",
  "employment_type": "full_time",
  "employee_id": "EMP-042",
  "start_date": "2023-04-01",
  "location": "London",
  "bio": "...",
  "departments": [{ "id": "...", "name": "Engineering", "color": "#6366f1" }],
  "teams": [{ "id": "...", "name": "Platform", "color": "#8b5cf6" }],
  "manager": { "id": "...", "name": "Jane Smith", "email": "jane@..." },
  "direct_reports_count": 3,
  "updated_at": "..."
}
```

`departments`, `teams`, `manager`, `direct_reports_count` are **read-only** — computed server-side from `DepartmentMember`, `TeamMember`, and `ReportingLine`. To change a member's department/team, use the department/team member endpoints. To change reporting lines, POST to `/org/reporting-lines/`.

#### Write field convention

Backend serializers split read and write fields. Always use these write-only fields in mutation payloads — never the nested read objects:

| Field             | Sets                                                           |
| ----------------- | -------------------------------------------------------------- |
| `head_id`         | Department head (WorkspaceMember PK)                           |
| `parent_id`       | Parent department (Department PK)                              |
| `department_id`   | Team's department (Department PK)                              |
| `lead_id`         | Team lead (WorkspaceMember PK)                                 |
| `member_id`       | Member to add (WorkspaceMember PK)                             |
| `job_title_id`    | OrgProfile job title (JobTitle PK; send `null` to clear)       |
| `employment_type` | `"full_time"` \| `"part_time"` \| `"contractor"` \| `"intern"` |

#### `OrgChartPage` — Interactive SVG canvas

`OrgChartPage.jsx` is a fully client-side interactive canvas — **no external graph library**. Key design decisions:

- **Pan**: `onMouseDown` on the SVG background stores `{ startX, startY }` in a `useRef` (not state — no re-render per mouse-move tick). `onMouseMove` updates `pan` state only on release / frame.
- **Zoom**: `wheel` event listener added with `{ passive: false }` (must `preventDefault()` to stop page scroll). Zoom range: `0.3 – 2`.
- **Fit-to-screen**: computed once on data load via `useEffect([nodes.length])`, exposes a toolbar button for re-centering.
- **Hierarchy layout** (`buildTree` + `layoutTree`): builds a tree from `manager_id` links; `computeSubtreeWidth` recurses bottom-up so parent x-positions center over their children. Multiple roots get wrapped in a virtual `"__root__"` node.
- **Department layout** (`buildDeptLayout`): members bucketed by `departments[]`; each bucket rendered as a coloured SVG `<rect>` with a 4-column grid of node cards inside.
- **Collapse/expand**: `collapsed: Set<id>` in state; `layoutTree` prunes collapsed subtrees from position computation; the toggle badge renders as a `<g>` element at the bottom-center of the node card (not a `foreignObject` — avoids cross-browser foreignObject click issues with SVG transforms).
- **Drag-to-reparent** (admin only): `onMouseDown` on a node card stores `drag: { node, screenX, screenY }` in state; `onMouseMove` updates `drag.screenX/Y`; `onMouseUp` fires `POST /org/reporting-lines/` if `dragOver !== drag.node.id`. The drag overlay is a fixed-position `<div>` that follows `drag.screenX/Y` — it lives outside the SVG to avoid transform inheritance.
- **Dot-grid background**: a `<pattern>` element with `patternUnits="userSpaceOnUse"` and its `x/y` attributes set to `pan.x % (20 * zoom)` so the grid tiles infinitely as the canvas is dragged.

---

### HR Management hooks _(src/apps/hr-management/hooks/)_

All HR endpoints sit under `/api/workspaces/{ws}/hr/…` and are backend-gated by `require_module(ws, "hr_management")`.

#### `useLeave.js`

```
["hr-leave-policies",  ws]                    staleTime: Infinity
["hr-leave-requests",  ws, statusFilter|"all"] staleTime: 30_000
["hr-leave-balances",  ws]                    staleTime: 60_000
["hr-whos-off",        ws]                    staleTime: 60_000
```

| Hook                                                                                          | URL                                                   | Notes                                       |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `useLeavePolicies` / `useCreateLeavePolicy` / `useUpdateLeavePolicy` / `useDeleteLeavePolicy` | `…/hr/leave-policies/[:id/]`                          | mutations invalidate policies               |
| `useLeaveRequests(ws, status?)`                                                               | `…/hr/leave-requests/?status=`                        | employee sees own, admin sees all           |
| `useCreateLeaveRequest`                                                                       | `POST …/leave-requests/`                              | invalidates **requests + balances**         |
| `useReviewLeaveRequest`                                                                       | `POST …/leave-requests/:id/review/ {status, comment}` | admin/lead; invalidates requests + balances |
| `useLeaveBalances`                                                                            | `GET …/leave-balances/`                               |                                             |
| `useWhosOff`                                                                                  | `GET …/whos-off/`                                     | today + next 7 days; dashboard widget       |

#### `useAttendance.js`

```
["hr-attendance-policy",  ws]                       staleTime: Infinity
["hr-attendance-my",      ws, dateFrom, dateTo]      staleTime: 30_000  enabled: !!dateFrom
["hr-attendance-list",    ws, employee, from, to]    staleTime: 30_000  ← admin
["hr-attendance-summary", ws, dateFrom, dateTo]      staleTime: 30_000  ← admin
["hr-attendance-qr",      ws]                        staleTime: 60_000  enabled on demand
```

- `useUpdateAttendancePolicy` uses `setQueryData` (PATCH response is the new policy).
- `useClockIn` / `useClockOut` invalidate all three attendance data keys via **2-element prefix** (`["hr-attendance-my", ws]` etc.) so every date-range variant refreshes.
- `useAttendanceQR(ws, enabled)` only fires when `enabled` (QR modal open).

#### `useHRDashboard.js`

```
["hr-dashboard", ws]   staleTime: 2 * 60_000
```

`GET …/hr/dashboard/` — headcount, leave overview, attendance overview, upcoming events.

#### `useEmployeeDocs.js` / `useEmployeeNotes.js`

```
["hr-employee-docs",  ws, memberId]   staleTime: 60_000
["hr-employee-notes", ws, memberId]   staleTime: 60_000
```

Per-member, admin-scoped. Docs use multipart upload (`…/hr/members/:id/documents/`); notes are CRUD (`…/hr/members/:id/notes/`). All mutations invalidate the member-scoped key. Both consumed by `MemberDetailPage.jsx`.

> **No WebSocket integration yet.** HR data is poll/stale-time driven only — no `useWorkspaceSocket` events for leave/attendance. Leave-approval notifications arrive through the existing `notify()` → inbox path (the bell), not via live HR cache patching.

---

### `useBoardPermissions.js` _(renamed from `useProjectPermissions.js`)_

Two exports:

- **`useBoardRoleDefinitions(ws, boardId)`** — React Query. Key `["board-role-definitions", ws, boardId]`, `GET …/boards/{pid}/role-permissions/`, `staleTime: Infinity`, `enabled: !!ws && !!boardId`. Role→action definitions are static at runtime.
- **`useBoardPermissions(ws, boardId)`** — derived, not a query. Wraps `useBoard()` + `useBoardRoleDefinitions()` and returns:

```js
// Returns
{
  role,         // "admin" | "member" | "viewer" | null
  isLoaded,     // false until board data arrives
  canView,      // always true if isLoaded
  canEdit,      // role !== "viewer"
  canDelete,    // canEdit
  canMove,      // can drag tasks between columns
  canComment,   // can post comments
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

### `GanttCanvas.jsx`

Pure canvas renderer — zero React re-renders on scroll or hover. Receives all state via props/refs and redraws imperatively.

#### Imperative handle (via `forwardRef`)

| Method                     | Called by                                                   | Purpose                                               |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `redraw()`                 | `GanttView` on every scroll tick                            | Full repaint — reads `scrollTopRef` / `scrollLeftRef` |
| `setHover(taskId \| null)` | `GanttView.onDriverMouseMove` / `onMouseLeave` / drag start | Starts or stops the hover animation loop              |

#### Animation system

- `hoverRef = { taskId, _target, alpha }` — mutable ref, never causes re-renders.
- `startAnimLoop()` starts a RAF tick that lerps `alpha` toward `0` or `1` (speed: 0.20 in / 0.15 out per frame). Loop stops automatically when `alpha` is stable — no idle CPU drain.
- Crossfade: when target changes, `taskId` switches to the new target only after `alpha < 0.05` (old one fades out first).
- Cleanup: `cancelAnimationFrame` on unmount.

#### Draw pass order

1. Background fill
2. Current-period shading + accent borders
3. Vertical grid lines
4. Binary-search first visible row
5. Row backgrounds + separators
6. _(taskRowMap built here — reused in 7.5 + 8)_
7. Today line — soft glow behind + crisp 1.5 px line + diamond marker at top
8. **Pass 1 — bars**: sprint bars, task bars (gradient sheen, drag ghost shadow, drag delta pill)
9. **Pass 2 — hover overlay** (always on top): glow halo (`shadowBlur=18`), white brightening overlay, grip handles, date chips
10. Dependency arrows (dashed bezier + arrowhead)

#### Visual features

- **Task bars** — base color fill + `LinearGradient` sheen (rgba white top → rgba black bottom).
- **Drag** — ghost drop-shadow behind bar; floating "+Nd / -Nd" pill above bar center while dragging.
- **Hover glow** — `ctx.shadowBlur` isolated inside `ctx.save()/restore()` to prevent bleed onto subsequent draws.
- **Date chips** — start chip right-anchored to bar left edge; end + duration chip left-anchored to bar right edge. Only rendered when they fit in the viewport (off-screen chips are skipped, not clamped).
- **Grip handles** — two vertical pill pairs on each bar edge, visible at `alpha * 0.78` opacity.
- **Sprint bars** — split-fill background: completed portion (`barColor + "d4"`, ~83 % opacity) fills from the left; remaining portion (`barColor + "28"`) fills the right. Clipped to rounded rect. Badge uses dark semi-transparent pill so it reads on both halves.
- **Today line** — diamond marker (`ctx.rotate(π/4)` + `fillRect`) replaces old circle.

#### `ctx.shadowBlur` rule

Every section that sets `shadowBlur > 0` wraps the draw call in `ctx.save() / ctx.restore()`. Never rely on manual reset — a missed reset bleeds shadow onto all subsequent paths in the same frame.

---

### `useBoardMembers.js` _(renamed from `useProjectMembers.js`)_

```
["project-members", workspaceId, boardId]   (key name unchanged)
```

Board-level member management. Separate from workspace members. The query is gated by an `enabled` option so it only fetches when the access modal is open.

| Hook                    | URL                                  | Notes                          |
| ----------------------- | ------------------------------------ | ------------------------------ |
| `useBoardMembers`       | `GET …/boards/{pid}/members/`        | `enabled: enabled && !!ws && !!proj` |
| `useUpdateBoardMember`  | `PATCH …/members/{id}/`              | change board role              |
| `useRemoveBoardMember`  | `DELETE …/members/{id}/`             |                                |
| `useBulkAddBoardMembers`| `POST …/members/bulk/`               | add several at once (BoardAccessModal) |

All mutations invalidate `["project-members", ws, boardId]`. (`useAddBoardMember` exists but is private/unexported — bulk-add is the public path.)

**Private-board member scoping:** `KanbanPage` and `TaskDetailPanel` both derive an `effectiveMembers` list. When `board.is_private` is `true`, `useBoardMembers` is enabled and its result is used; otherwise `useMembers(workspaceId)` (workspace-wide) is used. This `effectiveMembers` list is what flows into `CreateTaskModal`, `TaskDetailPanels` (assignee dropdown), `TaskActivityTabs` / `CommentEditor` (@mention picker), `FilterBar`, and `BulkActionBar`. No other files need changing — they all consume `members` as a prop.

---

### `useGoals.js` (OKR)

```
["objectives", workspaceId, timePeriod?]   staleTime: Infinity, refetchOnWindowFocus: false
```

Key factory filters out falsy `timePeriod`. All mutations (objectives, key results, task links) invalidate the top-level `["objectives", ws]` prefix. Periodic polling removed — cache is kept fresh by mutation invalidation (own changes) and WebSocket `objective.*` events (teammate changes).

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

**Response shape:**
```json
{
  "wizard_completed": true,
  "team_type": "engineering",
  "user_is_admin": true,
  "checklists": {
    "projects": { "dismissed": false, "items": { "create_board": true, "add_task": false, "invite_teammate": true } },
    "org":      { "dismissed": false, "items": { "create_department": false, "create_team": false, "set_reporting_line": false } },
    "hr":       { "dismissed": false, "items": { "create_leave_policy": false, "submit_leave_request": false, "record_attendance": false } }
  }
}
```

**PATCH payloads:** `{ wizard_completed, team_type }` or `{ module_dismiss: "<module_key>" }` to dismiss one module's checklist for the current user.

---

### `useDebounce.js`

```js
const debouncedValue = useDebounce(value, (delay = 300));
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

## Shared UI Components

### `Modal` — `src/components/ui/Modal.jsx`

The standard modal for all dialogs. **Do not use `@radix-ui/react-dialog` directly** — it has been replaced by this component everywhere.

#### Variants (pass as `variant` prop)

| `variant`   | Icon                   | Confirm button       | Use for                   |
| ----------- | ---------------------- | -------------------- | ------------------------- |
| _(default)_ | none                   | primary              | general-purpose           |
| `delete`    | `AlertTriangle` (red)  | destructive "Delete" | destructive confirmations |
| `info`      | `Info` (blue)          | primary              | informational dialogs     |
| `success`   | `CheckCircle` (green)  | default              | success confirmations     |
| `warning`   | `AlertCircle` (yellow) | default              | warnings                  |

#### Key props (`BaseModal`)

| Prop                | Default          | Notes                                                                                                                           |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `isOpen`            | —                | controls visibility                                                                                                             |
| `onClose`           | —                | called on backdrop click or X button                                                                                            |
| `title`             | —                | header text                                                                                                                     |
| `description`       | —                | sub-text below title                                                                                                            |
| `icon`              | —                | Lucide component rendered in header                                                                                             |
| `iconColor`         | `"text-primary"` | Tailwind class for icon colour                                                                                                  |
| `onConfirm`         | —                | confirm button handler; omit if using custom footer                                                                             |
| `confirmLabel`      | `"Confirm"`      | confirm button text                                                                                                             |
| `confirmVariant`    | `"primary"`      | one of `primary`, `danger`, `secondary`, `success`, `warning`, `danger-light`                                                   |
| `isLoading`         | `false`          | shows spinner on confirm, disables both buttons                                                                                 |
| `isConfirmDisabled` | `false`          | disables confirm button only                                                                                                    |
| `showFooter`        | `true`           | set `false` when the modal body owns its own footer/form buttons                                                                |
| `showHeader`        | `true`           | set `false` for fully custom layout                                                                                             |
| `flexBody`          | `false`          | adds `flex-1 min-h-0 overflow-hidden flex flex-col` to body — required when children need to scroll inside a constrained height |
| `maxWidth`          | `"600px"`        | inline style on the content container                                                                                           |
| `padding`           | `"px-5 py-4"`    | className on the body div; pass `"p-0"` for forms that own their own padding                                                    |

#### Patterns

**Standard confirm dialog** (uses built-in footer):

```jsx
<Modal
  isOpen={open}
  onClose={onClose}
  variant="delete"
  title="Delete board"
  onConfirm={handleDelete}
  isLoading={isPending}
/>
```

**Form modal** (owns footer + needs scroll):

```jsx
<Modal
  isOpen={open}
  onClose={onClose}
  title="Create Task"
  showFooter={false}
  padding="p-0"
  flexBody
  maxWidth="512px"
>
  <div className="overflow-y-auto">
    <form className="p-5 space-y-4">
      {/* fields */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </div>
    </form>
  </div>
</Modal>
```

**Custom footer pinned to bottom** (e.g. footer with non-standard layout):

```jsx
<Modal
  isOpen={open}
  onClose={onClose}
  title="Invite"
  showFooter={false}
  padding="px-6 py-5"
>
  {/* body */}
  <div className="-mx-6 -mb-5 mt-5 px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
    {/* footer content */}
  </div>
</Modal>
```

The `-mx-6 -mb-5` negative-margin trick cancels the body padding so the footer spans full width.

Also exports `ModalSkeleton` — a pulse-animated placeholder for use inside `<Suspense>` when lazy-loading modal content.

---

### `Avatar` — `src/components/ui/avatar.jsx`

Renders a user avatar in one of three modes, resolved automatically via `avatar_type`:

| `avatar_type` | Renders                                         | Data source                                |
| ------------- | ----------------------------------------------- | ------------------------------------------ |
| `google`      | `<img>` from `user.avatar` (Google picture URL) | Set by Google OAuth adapter on first login |
| `icon`        | Emoji in a coloured circle                      | `user.avatar_icon` (e.g. `"🦊"`)           |
| `initials`    | First letter of name in a coloured circle       | `user.full_name` or `user.email`           |

**Props:**

| Prop        | Type                                                   | Notes                                                                                                      |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `user`      | object                                                 | Shortcut — component resolves `src`/`icon`/`name` from `avatar_type`, `avatar`, `avatar_icon`, `full_name` |
| `name`      | string                                                 | Used for initials + colour hash. Overrides `user.full_name`                                                |
| `src`       | string                                                 | Explicit image URL — overrides `user` resolution                                                           |
| `icon`      | string                                                 | Explicit emoji — overrides `user` resolution                                                               |
| `size`      | `xxs` \| `xs` \| `sm` \| `md` \| `lg` \| `xl` \| `2xl` | Default `md`                                                                                               |
| `ring`      | bool                                                   | Adds `ring-2 ring-background` (used in `AvatarGroup`)                                                      |
| `className` | string                                                 | Merged onto the root element                                                                               |

**Usage — preferred pattern** (pass the full user object, component resolves the mode):

```jsx
<Avatar user={member} size="sm" />
```

**Usage — explicit** (legacy, still works; Google avatars also resolve correctly since `user.avatar` holds the URL):

```jsx
<Avatar name={user.full_name} src={user.avatar} size="md" />
```

`AvatarGroup` is also exported — renders up to `max` avatars with `−space-x-1.5` overlap and a `+N` overflow pill.

---

### `AvatarPicker` — inside `UserSettingsModal.jsx` (Me tab)

Lets the logged-in user choose their avatar mode. Three option pills:

- **Initials** — always available; PATCH `{ avatar_type: "initials" }`.
- **Google Profile** — shown only if `user.avatar` is set (meaning Google OAuth was used). PATCH `{ avatar_type: "google" }`.
- **Choose Icon** — reveals a 24-emoji grid. Clicking an emoji PATCHes `{ avatar_type: "icon", avatar_icon: "🦊" }`.

Auto-saves on selection (no separate Save button for avatar). Live preview updates immediately via optimistic `useAuthStore.setState`.

---

## Shared `<Select>` (`src/shared/components/ui/Select.jsx`)

The single, dynamic select/dropdown primitive. **Every native `<select>` and the old task-property `Dropdown` have been migrated to it** — there are now **0** native `<select>` elements in `src/`. Build any new picker with this; do not hand-roll dropdowns or reach for `<select>`.

**Why it's robust:** the menu is **portalled to `document.body`** and positioned with **`@floating-ui/dom`** (`offset`/`flip`/`shift`/`size`), so it never clips inside modals (`Modal` is `z-[999]`; the menu is `z-[1100]`) or scroll containers. Entrance animation via `framer-motion`. Full keyboard nav (↑/↓/Home/End/Enter/Esc, type-to-filter when `searchable`), `role="listbox"`/`option`.

### Props

| Prop | Purpose |
| ---- | ------- |
| `value` / `onChange(value)` | Selected value (single) or array (multi). `onChange` receives the raw value, **not** an event. |
| `options` | `{ value, label, icon?, iconNode?, avatar?, color?, description?, disabled?, keywords?, options? }[]`. An entry with `options` is a **group** (label → header; children may nest → indented tree). |
| `multiple` | Multi-select (checkbox rows; trigger shows "N selected"). |
| `renderTrigger(selected)` / `renderOption(option)` | Custom render slots. `selected` is option\|null (single) or option[] (multi). |
| `searchable` | Type-to-filter input (matches `label` + `keywords`). |
| `clearable` | ✕ to reset (single). |
| `onCreate(query,{onSuccess})` + `getCreateLabel` | "+ Create …" row (e.g. labels). |
| `openSignal` | Increment to open programmatically — drives the ⇧S/⇧P/⇧A/⇧L/⇧D task shortcuts. |
| `align` (`start`\|`end`), `side` (`bottom`\|`top`) | Placement (auto-flips). |
| `size` (`sm`\|`md`\|`lg`), `variant` (`bordered`\|`ghost`\|`unstyled`) | `bordered` = native-field look; `ghost` = in-panel hover (task properties); `unstyled` = caller styles via `triggerClassName`. |
| `className` / `triggerClassName` / `menuClassName` | Styling hooks. |
| `placeholder`, `emptyText`, `disabled`, `name`, `ariaLabel`, `maxMenuHeight`, `contentWidth` | Misc. |

Built-in option rendering shows an icon / avatar / colour-dot + label + optional description, so simple `{value,label,icon}` or `{value,label,color}` options need no `renderOption`.

### Migrated call sites (all live)

- **PM:** task properties — Status/Priority/Type/Assignee (`TaskDetailPanels.jsx`, ghost + `renderTrigger`/`renderOption` + `openSignal`); `CreateTaskModal` (status, assignee w/ search+avatars); `FormsPage` (field type, submission status).
- **Workspace/accounts:** `MembersPage` (role ×3 contexts, job title, employment type); `IntegrationsPage`, `APIKeysPage`, `ImportPage`; `analytics/FilterBar` (board scope), `analytics/OverdueSection` (dimension).
- **Org/HR/public:** `TeamsPage`, `DepartmentsPage`, `LeavePage`, `MemberDetailPage`, `PublicFormPage`.

**Removed:** the bespoke `Dropdown` in `TaskDetailShared.jsx` (deleted; call sites now import `Select` directly). **Not yet migrated (bespoke, intentional):** `LabelPicker` (label multi-select with colour-swatch create UI), the `FilterBar` advanced filter panel, and `AppSwitcherDropdown` — these are specialized; fold them into `Select` only if the create/preview affordances are first generalized.

---

## Project Management — Pages & Components (behavior reference for test cases)

> Behavioral map of the PM UI surface. Pair this with the Hooks reference (data layer) and the backend URL table when writing test cases. Files live under `src/apps/project-management/`.

### Pages (`pages/`)

| Page | Route | What it does / test surface |
| ---- | ----- | --------------------------- |
| `KanbanPage.jsx` | `/w/:ws/boards/:boardId` | The board hub. Loads board/tasks/statuses/labels/sprints/perms; hosts **5 views** (kanban, list, sprint, calendar, timeline) switched by tabs (no unmount). Selected task in `?task=<id>` URL param opens `TaskDetailPanel`. Owns: debounced search (350ms), filters, multi-select for bulk ops, board socket (`useBoardSocket`), keyboard shortcuts (`c`=create, arrows=focus, `/`=search). Mounts `useBoardSocket` here. |
| `BoardsPage.jsx` | `/w/:ws/boards` | Board portfolio cards: icon (BoardTypeIcon), name, completion bar (% done), health badge (on-track/at-risk/off-track), overdue count, active sprint. Hover → delete. Create button → `CreateBoardModal`. Create gated by `project.create`, delete by `project.delete`. |
| `WikiPage.jsx` | `/w/:ws/boards/:boardId/wiki` | Two-panel wiki: nested page tree (create/expand/select) + lazy Tiptap editor. Inline title edit, public/private toggle, revisions side-panel (preview + "Restore this version"), delete. |
| `FormsPage.jsx` | `/w/:ws/boards/:boardId/forms` | Two-panel intake-form builder: form list + builder/submissions tabs. Builder = field cards (label, type `<select>`, placeholder, required, options). Header: name/desc (save on blur), active toggle, copy public link, preview, delete. Submissions tab: expandable rows + status `<select>`. |

### Views (`components/tasks/` unless noted)

| Component | Test surface |
| --------- | ------------ |
| KanbanView (inside `KanbanPage`) | `@hello-pangea/dnd` columns; drag fires `useMoveTask` (optimistic + rollback). |
| `KanbanColumn.jsx` | One status column: header (name, count, add-task), collapse↔vertical-label, drag-receive flash, droppable. |
| `TaskCard.jsx` | Card: priority bar, type badge, due date, assignee, subtask progress, labels (2 + overflow), child/approval/priority meta, optional bulk checkbox. Draggable. |
| `ListView.jsx` | Virtualized table: column-visibility toggle, group-by (status/assignee/priority/sprint), multi-column sort (shift-click), lazy child-row expand (`useChildTasks`), per-row bulk checkbox. |
| `CalendarView.jsx` | Month/week/day; draggable task chips set `due_date` (`useUpdateTask`); unscheduled sidebar; cell-click creates task with date prefilled. |
| `GanttView.jsx` + `GanttCanvas.jsx` | Virtualized left panel + imperative canvas; zoom (day/week/month/quarter), bar drag = move, edge drag = start/due; critical path highlighted. (See GanttCanvas deep-dive above.) |
| `FilterBar.jsx` | Search, assignee avatar picker, advanced filter panel (priority/type/due/labels), pending-my-approval toggle, active-count badge, save/apply/delete saved views. |
| `KanbanSkeleton.jsx` | Shimmer placeholder, `task.child_count`-aware. |

### Sprint (`components/projects/`)

| Component | Test surface |
| --------- | ------------ |
| `SprintView.jsx` | Sprint-first wrapper; active-sprint dropdown; routes to planning vs columns/swimlanes by sprint status; backlog (no `sprint_id`) split out. |
| `SprintPanel.jsx` | Sprint header: selector dropdown, status badge, dates, progress, start/complete actions, columns↔swimlanes switch. |
| `SprintPlanningView.jsx` | Two-panel backlog ↔ sprint staging, drag to add/remove. |
| `SprintSwimLanes.jsx` | Swimlane grid (by assignee/status). `resolveMember` threads the full `user` object through so `<Avatar user={user} …/>` uses ID-based color seeding (consistent with all other avatars). |
| `CreateSprintModal.jsx` | Form: name, start/end dates, capacity → `useCreateSprint`. |
| `BurndownChart.jsx` | Ideal vs actual remaining over time. |

### Task detail (`components/tasks/`)

| Component | Test surface |
| --------- | ------------ |
| `TaskDetailPanel.jsx` | Drawer opened by `?task=`. Inline title edit (⇧T), properties (status/priority/assignee/dates/sprint/labels — all `Dropdown`s, openable via ⇧S/P/A/L/D), lazy description editor (⇧E), tabs for comments/activity, ⇧Del delete, layout prefs in localStorage, version-conflict detection. |
| `TaskDetailBody.jsx` | Title edit, subtasks (add/toggle/delete + progress), child tasks (expand/link/detach). |
| `TaskDetailPanels.jsx` | Property dropdowns + attachments + dependencies + approvals (request, reviewer status chips). Reviewer Avatar uses `user={r.user}` for consistent ID-based color. |
| `TaskDetailShared.jsx` | Houses `Dropdown`, `LabelPicker`, `PANEL_ITEMS`, `REVIEWER_STATUS_CONFIG`, `QUICK_EMOJIS`. |
| `TaskActivityTabs.jsx` | Comments tab (composer + list + reactions + delete) and activity changelog. Hosts `ApprovalCard` — shows reviewer list, verdict badges, and (when `isOwner \|\| can("board.admin")`) an admin override section at the bottom of each card with Force Approve / Force Reject buttons + optional reason textarea. A violet "Overridden by [name]" badge is shown when `approval.overridden_by` is set. Uses `useAdminOverrideApproval` and `usePermission`. |
| `CommentEditor.jsx` | Tiptap with `@` mentions (filter, arrow-nav, Enter select); Enter submits, Shift+Enter newline. |
| `TaskAttachmentsSection.jsx` | Upload zone, list, download/delete. |
| `TaskDependenciesSection.jsx` | Add/remove blocks / blocked-by links via search. |
| `CreateTaskModal.jsx` | Form: title (required), status, priority, type, assignee, start/due (start ≤ due validation), estimate, parent, description → `useCreateTask`. |
| `BulkActionBar.jsx` | Slide-in bar when ≥1 selected: change status/priority/assignee (`useBulkUpdateTasks`), delete, close. |

### Board modals (`components/projects/`)

| Component | Test surface |
| --------- | ------------ |
| `CreateBoardModal.jsx` | name (required), description, board-type picker (gradient preview), private toggle → `useCreateBoard`; success confetti + auto-close. |
| `BoardSettingsModal.jsx` | Edit name/description/type; manage statuses (add/edit/delete). |
| `BoardAccessModal.jsx` | Board members: add/bulk-add, role dropdown (viewer/editor/admin), remove. Uses `useBoardMembers` (`enabled` while open). |

---

## Analytics UI (behavior reference for test cases)

Workspace-level analytics. Page: `src/pages/workspace/AnalyticsPage.jsx`; sub-components in `src/pages/workspace/analytics/`. All data comes from the 4 `useAnalyticsV2` hooks. Charts use **Recharts** wrappers (`BarChart`, `DistributionDonut`, `ChartCard`).

**Shared filtering (one state, all tabs):** `AnalyticsPage` owns date range + board + Kanban-style task filters. `FilterBar.jsx` edits them; `buildTaskParams` flattens them; the same `filterParams` is passed to every tab/section — changing any filter updates Board, Teams, and Overdue simultaneously. A **Refresh** button calls `invalidateQueries(["analytics"])` (the only refetch path, since staleTime is Infinity).

| Component | Hook | Renders / test surface |
| --------- | ---- | ---------------------- |
| `AnalyticsPage.jsx` | — | Hosts the OverdueSection + a "Deep Dive" tab group: **Board**, **Sprints**, **Teams**. Owns shared filter state + refresh. |
| `FilterBar.jsx` | — | Date presets (14d/30d/60d) + custom range (native `<input type=date>`), board `<select>` (from `useBoards`), embedded `KanbanFilterBar` (search/assignee/priority/type/labels/due), Refresh button (spinner while refreshing). |
| `KpiSection.jsx` | `useWorkspaceSummary` | 4 count-up stat cards (Total/Open/Overdue/Done). **Currently commented out** in AnalyticsPage — display-only, no drill-down. |
| `BoardTab.jsx` | `useAggregate` (`group_by: status,priority,type,assignee`) | Stat pills (Total/Open/Blocked/Stale) + status donut + priority/type bar charts + team workload. Clicking any pill/slice/bar/row opens the drill-down modal. |
| `SprintsTab.jsx` | — | "Coming soon" placeholder; no data. |
| `TeamsTab.jsx` | `useTeamWorkload` | Grouped bar (Open/Overdue/Done per member) + sortable table (sort by name/assigned/open/overdue/completed/points, asc/desc) + due-date heatmap strips + cursor pagination (Prev/Next via `pageUrl`, resets on filter change). Click bar/row → drill-down. |
| `OverdueSection.jsx` | `useAggregate` (`group_by: <dim>, overdue: true`) | Left: bar chart switchable by dimension `<select>` (by assignee/priority/board); right: overdue task table. Click bar → drill-down; click row → task detail page. |
| `TaskDrilldownTable.jsx` | `useTaskDrilldown` | Reusable drill-down (also the modal body): debounced (300ms) search, scrollable task table (Task/Board/Assignee/Priority/Status/Due/[Overdue]), "Load more" (infinite cursor). Row click → `/w/:ws/boards/:boardId?task=:id`. Props: `params`, `showOverdue`, `searchable`, `emptyText`, `maxHeight`. |

---

## Data Flow — View Layer

All views live inside `KanbanPage.jsx` as conditional renders (no unmount on view switch). `allTasks` is fetched once at the page level and passed as props.

```
KanbanPage
  useTasks(ws, boardId, apiFilters)  → allTasks
  useStatuses(ws, boardId)           → statuses
  useMembers(ws)                     → wsMembers
  useBoardMembers(ws, boardId, {enabled: board?.is_private}) → boardMembers
  members = board?.is_private ? boardMembers : wsMembers   ← scoped for private boards
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

| Change                                         | Keys to invalidate or update                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Task field changed (assignee, dates, priority) | **merge** server response into `["tasks"]`+`["children"]`+`detail`; sprint **only if** status/sprint changed              |
| Task status changed                            | **merge** into `["tasks"]`; invalidate `["sprint", ws, proj]`                                                             |
| Task created                                   | invalidate `["tasks", ws, proj]`, `["sprint", ws, proj]` (membership unknown — only mutation that refetches)              |
| Task deleted                                   | `setQueriesData` filter out id + `removeQueries(detail)`; invalidate `["sprint", ws, proj]`                               |
| Task moved (Kanban drag)                       | optimistic + merge on `["tasks"]`/`["children"]`; `["sprint"]` invalidate                                                 |
| Comment added/deleted                          | `setQueryData` on `["task-detail"]` (+ infinite `["comments"]`) only                                                      |
| Subtask added/toggled/deleted                  | `setQueryData` on `["subtasks"]` + `patchSubtaskCounts` into `["task-detail"]` & `["tasks"]` — **no `["tasks"]` refetch** |
| Child task created/attached                    | `["children"]`, `["task-detail"]`, `["tasks"]`                                                                            |
| Sprint created/deleted                         | `["sprints"]` (list only)                                                                                                 |
| Sprint updated                                 | `["sprints"]` + `["sprint", ws, proj, id]`                                                                                |
| Board member added/removed                     | `["project-members", ws, proj]`                                                                                           |
| Workspace member added/removed                 | `["workspace-members", ws]`                                                                                               |
| Label created/deleted                          | `["labels", ws, proj]`                                                                                                    |
| Status created                                 | `["board", ws, proj]` (board embeds statuses)                                                                             |
| Statuses bulk-saved                            | `setQueryData` on `["statuses", ws, proj]`                                                                                |
| Board created/updated                          | `["boards", ws]`, `["portfolio", ws]`                                                                                     |

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

| WS Event              | DOM Event         | Listener        |
| --------------------- | ----------------- | --------------- |
| `typing.update`       | `jcn:typing`      | TaskDetailPanel |
| _(keyboard shortcut)_ | `jcn:create-task` | KanbanPage      |

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
{
  /* ‼️ Automation disabled
<Route path="boards/:boardId/automations" element={<AutomationsPage />} />
*/
}
```

What it does: full automation rule builder — triggers (task created/status changed/etc.), conditions, and actions (assign user, move status, send notification). The backend `useAutomations.js` hook is also dead because of this (see Hooks section below).

**Safe to delete?** Yes, when you're ready to rebuild automations from scratch (likely using Redis queues per the CLAUDE.md note). Keep the file if you plan to reference the UI logic.

---

#### `RoadmapPage.jsx` — **DELETED**

Superseded by `GanttView` (the Timeline tab in KanbanPage) and removed. The commented-out import/route in `App.jsx` were also removed. Its sprint-centric timeline (horizontal sprint bars, drag to reschedule) lives in `GanttView` now.

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

| File                                  | Type | Status                                | Safe to delete                   |
| ------------------------------------- | ---- | ------------------------------------- | -------------------------------- |
| `pages/projects/AutomationsPage.jsx`  | Page | Disabled (commented route)            | Yes (with hook)                  |
| ~~`RoadmapPage.jsx`~~                 | Page | **Deleted** — superseded by GanttView | Done                             |
| `pages/workspace/InboxPage.jsx`       | Page | Built, no route                       | Only if not planning inbox route |
| `pages/projects/AccessDeniedPage.jsx` | Page | Orphaned, duplicate of inline UI      | Yes                              |
| `hooks/useAutomations.js`             | Hook | Only used by dead AutomationsPage     | Yes (with page)                  |
| ~~`layout/ProtectedModuleRoute.jsx`~~ | Comp | **Deleted** — was never wired into App.jsx | Done |
| ~~`layout/AppWelcomeScreen.jsx`~~     | Comp | **Deleted** — replaced by per-module checklists | Done |
| ~~`pages/errors/ModuleUnavailablePage.jsx`~~ | Page | **Deleted** — was only used by ProtectedModuleRoute | Done |

**Hooks confirmed alive despite dead pages:** `useInbox`, `useInboxUnreadCount`, `useUpdateInboxItem`, `useBulkUpdateInbox` — all used by `NotificationBell.jsx` and `Sidebar.jsx`. Do not delete these.

---

## Auth Pages

All auth pages live in `src/pages/auth/` and are public routes (no `ProtectedRoute` wrapper).

| Page                       | Route                         | Description                                                                                                                                                  |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LoginPage`                | `/login`                      | Email + password sign-in. Includes "Forgot password?" link next to the Password label.                                                                       |
| `RegisterPage`             | `/register`                   | Email registration. After submit: if response has tokens → normal post-auth flow; if no tokens (email verification mandatory) → `/verify-email?email=...`.   |
| `ForgotPasswordPage`       | `/forgot-password`            | Email input → `POST /api/auth/password/reset/`. Shows inline "check your inbox" confirmation after submit. Always returns success (no user enumeration).     |
| `ResetPasswordConfirmPage` | `/reset-password/:uid/:token` | New-password form. Calls `POST /api/auth/password/reset/confirm/`. Link arrives from the Resend password-reset email.                                        |
| `VerifyEmailSentPage`      | `/verify-email?email=`        | "Check your inbox" landing shown after registration when email verification is mandatory. Has a resend button (`POST /api/auth/registration/resend-email/`). |
| `EmailVerifyConfirmPage`   | `/verify-email/:key`          | Auto-POSTs the key to `POST /api/auth/registration/verify-email/` on mount. Shows verifying spinner → success/error state.                                   |

---

## Onboarding Flows

Two completely separate paths depending on how the user enters the product.

---

### Path A — Admin (creates their own workspace)

**Trigger:** User registers with email or Google OAuth and has no workspaces yet.

```
Register (email)
  → if ACCOUNT_EMAIL_VERIFICATION=mandatory:
      response has no tokens → /verify-email?email=...  (VerifyEmailSentPage)
      User clicks link in email → /verify-email/:key  (EmailVerifyConfirmPage)
          POST /api/auth/registration/verify-email/ { key }
      → /login  (sign in with verified account)
  → if ACCOUNT_EMAIL_VERIFICATION=none (dev):
      response has tokens → normal flow below

Register / Google OAuth (verified)
  → WorkspaceRedirect (/)
      GET /api/workspaces/ → empty list
  → /onboarding  (OnboardingPage)
      Enter workspace name + optional logo upload → POST /api/workspaces/ as multipart/form-data
      Logo is an optional ImageField — sent as FormData; omitted if not selected.
      User.can_create_workspace flips False (one workspace per account, enforced server-side)
  → /w/:workspaceId/setup  (SetupWizard)
      Step 0 — Team type: pick from 6 categories (required to proceed)
      Step 1 — Invite: email chip input + Member/Viewer role picker (skippable)
                       fires POST /api/workspaces/:id/invites/ per email
                       Celery sends invite email via Resend
      Step 2 — Ready: confetti + PATCH /api/workspaces/:id/onboarding/ { wizard_completed: true, team_type }
                       if invites sent → polls GET /api/workspaces/:id/invites/pending/ every 5s
                       shows "X accepted · Y pending" live counter
  → /w/:workspaceId  (main app)

Post-entry — per-module GettingStartedChecklists
  Visible only to workspace admins. Each module has its own checklist on its landing page:

  Projects  (DashboardsPage)
    ✓ Create your first board  → /boards
    ✓ Add a task               → /boards
    ✓ Invite a teammate        → /members

  Org Structure  (DepartmentsPage)
    ✓ Create a department      → /org/departments
    ✓ Create a team            → /org/teams
    ✓ Set up reporting lines   → /org/chart

  HR Management  (HRDashboardPage)
    ✓ Create a leave policy    → /hr/leave
    ✓ Submit a leave request   → /hr/leave
    ✓ Record attendance        → /hr/attendance

  Each checklist: progress bar, collapse, permanent per-user dismiss.
  PATCH /api/workspaces/:id/onboarding/ { module_dismiss: "<key>" } on dismiss.
  Items computed server-side from workspaces/checklist.py CHECKLIST_REGISTRY.
  Base UI: src/shared/components/onboarding/ModuleChecklist.jsx
  Module wrappers: src/apps/<module>/components/GettingStartedChecklist.jsx
```

**Key invariant:** `can_create_workspace` is `True` by default on signup and flips to `False` the moment the workspace is created. Attempting `POST /api/workspaces/` a second time returns a permission error from the serializer.

---

### Path B — Invited user (joins an existing workspace)

**Trigger:** Admin sends an invite → user receives an email with `/invites/:token`.

```
/invites/:token  (AcceptInvitePage)

  Case 1 — Already logged in, correct email:
    Auto-accepts via POST /api/invites/:token/accept/
    Redirects to /w/:workspaceId after 1.8s

  Case 2 — Already logged in, wrong email:
    Shows "Wrong account" screen — no action available.

  Case 3 — Not logged in (most common):
    Rich landing screen: workspace initial, inviter name, role badge, feature list
    Two CTAs:
      "Create account to join"
        → localStorage.setItem("pendingInvite", token)
        → /register?invite=TOKEN&email=EMAIL
        → After register (email or Google): POST /api/invites/:token/accept/ → /w/:workspaceId

      "I already have an account"
        → /login?next=/invites/TOKEN&email=EMAIL
        → After login: AcceptInvitePage re-renders (Case 1 above)
```

**Key invariant:** Invited users skip `OnboardingPage` and `SetupWizard` entirely — they land directly in an existing workspace. `GettingStartedChecklist` is also hidden from them (admin-only check via `onboarding.user_is_admin`).

**Google OAuth + pending invite:** When the user clicks "Create account to join" and then signs up via Google, the token survives the OAuth redirect via `localStorage`. `authStore.googleLogin()` reads and returns it, `RegisterPage.handleGoogleSuccess()` auto-accepts and navigates to the workspace.

---

### Decision tree summary

```
User arrives at /
├── Has workspaces?  → /w/:id  (straight in)
└── No workspaces?
    ├── Has pending invite token in localStorage?  → register, auto-accept, /w/:id
    └── No invite?  → /onboarding → SetupWizard → /w/:id
```
