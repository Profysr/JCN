# Changelog

## v0.1.0 — Foundation & Auth (Week 1)
> Status: COMPLETE ✅

### Backend
- Django 5 + Django REST Framework project scaffold
- Custom `User` model — email-based auth, UUID primary key, no username field
- `dj-rest-auth` + `allauth` for registration, login, logout, JWT token flow
- JWT access tokens (1hr) + refresh tokens (30 days, rolling)
- `accounts` app — `/api/users/me/` GET/PATCH endpoint
- `workspaces` app — full CRUD for workspaces, members, invites
  - Role system: admin / member / viewer
  - Invite by email with token-based accept flow
  - Only workspace owner can delete a workspace
  - Only admins can remove members or update roles
- Django Channels + Redis channel layer (WebSocket infrastructure ready)
- drf-spectacular → Swagger UI at `/api/docs/`

### Frontend
- React + Vite + TailwindCSS + shadcn/ui base components (Button, Input, Label, Card)
- TanStack Query v5 with devtools
- Zustand auth store — login, register, logout, token persist to localStorage
- Axios client with JWT auto-refresh interceptor + 401 redirect
- `ProtectedRoute` — blocks unauthenticated access, redirects to `/login`
- Pages: Login, Register, Onboarding (create workspace), Dashboard shell
- `AppLayout` — sidebar with workspace switcher, nav links, user panel + logout
- `WorkspaceRedirect` — on login, redirects to first workspace or onboarding
- React Router v6 nested routes under `/w/:workspaceSlug`

### Infra
- `docker-compose.yml` — all services, `env_file` per service
- `.dockerignore` for both backend and frontend
- `.gitignore`

---

## v0.2.0 — Task Engine (Week 2)
> Status: COMPLETE ✅

### Backend
- `projects` app — `Project`, `TaskStatus`, `Task`, `SubTask`, `TaskComment` models
- UUID primary keys on all models; Task has priority choices + order field
- `ProjectSerializer` auto-creates 4 default Kanban columns on project creation: Backlog → In Progress → In Review → Done
- `TaskSerializer` (list view with subtask/comment counts) + `TaskDetailSerializer` (full nested data)
- `TaskMoveView` — atomic status + order update for drag-and-drop, single endpoint
- `broadcast()` helper — all mutations push real-time events to workspace WebSocket group

### Frontend
- `useProjects` + `useTasks` — TanStack Query hooks for all CRUD operations
- `useMoveTask` — optimistic update: board reorders instantly, rolls back on error
- `useWorkspaceSocket` — WebSocket hook patches TanStack Query cache on `task.created/updated/moved/deleted`
- `KanbanPage` — `DragDropContext` wrapping all columns, calls `useMoveTask` on drag end
- `KanbanColumn` — droppable column with color dot, task count, inline add button
- `TaskCard` — draggable, shows priority icon, due date, subtask progress bar, comment count, assignee avatar
- `CreateTaskModal` — title, description, priority, due date, assignee, default status pre-selected
- `CreateProjectModal` — name + description, navigates to new project's board on create
- `ProjectsPage` — project grid with empty state
- `DashboardPage` — real stats (project count, total tasks, member count) + recent projects grid
- Routes added: `/w/:workspaceSlug/projects` and `/w/:workspaceSlug/projects/:projectId`

---

## v0.3.0 — Collaboration (Week 3)
> Status: COMPLETE ✅

### Backend
- `TaskActivity` model — immutable audit log per task event (created, status_changed, priority_changed, assigned, commented, subtask_added)
- `TaskActivitySerializer` + `TaskActivityListView` — `/tasks/<id>/activity/` endpoint
- `TaskDetailSerializer` extended with nested `activities`
- `broadcast()` now fires `comment.created` / `comment.deleted` WebSocket events
- Activity auto-logged in all task mutation views (create, update, move, comment, subtask add)

### Frontend
- `TaskDetailPanel` — right-side slide panel, opens on task card click
  - Inline title + description editing (click to edit, blur to save)
  - Status, priority, due date dropdowns — updates persist immediately
  - Subtasks checklist: add, toggle done, delete
  - Comments thread: post with Enter / Send button, delete own comments
  - Activity log: timestamped event feed showing all field changes
- Selected task card gets a blue ring highlight
- `useTaskDetail` + `useWorkspaceSocket` handle comment real-time updates across tabs

---

## v0.4.0 — Members, Settings & Workspace Management (Week 4)
> Status: COMPLETE ✅

### Backend
- `WorkspaceInviteListView` — GET pending invites for a workspace (admin only)
- `WorkspaceInviteCancelView` — DELETE invite by token (admin only)
- `InviteDetailView` — public endpoint, returns invite info for the accept page (no auth required)
- `WorkspaceInviteSerializer` now returns `token` field so frontend can build invite links
- Fixed `validate_email(self, value)` signature in `WorkspaceInviteSerializer`

### Frontend
- `MembersPage` — active member list with role badges, crown for owner, role dropdown + remove for admins
- Pending invites section — shows email, role, invited-by; "Copy link" copies `/invites/<token>` URL; Cancel button
- `SettingsPage` — rename workspace form + Danger Zone (owner-only delete with name-confirmation guard)
- `AcceptInvitePage` — public route at `/invites/:token`, handles all auth states:
  - Not logged in → invite preview + "Sign in to accept" (preserves `?next=` for post-login redirect)
  - Correct user logged in → auto-accepts, redirects to workspace after 2 s
  - Wrong user logged in → shows which email the invite is for
  - Invalid / expired token → error state
- `LoginPage` reads `?next=` param and redirects there after login
- `AppLayout.handleLogout` calls `qc.clear()` before navigating — fixes stale cache shown to next user

---

## v0.5.0 — Task Filtering, Labels & List View (Week 5)
> Status: COMPLETE ✅

### Backend
- `Label` model — name + hex color, scoped per project (`unique_together` on project + name)
- `labels` M2M field on `Task`
- `LabelSerializer` + `LabelListCreateView` + `LabelDetailView`
- `TaskSerializer` updated: `labels` (read, nested) + `label_ids` (write, list of UUIDs); custom `create`/`update` handle M2M sync
- `prefetch_related("labels")` added to task list and detail queries

### Frontend
- `useLabels`, `useCreateLabel`, `useDeleteLabel` hooks
- `FilterBar` — search input, priority chips, assignee avatar toggles, label chips; "Clear filters" when active
- `ListView` — table view with columns: Title, Status, Priority, Assignee, Due Date, Labels
- `KanbanPage` — Board/List view toggle; FilterBar; client-side `filteredTasks` via `useMemo`
- `TaskCard` — shows colored label chips above the footer row
- `TaskDetailPanel` — Labels section: click label chip to remove; "+ Add label" picker with toggle existing / create new (name + 8 color swatches)

---

## v0.6.0 — In-App Notifications (Week 6)
> Status: IN PROGRESS 🔨

### Backend
- `Notification` model in `workspaces` app — recipient/actor FKs, verb choices (task_assigned, task_commented), workspace FK, meta JSONField, read bool
- `NotificationSerializer` + `NotificationListView` (GET last 50) + `NotificationMarkReadView` (POST — single by id or bulk)
- `WorkspaceConsumer` now joins `user_{user_id}` group on connect + leaves on disconnect + handles `user_notification` message type
- `notify()` helper in `projects/views.py` — creates Notification + pushes `notification.created` via WS to recipient
- Notifications triggered on: task creation with assignee, task assignee change, new comment (notifies assignee + creator, skips self-notify)

### Frontend
- `useNotifications` + `useMarkNotificationRead` hooks
- `NotificationBell` — bell icon in sidebar user panel with red unread badge; dropdown showing actor, verb, task title, relative timestamp; click → navigate to task (opens detail panel via `?task=` URL param); "Mark all read" button
- `KanbanPage` — reads `?task=` query param on load to auto-open task detail panel (supports direct navigation from notifications)
- `useWorkspaceSocket` — handles `notification.created` events, prepends to notification cache in real-time

---

## v0.7.0 — Command Palette + Global Search (Week 7)
> Status: IN PROGRESS 🔨

### Backend
- `TaskSearchSerializer` + `ProjectSearchSerializer` — lightweight search response shapes
- `GlobalSearchView` — `GET /api/search/?q=...`; searches tasks (by title) and projects (by name) across all workspaces the user belongs to; returns top 8 tasks + 5 projects; minimum 2-char query

### Frontend
- `useSearch(query)` hook — TanStack Query with `placeholderData` (no flicker between results), enabled at 2+ chars
- `CommandPalette` — Cmd+K / Ctrl+K global shortcut; full-screen backdrop; sections: Navigation (quick links when no query) / Tasks / Projects (search results); full keyboard nav (↑↓ to move, ↵ to open, Esc to close); loading spinner; empty state; footer keyboard hints
- Search bar in AppLayout sidebar — always-visible trigger that shows ⌘K hint, discoverable for new users
- Task results navigate to `/w/{slug}/projects/{id}?task={taskId}` — opens task detail panel directly
- Project results navigate to project board

---

## v0.8.0 — Custom Fields + Saved Views (Week 8)
> Status: COMPLETE ✅

### Backend
- `ProjectField` model — name, type (text/number/select/url/date), options list, order; scoped per project
- `TaskFieldValue` model — upsert-on-save; one value per task-field pair
- `SavedView` model — named filter preset per project per user; stores full filter JSON
- `ProjectFieldListCreateView`, `ProjectFieldDetailView`, `TaskFieldValueView` (upsert endpoint)
- `SavedViewListCreateView`, `SavedViewDetailView` (user-scoped)

### Frontend
- `useCustomFields`, `useSavedViews` hooks
- `TaskDetailPanel` — Custom Fields section: each field rendered by type (text/number/select/url/date); blur-to-save
- `FilterBar` — "Save view" button when filters are active; saved view chips to restore; delete saved view
- `KanbanPage` — passes `projectFields` to TaskDetailPanel; wires saved view create/delete

---

## v1.1.0 — Bulk Actions (Week 11)
> Status: COMPLETE ✅

### Backend
- `TaskBulkUpdateView` — `POST /tasks/bulk/` — updates status/priority/assignee or deletes multiple tasks; broadcasts `tasks.bulk_updated` / `tasks.bulk_deleted` WS events

### Frontend
- `BulkActionBar` — floating bottom bar (slides up) when tasks are selected: Status / Priority / Assign dropdowns + Delete button
- `useBulkUpdateTasks` hook
- Checkbox on TaskCard (top-left, appears on hover; solid when bulk-selected)
- Checkbox column in ListView
- `selectedIds` Set state in KanbanPage wired to both Board and List views
- Export to CSV button in KanbanPage header (`GET /tasks/export/`)

---

## v1.2.0 — File Attachments (Week 11)
> Status: COMPLETE ✅

### Backend
- `TaskAttachment` model — file, original_name, file_size, mime_type, uploaded_by FK
- `TaskAttachmentListCreateView` — GET list + POST upload (20 MB limit, multipart)
- `TaskAttachmentDeleteView` — DELETE by id, also removes the file from disk
- `TaskDetailSerializer` now includes `attachments` array
- `docker-compose.yml` — `media_data` named volume mounted at `/app/media`

### Frontend
- `TaskAttachmentsSection` — drop zone (drag-and-drop + click-to-browse), file grid with image previews, file-type icons, download + delete per file
- `useAttachments`, `useUploadAttachment`, `useDeleteAttachment` hooks

---

## v1.3.0 — @Mentions in Comments (Week 11)
> Status: COMPLETE ✅

### Backend
- `task_mentioned` verb added to `Notification.Verb`
- `TaskCommentListCreateView.post` now parses `@word` patterns, matches against workspace member names/email prefixes, and calls `notify()` for each match

### Frontend
- `MentionTextarea` — textarea with live `@` dropdown showing workspace members; ↑↓ navigate, Enter/Tab insert, Esc dismiss
- Wired into the comment form in `TaskDetailPanel`

---

## v1.4.0 — Task Dependencies (Week 11)
> Status: COMPLETE ✅

### Backend
- `TaskDependency` model — `blocker` FK + `blocked` FK, unique_together
- `TaskDependencyListCreateView` — GET returns `{blocked_by, blocking}`; POST creates a dep by type (`blocked_by` | `blocks`)
- `TaskDependencyDeleteView` — DELETE dep by id
- `TaskDetailSerializer` — includes `blocked_by` and `blocking` arrays

### Frontend
- `TaskDependenciesSection` — two sections (Blocked by / Blocking), each with task search picker + chip list with remove button
- `useDependencies`, `useAddDependency`, `useRemoveDependency` hooks

---

## v1.5.0 — Analytics Dashboard (Week 11)
> Status: COMPLETE ✅

### Backend
- `WorkspaceAnalyticsView` — `GET /analytics/` — returns overview stats, tasks_by_status, tasks_by_priority, workload by member, completion trend (last 30 days)

### Frontend
- `AnalyticsPage` — 4 overview stat cards + Tasks by Status horizontal bars + Tasks by Priority bars + Workload bars + Activity sparkline (pure SVG)
- `useAnalytics` hook with 60s stale time
- Analytics added to sidebar nav (BarChart2 icon)

---

## v1.7.0 — CSV Export (Week 11)
> Status: COMPLETE ✅

### Backend
- `TaskExportView` — `GET /tasks/export/` — streams CSV with ID, Title, Status, Priority, Assignee, Due Date, Sprint, Labels, Created

### Frontend
- Export icon button in KanbanPage header — opens CSV download in new tab

---

## v1.0.0 — UI/UX Polish Pass (Pre-release)
> Status: COMPLETE ✅

### Design System
- Inter + JetBrains Mono fonts via Google Fonts; applied via Tailwind `fontFamily` and `font-feature-settings`; `-webkit-font-smoothing: antialiased`
- Refined color palette: Indigo primary (`239 84% 67%`), slate-based neutrals, sidebar gets its own `--sidebar-bg` token (`220 20% 98%`)
- Custom CSS easing variables: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out`
- Custom keyframe animations: `panelSlideIn`, `scaleIn`, `fadeIn`, `slideUp` — all exposed as Tailwind utility classes
- `shadow-card` / `shadow-card-hover` custom shadow scale in Tailwind config
- `popover` color token added to Tailwind

### Component Improvements
- **Button**: `active:scale-[0.97]` press feedback on every button (Emil Kowalski principle)
- **AppLayout sidebar**: Wider (w-64), `--sidebar-bg` background, workspace avatar uses solid primary color, search bar with card shadow, nav items use `rounded-lg`, user panel cleaner
- **TaskDetailPanel**: `animate-panel-in` slide from right on open, `bg-card` base
- **CommandPalette**: `animate-scale-in` + `animate-fade-in` backdrop on open
- **KanbanColumn**: `ring-1 ring-primary/20` on drag-over state, `rounded-xl` droppable area
- **TaskCard**: `rounded-xl`, `shadow-card` + `shadow-card-hover`, subtask progress bar replaces text counter, `rotate-[0.8deg]` on drag
- **KanbanPage header**: Segmented control view toggle (Board / List / Sprint) with `bg-muted` pill container
- **DashboardPage**: Stat cards with colored icon containers (indigo/violet/emerald), project cards with colored avatars + progress bars + task completion %
- **ProjectsPage**: Project cards with colored avatars, progress bars, `shadow-card` + `shadow-card-hover`

---

## v0.9.0 — Sprints + Burndown + Roadmap (Week 9)
> Status: COMPLETE ✅

### Backend
- `Sprint` model — name, goal, start/end dates, status (planning/active/completed), project FK
- `Task.sprint` FK (nullable) — assign task to a sprint
- `?sprint=<id>` / `?sprint=none` filter on task list endpoint
- `SprintListCreateView`, `SprintDetailView` (PATCH to change status: planning→active→completed)
- `SprintBurndownView` — builds ideal line + actual line from `TaskActivity` status_changed events; returns day-by-day JSON

### Frontend
- `useSprints`, `useSprintBurndown` hooks
- `SprintPanel` — right-side panel in Sprint view: sprint list with status badges, start/complete buttons, create form with dates; burndown chart rendered below selected sprint
- `BurndownChart` — pure SVG, no external lib; ideal dashed line + actual solid line with data points + legend
- `KanbanPage` — 3rd view mode "Sprint": shows Kanban filtered to sprint tasks + backlog section (tasks not in any sprint) with "Add to sprint" button; SprintPanel on right
- `RoadmapPage` — `/w/:ws/roadmap`; per-project Gantt rows showing sprints as colored horizontal bars with completion count; auto-scales X-axis to fit all sprint dates
- Roadmap added to AppLayout nav
