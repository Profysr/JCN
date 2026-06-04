# JCN — Product Roadmap & Changelog

> **Vision:** A project management platform built for small institutions that combines the speed of Linear, the flexibility of ClickUp, the clarity of Notion, and the depth of Jira — without the bloat, the price, or the learning curve of any of them.
>
> **Why existing tools fail small teams:**
> - **Jira** — built for enterprise, feels like filing taxes
> - **ClickUp** — so many features it becomes paralysing
> - **Notion** — great docs, weak structured project tracking
> - **Linear** — beautiful but too opinionated, missing key reporting
> - **Asana/Monday** — dated UX, expensive seats, weak developer experience
>
> **JCN fills the gap:** Professional-grade tooling, consumer-grade UX, priced for teams of 3–100.

---

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

# 6-Month Product Roadmap — JCN v2.0 → v5.0
> **Phase 1 — COMPLETE ✅ | Phase 2 — COMPLETE ✅ | Phase 3+ — IN PROGRESS 🔨**
>
> **Mission:** Build the project management tool that small institutions (5–200 people) actually want to use every day — one that combines the speed of Linear, the power of ClickUp, the clarity of Notion, and the depth of Jira, without inheriting any of their weaknesses.
>
> **What the giants get wrong:**
> - **Jira** — enterprise-only mindset, 2005-era UX, slow everything, setup takes days
> - **ClickUp** — 500 features, zero focus, the UI is a maze, constant lag
> - **Notion** — beautiful for docs, terrible for structured project tracking, no real PM features
> - **Linear** — the best UX alive, but too opinionated, no time tracking, no reporting, expensive
> - **Asana** — outdated design, overly rigid, weak developer tooling
> - **Monday** — spreadsheet pretending to be a PM tool, overpriced, weak hierarchy
>
> **JCN wins by:** Fast by default. Beautiful always. Every feature earns its place.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 1 — DESIGN SYSTEM & CORE ARCHITECTURE (Weeks 1–4)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Phase 1 status: COMPLETE ✅** — Tested and verified end-to-end on 2026-06-02.

---

## v2.0.0 — Design System 2.0 (Week 1)
> Status: COMPLETE ✅
> **Intent:** The app should feel like it took 3 years to build. Every pixel earns its place.

### Design Tokens (`theme.css` — single source of truth)
- Full CSS custom property system: spacing, typography, radius, shadow, easing, duration
- 3 complete themes: **Light**, **Dark** (softened — VS Code-style slate-gray, not pitch black), **Midnight** (OLED)
- `color-scheme: dark` on dark/midnight themes — all native browser controls (select, date, scrollbar) inherit the theme automatically
- 9 accent colours: Indigo (default), Blue, Violet, Pink, Rose, Amber, Emerald, Cyan, Slate
- Density modes: **Comfortable** / **Compact** / **Cozy** — CSS variable swap, zero component changes
- Theme preference persisted in backend user profile; applied before first paint

### Animation system
- Individual CSS transform properties (`scale`, `translate`) used in keyframes — never the `transform` shorthand — so positioning transforms (`-translate-x-1/2`) are never overridden by animations. **This fixed modals appearing off-centre.**
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`
- Panel slide-in 220ms, modal scale-in 160ms, dropdown slide-down 200ms
- `prefers-reduced-motion`: opacity-only fallback for all transform animations
- `active:scale-[0.97]` on all interactive elements

### Components shipped
- Sidebar `AppLayout` with workspace switcher (real dropdown — lists all user workspaces, checkmark on active, "New workspace" gated by `can_create_workspace`)
- `Avatar` component — deterministic colour from name hash, xs/sm/md/lg sizes
- `Tooltip` — 300ms delay on first, 0ms on subsequent within a toolbar
- Toast system — Radix-based, type variants (success/error/warning/info)
- `FilterBar` — redesigned: avatar-stacker assignee picker, "Filters" popover (task type, due date, labels)
- `KanbanColumn` — inline column management: hover to reveal `···` menu → rename, change colour, mark as Done, delete
- **Add column** button at board end — inline name input, random colour, creates new status
- Task card: `isDragDisabled` when viewer; type badge hidden for default "task" type; priority dot hidden when unset

### Dark mode fixes (found during testing)
- `hover:bg-white` on TaskCard replaced with `hover:bg-accent/40`
- Task type badges changed from `bg-slate-100` / `bg-red-50` to opacity-based (`/15`) so they adapt without dark: variants
- Header action buttons changed from `border border-border` (near-invisible) to `bg-accent/60` with proper contrast
- Native `<select>` dropdown in TaskDetailPanel: `color-scheme: dark` + `bg-card` so the OS picker matches the app

---

## v2.1.0 — Access Control & Permissions Matrix (Week 2)
> Status: COMPLETE ✅
> **Intent:** Roles that make sense without reading a manual.

### Role hierarchy (clarified after testing)
```
Workspace Admin  →  always "admin" on every project — no project override can touch this
Workspace Member →  "editor" on all projects by default — can be restricted per-project to viewer/guest
Workspace Viewer →  always "viewer" — read-only everywhere, no exceptions
```
Project-level overrides (via `ProjectMember`) **can only restrict** Members/Viewers — they can never promote beyond the workspace role ceiling.

### Backend
- `ProjectMember` model — project-level role override: Admin / Editor / Viewer / Guest
- `GuestToken` model — time-limited (7/14/30 days) read-only shareable link
- `AuditEvent` model — immutable log of every permission change
- `Project.is_private` field — hides project from workspace Members/Viewers who are not explicit project members
- `permissions.py` — `get_effective_role()`, `has_project_permission()`, `log_audit()`; workspace Admins short-circuit to "admin" immediately — bug fixed where a project override could accidentally demote a workspace admin
- `ProjectListCreateView` filters private projects: only explicit members + workspace admins see them
- `ProjectMemberListCreateView`, `ProjectMemberDetailView` — CRUD for project-level role overrides
- `GuestTokenListCreateView`, `GuestTokenDeleteView` — create + revoke share links
- `ProjectPermissionsView` — returns `{role, can_view, can_edit, can_delete, can_admin}` for current user

### Frontend
- `useProjectPermissions(ws, pid)` — derives `{canEdit, canAdmin, canView, isGuest, role}` from `project.my_role` (zero extra requests)
- `useProjectMembers` / `useGuestTokens` — full CRUD hooks
- `ProjectMembersModal` — 3-tab modal:
  - **Members**: member list with `RoleDropdown` (Radix Popover — smart flip above/below, rendered via Portal so it's never clipped by the modal scroll container), private toggle, add override
  - **Permissions**: visual matrix — rows = roles, columns = Create/Edit/Delete/Admin
  - **Sharing**: guest link list with copy + revoke; create form with label + 7/14/30-day expiry
- `KanbanPage` gates: Add Task button, board settings gear, column add/rename/delete — all hidden for Viewers
- `TaskDetailPanel` — read-only for Viewers: selects disabled, title not clickable, subtask form hidden, label picker hidden, delete button hidden; drag-and-drop disabled via `isDragDisabled`
- `AccessDeniedPage` — 403 page with "Request access" button
- `ProjectsPage` — private projects invisible to non-members

### Bugs found + fixed during testing
- Workspace Admin getting "Project admin role required" when managing a private project → fixed by short-circuiting workspace admins in `get_effective_role`
- Viewers could still drag tasks and edit task detail fields → `handleDragEnd` now checks `perms.canEdit`; all TaskDetailPanel inputs carry `disabled={!canEdit}`

---

## v2.2.0 — Views Architecture (Week 3)
> Status: COMPLETE ✅ *(spec revised — see note)*
> **Intent:** Multiple ways to look at the same project's tasks.

### Architecture decision (revised from original spec)
Original spec called for "multi-board" where each "board" was a named view with its own type. After implementation and review, this was confusing: **in ClickUp/Jira terminology, a "board" IS a project (or list). Views are how you display it.**

**Revised model:**
- `Project` = the board / container (what ClickUp calls a "board")
- `View` = how you look at a project's tasks (Kanban, List, Sprint, Calendar, Timeline)
- The "Board" model stays in the backend for future per-project view configuration, but the UI correctly exposes a view toggle, not a "boards" concept

### Backend
- `Board` model retained: `board_type` (kanban / scrum / list / timeline / calendar), `is_default`, `visibility`, `config` JSONField, `is_archived`, `order`
- `SavedView.board` FK (nullable) — scopes saved filter presets to a specific view config
- `ProjectSerializer.create()` auto-creates a default "Main Board" (kanban) on every new project
- `BoardListCreateView`, `BoardDetailView`, `BoardArchiveView`, `BoardReorderView`, `BoardTemplatesView`
- 5 built-in board templates as Python constants (no DB rows needed): Software Dev, Marketing Campaign, Product Launch, Bug Tracker, Customer Requests

### Frontend
- View toggle (Board · List · Sprint · Calendar · Timeline) replaces the "Board tabs" concept — clean segmented control in the combined filter row
- Calendar and Timeline show "Coming in Phase 3" placeholder — routes exist, view not implemented yet
- `useBoards` hook available for future board config UI
- `NewBoardModal` + `BoardTabs` components built but not exposed in main navigation (available for Phase 3 project settings)

---

## v2.3.0 — Onboarding & Workspace Setup Wizard (Week 4)
> Status: COMPLETE ✅
> **Intent:** New user → first value in under 5 minutes. No tutorial videos.

### Backend
- `OnboardingState` model — per-workspace: `wizard_completed`, `team_type`, `dismissed_by_users` (JSON list of user UUIDs — per-user dismissal)
- `OnboardingStateView` — `GET/PATCH /api/workspaces/:slug/onboarding/`; computes checklist from live data (project count, task count, member count); returns `user_is_admin` flag
- 6 built-in `WORKSPACE_TEMPLATES` as Python constants: Software Team, Startup, Design Studio, Marketing Agency, Education, Operations
- `WorkspaceTemplateApplyView` — creates pre-configured projects + statuses + boards from a template key
- `can_create_workspace = BooleanField(default=True)` on `User` model — set to `False` when accepting an invite; enforced server-side on workspace creation (HTTP 403 if False)

### Frontend
- `SetupWizard` — full-screen 4-step wizard at `/w/:slug/setup` (separate route, no sidebar):
  - Step 1: Team type picker — 6 emoji cards
  - Step 2: Template picker — 6 workspace templates + "Blank" + "Import from Jira/ClickUp/Trello" link
  - Step 3: Email chip input (comma/space/paste bulk-add) + role selector + send invites
  - Step 4: Confetti + "Go to workspace" — wizard marked complete in backend
- `OnboardingPage` now redirects to `/w/:slug/setup` after workspace creation (previously went straight to dashboard)
- `GettingStartedChecklist` dashboard widget:
  - **Admin-only** — non-admin members don't see it (they joined an existing workspace)
  - **Per-user dismissal** — Admin A dismissing it doesn't affect Admin B
  - **Collapsible** — chevron button collapses the item list; the header with progress bar stays visible so the user can come back later
  - **Permanent dismiss** — X button removes it for that user permanently
  - Items auto-complete from live data — no manual marking
- `CreateProjectModal` — collapsible template gallery (5 project templates as visual cards)
- `WorkspaceSwitcher` in sidebar — real dropdown listing all user workspaces with active checkmark; "New workspace" option gated by `can_create_workspace`

### Bugs found + fixed during testing
- New user seeing old user's data (cross-session cache leak) → `queryClient` extracted to singleton (`src/lib/queryClient.js`); `login()` and `register()` now call `queryClient.clear()` before setting new tokens — not just on logout
- All auth storage keys not cleared on logout → logout now removes `access_token`, `refresh_token`, `accessToken`, `refreshToken`, and `auth` (Zustand persist blob)
- Invite flow broken: `RegisterPage` ignored `?next=` param → after registration now redirects to `next` (e.g. `/invites/:token`) or `/` if absent
- Getting Started checklist showed 3 items pre-checked for all users (workspace-level data showed existing projects/tasks) → gated to admins only; per-user `dismissed_by_users` replaces single workspace-wide flag
- `RoleDropdown` in `ProjectMembersModal` clipped by modal `overflow-hidden` → migrated to Radix `Popover.Portal` (renders into `document.body`, auto-flips above/below)

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 2 — TASK POWER FEATURES (Weeks 5–8)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Phase 2 status: COMPLETE ✅** — Implemented, tested, and validated end-to-end on 2026-06-03.
>
> **Scope decisions made during implementation:**
> - `RecurringRule` deferred to Phase 3 (requires Celery beat infrastructure)
> - `Task.description` stays as `TextField` storing markdown — no JSONField migration needed (Tiptap uses `tiptap-markdown` extension to serialize/deserialize markdown strings, zero data breakage)
> - `TaskDependency` extended with `relation_type` field instead of creating a separate `TaskRelation` model
> - Automation triggers scoped to 3 synchronous signal-based triggers; `task.overdue` deferred (requires scheduled Celery task)

---

## v2.4.0 — Advanced Task System (Week 5)
> Status: COMPLETE ✅
> **Intent:** Tasks that can model any kind of work — from a 2-minute fix to a 6-month epic.

### Backend
- **Task hierarchy**: `Task.parent` FK (self-referential, nullable) — unlimited depth; Epic → Story → Task → child Task in one model
- `Task.estimate_points` (story points, PositiveIntegerField) + `Task.estimate_hours` (DecimalField, 2dp) — both nullable
- `Task.start_date` DateField (nullable) — tasks now span a date range, not just a deadline
- **Epic** added as a new `TaskType` choice alongside Task / Bug / Feature / Story / Improvement / Question
- `TaskDependency.relation_type` field added — extends existing `blocks/blocked_by` with `relates_to`, `duplicate_of`, `cloned_from` choices; no second model needed
- `TaskTemplate` model — project-scoped reusable structure: `name`, `task_type`, `priority`, `default_subtasks` (JSONField list of `{title, order}`)
- `Task.clone()` method — deep-clones task + all subtasks + labels into a new `"(Copy)"` task; strips assignee, dates, and sprint
- Rollup properties on `Task`: `child_count`, `done_child_count` (Python `@property`, no extra DB columns)
- **5 new endpoints**: `POST /tasks/:id/clone/`, `GET+POST /tasks/:id/children/`, `POST /tasks/:id/apply-template/`, `GET+POST /projects/:id/task-templates/`, `PATCH+DELETE /projects/:id/task-templates/:id/`
- `TaskDetailSerializer` extended: `children` (direct child list), `ancestors` (full parent chain, ordered root→direct parent), `relations` (non-blocking relation list)

### Frontend
- **VoltEditor** (`src/components/ui/VoltEditor.jsx`) — Tiptap + `tiptap-markdown`; outputs/reads markdown strings so `description` stays a `TextField`
  - Toolbar: Bold · Italic · Strikethrough · Inline code · Highlight · H2 · H3 · Bullet list · Numbered list · Checklist · Quote · Divider · Link · Align left/center/right · Table (3×3 insert) · Undo/Redo
  - Markdown shortcuts active: `## ` → H2, `- ` → bullet, `` ``` `` → code block
  - `onBlur` saves — no per-keystroke API calls
  - Read-only mode for Viewers (`readOnly` prop)
- **TaskDetailPanel** additions:
  - **Breadcrumb trail** at top — clickable ancestor chain (root → … → direct parent → current); navigates via `?task=` URL param
  - **Child Tasks section** — collapsible; lists direct children with status dot + status label; "Add child task…" inline input; `(done/total)` counter
  - **Checklist section** renamed from "Subtasks" — clarifies SubTask model remains for simple checkbox items
  - **Story Points** + **Est. Hours** meta fields (inline number inputs, blur to save)
  - **Start Date** meta field alongside Due Date
  - **Clone button** (GitBranch icon) in header — clones task, shows toast with new title
  - Description replaced with VoltEditor
- **CreateTaskModal** additions:
  - **Template picker** button always visible — shows count badge when templates exist; "No templates yet" empty state; inline "Save current as template" (type name + Enter)
  - **Advanced options** collapsible section: Start Date, Story Points, Est. Hours
  - `parent_id` support (for child task creation)
- `useTaskHierarchy.js` — hooks: `useChildTasks`, `useCreateChildTask`, `useCloneTask`, `useTaskTemplates`, `useCreateTaskTemplate`, `useDeleteTaskTemplate`, `useApplyTemplate`

### Bugs found + fixed during testing
- `selectedTaskId` in KanbanPage only initialised from URL once at mount — child task navigation via `navigate(?task=childId)` didn't update the panel → added `useEffect` to sync `selectedTaskId` with `searchParams`
- Subtask checklist count on task card (e.g. `3/5`) remained stale after toggling — `useToggleSubtask`, `useCreateSubtask`, `useDeleteSubtask` only patched the detail cache, never invalidated `["tasks", ...]` → added `qc.invalidateQueries` to all three; also fixed `done_subtask_count` calculation (was using `.filter(Boolean)` on objects instead of `.filter(s => s.is_done)`)
- Child task status in parent panel showed stale value after drag-and-drop → `useMoveTask.onMutate` now also patches all `["children", ...]` caches optimistically; `onSuccess` invalidates them for accurate server label

---

## v2.5.0 — Rich Text Editor & Wiki (Week 6)
> Status: COMPLETE ✅
> **Intent:** Task descriptions as powerful as Notion pages. Wiki as structured as Confluence. All in one place.

### Backend
- `WikiPage` model — project-scoped, `parent` FK (nullable, self-referential tree), `title`, `slug` (auto-generated from title, unique per project), `content` (TextField, markdown), `is_public`, `order`
- `WikiRevision` model — immutable snapshot saved before every PATCH: `content`, `title`, `author` FK, `created_at`; ordered newest-first; last 20 returned per page
- `Document` model — workspace-scoped standalone document: `title`, `content` (markdown), `created_by`, timestamps
- `WikiPageSerializer.create()` auto-generates unique slug from title (slugify + numeric suffix on collision); `slug` is `read_only` — never required from client
- **5 wiki endpoints**: `GET+POST /projects/:id/wiki/`, `GET+PATCH+DELETE /projects/:id/wiki/:id/`, `GET /projects/:id/wiki/:id/revisions/`
- **2 document endpoints**: `GET+POST /workspaces/:slug/documents/`, `GET+PATCH+DELETE /workspaces/:slug/documents/:id/`

### Frontend
- `WikiPage.jsx` — split-pane layout: collapsible sidebar page tree + main editor area
  - **Sidebar**: `+` creates new page (inline title input); page tree with `WikiTreeNode` supporting nested children; active page highlighted; back button → project board
  - **Editor area**: editable title (click to edit, blur to save); updated-at timestamp + author; **Public/Private toggle** (globe vs lock icon); **History** button
  - **VoltEditor** wired for content — blur-to-save, no explicit save button needed
  - **Revision history panel** — slides in from right; list of revisions with author + timestamp; click to preview; "Restore this version" applies content back to editor
- `useWiki.js` — hooks: `useWikiPages`, `useWikiPage`, `useCreateWikiPage`, `updateWikiPage`, `useDeleteWikiPage`, `useWikiRevisions`, `useDocuments`, `useDocument`, `useCreateDocument`, `useUpdateDocument`, `useDeleteDocument`

### Bugs found + fixed during testing
- `POST /wiki/` failed with `slug: ["This field is required."]` — DRF validated `slug` before `create()` could generate it → marked `slug` as `read_only` in serializer; `create()` still injects it into `validated_data` before calling `super().create()`

### VoltEditor improvements (post-v2.5.0 polish)
- **Checklist not working** — `TaskList` and `TaskItem` extensions were missing from the extension array; added both with `TaskItem.configure({ nested: true })`
- **Marks extended across Enter key** — default Tiptap behaviour inherits bold/italic/etc. to the next paragraph; fixed by disabling StarterKit's built-in marks and re-adding each individually with `inclusive: false` (`Bold`, `Italic`, `Strike`, `Code`, `Underline`), so pressing Enter always resets inline formatting on the new line
- **Underline** — added `@tiptap/extension-underline` (Ctrl+U); missing from original toolbar
- **Link input** — replaced `window.prompt` (which stole editor focus before the mark was applied) with an inline URL input that opens below the toolbar button; uses `onMouseDown` + `e.preventDefault()` to keep editor focus throughout
- **Editor couldn't be typed into** — `onChange` updated parent `value` state → `useEffect([value])` ran → called `editor.commands.setContent(value)` on every keystroke, resetting cursor position and swallowing input; fixed with an `internalChange` ref that flags editor-driven updates so the sync effect skips them; only external value changes (task switch) trigger `setContent`
- **Table context toolbar** — Add Row / Add Col / Delete Row / Delete Col / Delete Table buttons appear in the toolbar only when cursor is inside a table
- **Code block styling** — dark background (`hsl(220 20% 10%)`), monospace font, light text — renders like a real code editor instead of plain browser `<pre>`
- **Table styling** — proper borders, header background (`hsl(var(--muted))`), alternating row shading — matches the app design system
- **Toolbar buttons** — changed from `onClick` to `onMouseDown` + `e.preventDefault()` on all toolbar buttons so the editor never loses focus when clicking formatting controls
- **`BubbleMenu` removed** — import failed at runtime (`@tiptap/react` version installed doesn't export `BubbleMenu` as a named export); all formatting options remain accessible via the fixed toolbar and keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U)
- **Docker build fix** — `npm install` inside Docker failed with peer dependency conflicts (packages installed locally via `--legacy-peer-deps`); added `frontend/.npmrc` with `legacy-peer-deps=true` and updated Dockerfile to copy `.npmrc` before running `npm install`
- **Active timer polling** — `useActiveTimer` had `refetchInterval: 10_000` (10s poll); unnecessary because elapsed time is computed client-side from `start_at`; changed to `staleTime: Infinity` — request now fires exactly twice per session (start + stop)

---

## v2.6.0 — Forms & Intake System (Week 6)
> Status: COMPLETE ✅
> **Gap filled:** Jira's issue collector is ugly. Linear has no intake. ClickUp forms are buried 6 levels deep.

### Backend
- `Form` model — project-scoped: `name`, `description`, `is_active`, `token` (UUID, unique, public share key), `config` (JSONField: success_message, create_task, default_status_id), `created_by`
- `FormField` model — ordered fields per form: `label`, `field_type` (short_text / long_text / email / number / dropdown / multiselect / date / file), `placeholder`, `is_required`, `options` (JSONField list for dropdown/multiselect)
- `FormSubmission` model — `answers` (JSONField: `{field_id: value}`), `submitter_email`, `task` (OneToOne FK, nullable — set when auto-task is created), `status` (new / in_review / closed)
- `PUT /projects/:id/forms/:id/fields/` — bulk-replace all fields in one request (reorder support)
- `GET /api/forms/:token/` — **public, no auth** — returns form definition for rendering
- `POST /api/forms/:token/submit/` — **public, no auth** — creates submission; auto-creates task if `config.create_task` is true; uses project's first status as default
- **6 authenticated endpoints**: Form CRUD, field bulk-update, submission list + status update

### Frontend
- `FormsPage.jsx` — sidebar-based layout (form list left, editor right); back button → project board
  - **Form list sidebar**: `+` creates new form; active/inactive indicator
  - **Form header**: editable name (blur-to-save) + description; Active/Inactive toggle; Copy link button (toast on copy); Preview button (opens public URL in new tab)
  - **Builder tab**: field cards with label, type selector, placeholder, required toggle, options textarea (for dropdown/multiselect); Add field button at bottom; fields saved on blur (not per keystroke — eliminates request spam)
  - **Submissions tab**: submission cards with submitter email, timestamp, status dropdown (new → in_review → closed), answer accordion
- `PublicFormPage.jsx` — standalone page at `/forms/:token`, no auth required, no JCN chrome
  - Renders all field types: text, long text, email, number, dropdown, multiselect (checkboxes), date
  - Client-side required field validation before submit
  - Success screen with check icon and configurable message
  - 404 state for inactive/invalid forms
- `useForms.js` — hooks: `useForms`, `useForm`, `useCreateForm`, `useUpdateForm`, `useDeleteForm`, `useUpdateFormFields`, `useFormSubmissions`, `useUpdateSubmissionStatus`

### Bugs found + fixed during testing
- Copy link button threw `toast.success is not a function` — `useToast()` returned `{ toast, success, ... }` but `const { toast } = useToast()` extracted only the raw function; convenience methods lived on the returned object, not on `toast` itself → fixed `useToast()` to attach `success/error/warning/info` directly onto the `toast` function before returning, so `toast.success()` works everywhere
- Preview button opened workspace dashboard — `/forms/:token` had no React route; router's catch-all matched it and redirected to `/` → created `PublicFormPage.jsx` and registered `/forms/:formToken` as a public route in `App.jsx`
- Form name/description inputs fired 1 API request per keystroke — `onChange` called `updateForm.mutate()` directly → changed to local draft state; `onBlur` saves to server
- Field inputs fired 1 API request per keystroke via `saveFields()` — split into `patchFieldLocally` (updates parent state, no API) and `flushField` (called on blur/select change — fires API once)
- Public form URL `GET /api/forms/{token}/` returned 404 — patterns in `projects/urls.py` were written as `"api/forms/..."` but already included under `api/` prefix in `core/urls.py`, making the real path `/api/api/forms/...` → removed duplicate `api/` prefix

---

## v2.7.0 — Automation Engine (Week 7)
> Status: COMPLETE ✅
> **Intent:** Let the app do the repetitive work. Rules-based, no-code, visual builder.

### Backend
- `AutomationRule` model — project-scoped: `name`, `is_active`, `fire_count`, `trigger` (JSONField: `{type}`), `conditions` (JSONField list: `[{field, operator, value}]`), `actions` (JSONField list: `[{type, payload}]`), `created_by`
- `AutomationLog` model — immutable execution record: `rule` FK, `task` FK, `trigger_payload`, `actions_run` (JSONField list with per-action result), `exec_status` (success / partial / failed), `error_message`, `duration_ms`
- **Django signals** (`signals.py` + `ProjectsConfig.ready()`):
  - `pre_save` receiver captures old `status_id` and `assignee_id` before every Task save and stamps `_status_changed`, `_assignee_changed`, `_old_status` flags on the instance
  - `post_save` receiver reads those flags to fire the correct trigger synchronously
- **3 active triggers**: `task.created` (post_save created=True), `task.status_changed` (pre_save diff), `task.assigned` (pre_save diff)
- **Condition evaluation** (`_eval_condition`): `priority` equals/not_equals; `assignee` is_set/is_not_set; `status` equals; `task_type` equals; unknown conditions pass through
- **6 action handlers** (`_run_action`): `change_status` (looks up TaskStatus by id), `change_priority` (validates against Priority choices), `set_assignee` (looks up User by id), `add_label` (looks up Label by id), `post_comment` (creates TaskComment), `send_notification` (creates Notification + notifies assignee if no user_id specified)
- Celery configured (`core/celery.py`, `core/__init__.py`, `CELERY_*` settings) — ready for async actions in future
- **3 endpoints**: `GET+POST /automations/`, `PATCH+DELETE /automations/:id/`, `GET /automations/:id/logs/`

### Frontend
- `AutomationsPage.jsx` — full-page rule manager; back button → project board
  - **Empty state**: template gallery shown when no rules exist (3 ready-to-use templates)
  - **"Use template" dropdown** inside the builder — always accessible while form is open; picks template → pre-fills name + trigger + conditions + actions; user edits before saving
  - **Rule builder**: name input; trigger picker (4 options); conditions builder (field + operator + value rows, add/remove); actions chain (type selector + payload input per action type)
  - **Payload inputs per action**: priority dropdown for `change_priority`; text input for `post_comment`; message input for `send_notification`
  - **Rule cards**: enable/disable toggle; fire count badge; expandable → shows last 5 execution logs with status colour (green/yellow/red) + duration
- `useAutomations.js` — hooks: `useAutomations`, `useCreateAutomation`, `useUpdateAutomation`, `useDeleteAutomation`, `useAutomationLogs`

### Bugs found + fixed during testing
- Automation rule fired as "partial" with 0ms — template had `{ type: "change_status", payload: {} }` (wrong action, empty payload); engine had no `change_priority` handler → added `change_priority` to `automation.py`; fixed template to `{ type: "change_priority", payload: { priority: "urgent" } }`; fixed `change_status` to return clear error immediately when `status_id` is missing instead of falling through to "unknown action type"
- `task.status_changed` and `task.assigned` triggers never fired — `post_save` checked for `_status_changed` / `_assignee_changed` flags but nothing set them → added `pre_save` receiver that loads old DB row and stamps diff flags before the save

---

## v2.8.0 — Time Tracking (Week 8)
> Status: COMPLETE ✅
> **Gap filled:** Jira's time tracking is buried 3 clicks deep. ClickUp's is disconnected from tasks. Linear has none.

### Backend
- `TimeEntry` model: `task` FK, `user` FK, `start_at` (DateTimeField, nullable — null = manual entry), `end_at` (DateTimeField, nullable — null = timer still running), `duration_seconds`, `description`, `is_billable`
- **Timer logic**: `end_at=null` + `start_at set` = running timer; starting a new timer automatically stops any currently running timer for that user (`TimeEntry.stop()` method sets `end_at` and computes `duration_seconds`)
- `TimeEntrySerializer` includes `task_title` (from `task.title`) so the sidebar active-timer strip can show the task name without a second request
- **6 endpoints**: `GET+POST /tasks/:id/time-entries/`, `DELETE /tasks/:id/time-entries/:id/`, `POST /tasks/:id/timer/start/`, `PATCH /workspaces/:slug/timer/stop/`, `GET /workspaces/:slug/timer/active/`, `GET /workspaces/:slug/timesheets/`
- **Timesheet endpoint** — accepts `?week=YYYY-Www`; returns `{ week_start, days: [ISO dates], rows: [{user, days: {date: seconds}, total}] }` — user × day matrix ready for the grid

### Frontend
- **TaskDetailPanel** time tracking section:
  - **Timer button** in panel header (Timer icon = idle, red Stop square = running on this task)
  - **Active timer strip** — pulsing red dot + "Timer running" + started-X-ago text; shown when timer is active on this task
  - **Quick log buttons** — 15m / 30m / 1h / 2h pills + custom minutes input + description; saves on click
  - **Entry list** — user avatar, formatted duration (Xh Ym), description, date; delete on hover (own entries only)
  - **Total logged** shown next to section label
- **AppLayout sidebar** — active timer strip appears above user panel when any timer is running; shows task title (truncated) + Stop button; works from any page in the app
- **TimesheetsPage** (`/w/:ws/timesheets`):
  - Weekly grid: Mon–Sun columns, one row per member, cells show formatted hours
  - Footer row with daily totals + grand total
  - Week navigator: prev / next / "This week" buttons
- `useTimeTracking.js` — hooks: `useActiveTimer` (polls every 10s), `useStartTimer`, `useStopTimer`, `useTimeEntries`, `useAddTimeEntry`, `useDeleteTimeEntry`, `useTimesheet`; `formatDuration(seconds)` helper (returns `Xh Ym` or `Xm`)

### Navigation additions (Phase 2)
- **KanbanPage project header** — icon button group (Book / Form / Zap) navigates to Wiki / Forms / Automations sub-routes for the current project
- **Back button** on Wiki, Forms, and Automations pages — always navigates back to the project board
- **Timesheets** added to AppLayout sidebar nav (Clock icon)

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 3 — VIEWS & VISUALIZATION (Weeks 9–13)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Phase 3 status: COMPLETE ✅** — Implemented end-to-end.
>
> **Scope decisions made during implementation:**
> - Inline cell editing removed from Table View (TC-19: double-click opened task panel; editing consolidated into Task Detail Panel)
> - Zoom keyboard shortcut (TC-08) skipped
> - Advanced search scoped to query-param shortcuts (`@`, `!`, `#`, `>`) — PostgreSQL FTS + filter builder tree deferred to Phase 5
> - Export PNG/PDF and WIP overlay deferred from Gantt View
> - `TaskDetailPanel` fully redesigned as a Jira-style two-column modal (v3.4.1)
> - `src/lib/constants.js` introduced as single source of truth for all priority/type/status UI config

---

## v2.9.0 — Calendar View (Week 9)
> Status: COMPLETE ✅
> **Intent:** See work distributed in time, not just status columns.

### Backend
- Optional date range filter on task list: `GET /tasks/?start=YYYY-MM-DD&end=YYYY-MM-DD` — filters by `due_date` range; works independently of the `view` param so it is reusable across all views
- iCal export: `GET /projects/:id/calendar.ics/` — subscribable calendar feed (no auth required for the download link)

### Frontend
- **Calendar View** replaces the "Coming in Phase 3" placeholder in the view toggle (Board / List / Sprint / Calendar / Timeline)
- Month / Week / Day modes (toggle in view header)
- Tasks appear as chips on their due date, colour-coded by status colour
- Multi-day tasks (`start_date` → `due_date`) render as horizontal bars spanning multiple date cells
- Drag task chip to a new date cell to reschedule — calls `PATCH /tasks/:id/` with new `due_date`; viewer role cannot drag
- Click any blank date area → `CreateTaskModal` opens with that date pre-filled (`defaultDate` prop added to modal)
- "No due date" shelf: collapsible section at the bottom listing tasks without a due date
- Today's cell highlighted with a primary-colour ring
- iCal export button in view header → downloads `.ics` file

---

## v3.0.0 — Timeline & Gantt View (Week 10)
> Status: COMPLETE ✅
> **Intent:** Project managers need to see how work fits together in time. This is the view they live in.

### Backend
- Timeline conflict detection: tasks with overlapping time for same assignee → warning flag
- Critical path computation: longest dependency chain, returned as `is_critical` flag on tasks

### Frontend
- **Timeline View** (full Gantt) — added to view toggle
- Horizontal bars = task duration (`start_date` → `due_date`)
- Group by: Status / Assignee / Sprint (switcher in header)
- Swimlanes: each group is a collapsible row section
- Drag bar body → moves both start and due date (with live tooltip showing the new date range)
- Drag right edge → extends due_date
- Dependency arrows: visual lines connecting `blocks`/`blocked_by` task pairs
- Critical path: tasks on the critical chain highlighted in amber
- Zoom levels: Day / Week / Month / Quarter — horizontal scroll adapts
- "Today" vertical red line; current-month column gets a subtle shade to aid orientation
- Month labels and clear month separators on the time axis

### Bugs fixed during implementation
- **Viewport jump on drag commit**: after releasing a drag the chart scrolled back to today — fixed with `scrolledToTodayRef` (scroll-to-today fires only on mount, ignored on subsequent `rangeStart` refetch changes)
- **Click after drag opens task panel**: `didDragRef` tracks whether `|deltaDays| > 0`; the `onClick` handler is suppressed when the ref is set, preventing unintended panel opens
- **Auto-scroll activates immediately on drag start**: gated behind a 4px movement threshold (`MOVE_THRESHOLD`) so accidental micro-movements during click don't trigger edge scrolling

### Deferred to later phase
- Export as PNG / printable PDF
- WIP column overlays for sprint boundaries
- Collapsible task rows for parent/child hierarchy in the chart
- Keyboard shortcut zoom level switching (TC-08 — skipped per team decision)

---

## v3.1.0 — Table / Grid View (Week 10–11)
> Status: COMPLETE ✅
> **Intent:** For teams who live in spreadsheets — same power, but tasks stay tasks.

### Architecture decision
The existing `ListView` (introduced in v0.5.0 as a simple title/status/priority/assignee/due-date table) is **evolved in-place** into the full Table/Grid View. The "List" tab in the view toggle is renamed to "Table". No 6th view mode is added — the toggle stays at 5 modes (Board · Table · Sprint · Calendar · Timeline).

### Backend
- Bulk field update endpoint: `POST /tasks/bulk/` (same method as v1.1.0 — no method change) now also accepts `custom_field_values` in the `updates` payload
- Sorting + grouping parameters on task list endpoint

### Frontend
- **Table View** (replaces the existing `ListView`) — power-user spreadsheet-style list
- Sticky header row with sort indicators (click to sort)
- Priority column: icon + label (e.g. `↑ High`) — icons from centralized `PRIORITIES` constant, colour-coded per priority
- All column headers, row content, and footer text aligned left for visual consistency
- Task title opens the Task Detail Panel on click
- Bulk action bar: floating bottom bar with Status / Priority / Assign dropdowns + Delete, appears when rows are selected
- Footer row: task count per group

### Implementation notes
- **Inline cell editing removed**: double-click to edit was interfering with single-click to open the detail panel (TC-19 regression). Editing is handled exclusively through the Task Detail Panel to keep concerns clean.
- Column resize, column visibility toggle, row height modes, freeze columns, and per-column aggregates deferred to a polish pass.

---

## v3.2.0 — Advanced Search & Filter Builder (Week 11)
> Status: COMPLETE ✅ *(scope scoped down — see implementation note)*
> **Gap filled:** Notion search is famously bad. Jira's JQL is powerful but alienating. JCN is powerful and friendly.

### Implementation note
Full PostgreSQL FTS (`tsvector`) and the AND/OR/group filter tree are deferred to Phase 5. What shipped in Phase 3 is a **query-param shortcut system** that covers the highest-value search patterns without the infrastructure complexity.

### Backend
- `GlobalSearchView` extended with dedicated query params:
  - `?assignee=<username_or_email>` — filter by assignee (`@name` shortcut)
  - `?priority=<value>` — filter by priority (`!urgent`, `!high`, etc.)
  - `?task_type=<value>` — filter by type (`#bug`, `#feature`, etc.)
  - `?overdue=true` — tasks past due date (`>overdue` shortcut)
  - `?today=true` — tasks due today (`>today` shortcut)
- All params composable — can combine type + priority + assignee in one request

### Frontend
- **Command Palette shortcuts** (search bar understands these prefixes):
  - `@name` → assignee filter
  - `!urgent` / `!high` / `!medium` / `!low` → priority filter
  - `#bug` / `#feature` / `#task` → type filter
  - `>overdue` → overdue tasks
  - `>today` → due today
- `useSearch` hook passes these as query params to the backend instead of client-side filtering
- Results show correctly labelled task chips with type badge + priority icon

### Deferred to Phase 5
- PostgreSQL `tsvector` full-text search on description + comments
- Advanced filter builder (AND/OR logic tree, bracket groups)
- Saved search alerts (requires Celery beat)
- `SavedView.is_workspace_scoped` + `alert_enabled` fields

---

## v3.3.0 — Custom Dashboards (Week 12)
> Status: COMPLETE ✅
> **Intent:** Every team has different metrics. Let them build the dashboard that matters to them.

### Architecture decision
The existing `DashboardPage` (workspace home, fixed stats + recent projects) and the existing `AnalyticsPage` (fixed bar charts) both become **built-in, non-deletable dashboard templates** inside the new Custom Dashboards system. The sidebar nav item "Dashboard" is renamed to "Dashboards" and opens the new builder; the first tab is always the built-in "Overview" (what was DashboardPage) and the second is "Analytics" (what was AnalyticsPage). Users can add, rename, reorder, and delete any additional dashboards beyond these two pinned ones. The old `/dashboard` and `/analytics` routes redirect to the new `/dashboards` route so bookmarks don't break.

### Backend
- `Dashboard` model: workspace-scoped, `name`, `widgets` JSONArray, `is_builtin` (True for Overview + Analytics — these cannot be deleted), `order`
- Widget types: stat card, bar chart, line chart, pie chart, table, task list, burndown, velocity, team workload, blank (text/heading)
- Dashboard data endpoints: real-time computed via existing analytics queries + new widget-specific endpoints
- `DashboardShare` model: public read-only link with optional password
- Migration creates the two built-in dashboards automatically for every existing workspace

### Frontend
- **Dashboards page** (`/w/:ws/dashboards`) replaces the old separate Dashboard + Analytics pages:
  - Tab strip: built-in "Overview" + built-in "Analytics" + any user-created dashboards + "+" to add
  - Built-in tabs have a lock icon — cannot be renamed or deleted
- **Dashboard Builder** (drag-and-drop canvas):
  - Grid layout: 12-column responsive grid
  - Drag widgets from panel on right onto canvas
  - Resize: drag bottom-right corner
  - Each widget has settings gear: configure data source, filters, chart type, title
- **Widget types:**
  - KPI card: big number + trend arrow (% vs last period)
  - Tasks by status: bar / pie / donut
  - Velocity chart: story points or task count per sprint
  - Burndown: ideal vs actual
  - Team workload: member × tasks assigned / logged hours
  - Task list: filtered list (e.g. "My overdue tasks", "Unassigned bugs")
  - Activity feed: recent task changes
  - Text block: markdown, for headings and notes
- Share dashboard: public link, optional password
- Dashboard templates: "Engineering Overview", "Sprint Dashboard", "Team Health", "Exec Summary"
- Old `/analytics` route redirects to `/dashboards?tab=analytics` so existing sidebar links don't break

---

## v3.4.0 — My Work & Portfolio Views (Week 13)
> Status: COMPLETE ✅
> **Gap filled:** Linear has no portfolio. Jira's portfolio is enterprise-only. Asana's workload is add-on priced.

### Backend
- `my-work` endpoint: all tasks assigned to current user across all workspaces, sorted by urgency
- Urgency score: overdue × 100 + urgent × 50 + high × 20 + due-today × 30
- Portfolio endpoint: cross-project health stats + aggregated task counts

### Frontend
- **My Work page** `/my-work` — personal task inbox:
  - Sections: **Overdue** (red) / **Due Today** / **This Week** / **Later** / **No Due Date**
  - Group by project (toggle)
  - Inline status change without navigating to project
  - Inline check-off with strikethrough animation
  - "Focus Mode" toggle: full-screen single task, hides nav
- **Portfolio view** `/w/:ws/portfolio`:
  - Project health cards: On Track 🟢 / At Risk 🟡 / Off Track 🔴 (auto-computed from overdue %)
  - Cross-project Gantt: sprint timelines from all projects on one timeline
  - Resource allocation heatmap: who is over/under capacity (task count vs usual)
  - Project health history: 30-day trend sparkline per project
- Pinned projects in sidebar: drag to reorder, star to pin
- Project health score widget on Dashboard

---

## v3.4.1 — Task Detail Panel Redesign & Priority System (Phase 3 Polish)
> Status: COMPLETE ✅
> **Intent:** The task detail panel is where users spend most of their time. It should feel like Jira's best feature, not an afterthought.

### TaskDetailPanel — Jira-style modal
- Converted from a right-side flex sibling (`w-[500px]`) to a **full-screen modal** (`fixed inset-0 z-50`) with a translucent backdrop; Escape key closes it
- **Two-column layout** (max-w-6xl, rounded-xl):
  - **Left column** — title (inline editable), description (VoltEditor), child tasks, checklist, attachments, dependencies, time log, Comments / Activity tabs
  - **Right column** — animated Dropdown for status / priority / type / assignee + detail rows for start date, due date, story points, est. hours, labels, custom fields
- **Comments / Activity tabs**: segmented control at the bottom of the left column; Comments shows the `MentionTextarea` thread, Activity shows the immutable audit log
- **Animated Dropdown component** (`src/components/ui/Dropdown.jsx`): replaces all native `<select>` elements in the panel; slide-down open animation (200ms), keyboard nav (↑↓ + Enter), rendered via Portal to avoid clipping; used for Status, Priority, Type, Assignee
- Icons shown alongside labels in all dropdowns for at-a-glance scanning

### Priority system centralisation (`src/lib/constants.js`)
- **Single source of truth** for all priority/status/type UI across the app — eliminates 14+ duplicate local definitions
- `PRIORITIES` array: `value, label, order, icon, textCls, dotCls, hex, filterActiveCls, modalBtnCls` per priority
  - `urgent` → `ChevronsUp` (red), `high` → `ChevronUp` (orange), `medium` → `Minus` (yellow), `low` → `ArrowDown` (blue), `no_priority` → `Minus` (muted)
- `TASK_TYPES` array: `value, label, icon, color, bg` for task / epic / bug / feature / story / improvement / question
- `SPRINT_STATUSES` object: `planning / active / completed` with badge classes
- Helpers: `getPriority(value)`, `getTaskType(value)`, `getSprintStatus(value)`, `PRIORITY_ORDER` map
- All consumers (`ListView`, `KanbanPage`, `CalendarView`, `GanttView`, `RoadmapPage`, `MyWorkPage`, `TaskDependenciesSection`, `SprintPanel`) updated to import from this file

### Priority icons in all views
- **ListView (Table View)**: priority cells now show icon + label (e.g. `↑ High`) coloured with `textCls` — replaces coloured dot
- **TaskDependenciesSection**: task chips in the Blocked by / Blocking sections now show the priority icon instead of a coloured dot; AddDependencyPicker search results likewise show icons
- **CalendarView**, **GanttView**, **MyWorkPage**: `PRI_DOT` / `PRI` lookups migrated to `getPriority()` from constants

### Bug fixes
- **`MentionTextarea` double border**: `MentionTextarea` already applies `border rounded-md` on its inner `<textarea>`; removed the outer wrapper `border` div in `TaskDetailPanel` that caused a double border in the comment input area
- **`AnalyticsTab` "Objects are not valid as React child"**: `tasks_by_priority` is an array of `{priority, count}` objects, not a plain object; fixed `AnalyticsTab` in `DashboardsPage.jsx` to map over the array correctly
- **`MyWorkTaskSerializer` NameError**: serializer was defined before `TaskSerializer` in `serializers.py`; moved after `TaskSerializer`
- **Calendar "No due date" shelf → right-side panel**: replaced the collapsible bottom shelf with a Jira-style 300px right-side panel with search, drag-to-reschedule support, and empty state

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 4 — COLLABORATION & COMMUNICATION (Weeks 14–17)
## Status: COMPLETE ✅
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## v3.5.0 — Real-Time Collaboration v2 (Week 14)
> Status: COMPLETE ✅
> **Intent:** Multiple people working simultaneously — nobody steps on each other, everyone sees each other.

### Backend
- `UserPresence` model: `user` FK, `resource_type` (task/project/board), `resource_id`, `last_seen` (updated every 30s)
- Presence events pushed via WebSocket: join/leave/active on each resource
- Optimistic locking: `Task.version` integer incremented on every save; conflict detection on PATCH
- Comment reactions: `CommentReaction` model — `comment` FK, `user` FK, `emoji` (max 1 per user per emoji)

### Frontend
- **Live presence indicators:**
  - Task card: small avatar stack "3 viewing" (max 3 shown + overflow)
  - Task detail panel header: "Bilal is editing…" soft banner
  - Kanban column: avatar strip above column header showing active users
  - Project board: "5 people online" chip in header
- **Comment reactions:** hover any comment → emoji reaction picker (+6 quick options) → count chips below comment; your reaction highlighted
- **Live card updates:** when someone changes a task title/status the card visually morphs (animated diff, not a hard replace)
- **Typing indicators:** "Bilal is typing…" in comment thread
- **Conflict banner:** "Ahmad saved this task 30s ago. Your version may differ." with "See diff / Overwrite / Merge" options
- Online presence dot in sidebar user panel area (green = online now, grey = offline)

---

## v3.6.0 — Approval Workflows (Week 14–15)
> Status: COMPLETE ✅
> **Gap filled:** Asana has approvals but they're separate task types. Jira has it in enterprise only.

### Backend
- `Approval` model: `task` FK, `requested_by` FK, `status` (pending/approved/rejected/changes-requested), `due_date`, `note`
- `ApprovalReviewer` model: `approval` FK, `user` FK, `status`, `comment`, `reviewed_at`
- Approval events broadcast via WebSocket; notifications to all reviewers
- Approval required gate: task cannot move to configured status until all approvals resolved

### Frontend
- "Request approval" button in task detail panel header
- Approval picker: add reviewers (workspace member search), set due date, add note
- **Approval section** in task detail panel:
  - Reviewer list: avatar + name + status chip (pending / approved / changes)
  - "Approve" / "Request changes" / "Reject" buttons for reviewers
  - Comment field on rejection/changes
  - Overall status: "2/3 approved"
- Approval badge on Kanban card: checkmark icon with count
- Notification: "Bilal requested your approval on 'Landing page redesign'"
- Filter: "Show: Pending my approval" in filter bar
- Automation trigger: `approval.approved` / `approval.rejected` → trigger action chain

---

## v3.7.0 — Notifications Hub v2 (Week 15)
> Status: COMPLETE ✅
> **Scope note:** Email delivery (SendGrid/Resend) and Celery beat digest scheduling are infra-only tasks deferred to a deployment pass. All in-app inbox, preferences model, and WebSocket real-time delivery are fully implemented.
> **Gap filled:** Every tool blasts you with emails. JCN sends exactly what matters, when it matters.

### Backend
- `NotificationPreference` model: per-user per-event-type control (instant/digest/off) + per-project overrides
- `InboxItem` model: persistent inbox (not just transient bell) — `status` (unread/read/archived/snoozed), `snoozed_until`
- Email delivery via SendGrid/Resend:
  - **Instant** (your mention, task assigned to you, approval requested)
  - **Hourly digest** (other comments on your tasks, status changes)
  - **Daily digest** (everything else, grouped by project)
  - **Weekly summary** (project health, velocity, top blockers)
- Smart grouping: 10 comments on same task = 1 email entry, not 10
- Unsubscribe token per workspace (GDPR one-click unsubscribe)

### Frontend
- **Inbox page** `/w/:ws/inbox` — full notification center:
  - Tabs: **For You** / **Watching** / **All** / **Done**
  - Each item: actor avatar + action + resource name + time + project tag
  - Bulk actions: select all → mark done / archive / snooze
  - Snooze: "Remind me in 1h / Tomorrow / Next week / Custom"
  - Filter: by project, by event type (assigned/mentioned/commented/approved/automated)
  - Keyboard shortcuts: `e` = archive, `m` = mark done, `s` = snooze, `r` = reply (opens inline)
- **Preferences page** `/settings/notifications`:
  - Matrix: event types (rows) × channels (in-app/email) × frequency (instant/digest/off)
  - Per-project override: set different rules for high-noise projects
  - Quiet hours: "No notifications between 10pm – 8am"
  - Digest time: pick daily digest delivery hour
- Bell redesign: groups by project (not flat list), count per group
- Focus Mode DND toggle in sidebar: mutes in-app notifications for 1h/4h/8h/until tomorrow
- Weekly digest email: project health cards, top 5 tasks completed, top 5 blockers

---

## v3.8.0 — OKR & Goal Tracking (Week 16)
> Status: COMPLETE ✅
> **Gap filled:** No mainstream PM tool does OKRs well alongside task execution.

### Backend
- `Objective` model: workspace or project-scoped, `owner` FK, `time_period` (Q1/Q2/Q3/Q4/annual/custom), `description`
- `KeyResult` model: `objective` FK, `metric_type` (percentage/number/currency/milestone), `start_value`, `target_value`, `current_value`, `unit`
- `KeyResult.tasks` M2M — contributing tasks; progress auto-rolls up from `done_task_count / total_task_count`
- `Objective.progress` computed: weighted average of key result completions
- Confidence score (0–100): computed from progress trend + days remaining

### Frontend
- **Goals page** `/w/:ws/goals`:
  - Objective cards with circular progress ring (% complete, colour by confidence)
  - Key result rows: current vs target progress bar, last updated timestamp
  - Confidence indicator: On Track 🟢 / At Risk 🟡 / Off Track 🔴
  - Click "Link tasks" → task search → selected tasks contribute to KR progress
  - Time period switcher: Q1 / Q2 / Q3 / Q4 / Annual / All
- OKR progress widget on main Dashboard
- Task detail panel shows "Contributes to: [KR name]" chip if linked
- Org rollup: nested objective tree (Company → Department → Team → Individual)
- Check-in prompts: weekly reminder to update key result values
- Goals history: sparkline of progress per key result over time

---

## v3.9.0 — Keyboard-First Power User Mode (Week 17)
> Status: COMPLETE ✅
> **Gap filled:** Linear set the bar here. JCN matches it and then adds more.
>
> **Implementation notes:**
> - `SHORTCUTS_REGISTRY.js` is the single source of truth — drives overlay, preferences modal, and the keyboard handler
> - Global shortcuts registered via `useKeyboardShortcuts` hook in `AppLayout` (chord timeout 1.5 s)
> - `c` shortcut fires `jcn:create-task` custom DOM event; KanbanPage listens and opens the create modal
> - `/` fires `jcn:focus-filter`; filter bars can listen to focus themselves
> - Vim mode (`h j k l`) and custom keybinding editor deferred to a polish pass
> - Password change uses `dj_rest_auth` built-in endpoint (`/api/auth/password/change/`) — no custom view
> - Password reset uses `dj_rest_auth` built-in flow (`/api/auth/password/reset/` + `/api/auth/password/reset/confirm/`)

### Frontend — Keyboard Shortcuts
- **`SHORTCUTS_REGISTRY.js`** (`src/lib/shortcutsRegistry.js`) — grouped shortcut definitions consumed everywhere
- **`useKeyboardShortcuts.js`** — registers global `keydown` handler; suppresses shortcuts when typing in inputs; chord state machine for `g X` sequences
- **`ShortcutOverlay.jsx`** — `?` key full-screen two-column reference card; `<kbd>` badges; Esc to close
- **Shortcuts implemented:**
  - `⌘K` / `Ctrl+K` — command palette
  - `?` — shortcut reference overlay
  - `g p` — go to Projects
  - `g d` — go to Dashboards
  - `g m` — go to My Work
  - `g i` — go to Inbox
  - `g a` — go to Analytics
  - `g g` — go to Goals
  - `c` — create task (context-aware; fires `jcn:create-task` event)
  - `/` — focus filter bar (fires `jcn:focus-filter` event)
  - `↑ ↓ Enter Esc` — handled per-page

### Frontend — User Settings Modal
- **`UserSettingsModal.jsx`** — global modal opened by clicking the user avatar in the sidebar
- **Tabs:**
  - **Me** — edit full name; read-only email; live save to `PATCH /api/users/me/`
  - **Password** — change password via `POST /api/auth/password/change/` (dj_rest_auth); show/hide toggles; inline "Forgot password? Reset via email" section
  - **Preferences** — Focus Mode DND (1h / 4h / 8h, persisted in localStorage); placeholder for future prefs
  - **Appearance** — theme selector (Light / Dark / Midnight); accent colour (9 options); layout density; all saved live to `/api/users/me/`
  - **Shortcuts** — read-only shortcut reference table (same data as the overlay); note about custom bindings coming
- Preferences button (`SlidersHorizontal` icon) in sidebar user panel opens modal at Preferences tab
- `?` button in sidebar user panel opens modal at Shortcuts tab

### Frontend — Password Reset Flow
- ~~LoginPage "Forgot password?" inline toggle~~ **REMOVED** — dj_rest_auth password reset email flow removed (NoReverseMatch on `password_reset_confirm`; not worth a custom adapter for the current scope)
- ~~`ResetPasswordConfirmPage.jsx`~~ **REMOVED** — public route and import deleted from `App.jsx`
- ~~`ForgotPasswordSection`~~ **REMOVED** — inline section in the Password tab of `UserSettingsModal` deleted
- Password change (`POST /api/auth/password/change/`) still works; `OLD_PASSWORD_FIELD_ENABLED: True` added to `REST_AUTH` so the current password is actually validated (was being ignored without this flag)

---

## v3.9.1 — Phase 4 Polish & Bug Fixes
> Status: COMPLETE ✅
> Post-release fixes, UX improvements, and model simplification discovered during testing.

### Backend — Approval Workflows (v3.6.0 fixes)
- **Approval gate bug fix** — `TaskMoveView` was blocking moves to done-type columns on both `pending` AND `changes_requested` approvals; fixed to block on `PENDING` only (`changes_requested` / `rejected` are closed states)
- **Approval resubmit endpoint** — `POST /tasks/:id/approvals/:id/resubmit/` resets a `changes_requested` or `rejected` approval + all reviewer statuses back to `pending` and re-notifies reviewers; only the original requester can call it
- **`OLD_PASSWORD_FIELD_ENABLED: True`** added to `REST_AUTH` in `settings.py` — without this dj_rest_auth's password change endpoint silently ignored `old_password` and accepted any new password

### Backend — OKR & Goal Tracking (v3.8.0 simplification)
- **`KeyResult` model simplified** — removed `MetricType` enum, `metric_type`, `start_value`, `target_value`, `current_value`, `unit`, `history` fields, and `record_checkin()` method; model is now `id`, `title`, `tasks` M2M, timestamps only
- **`KeyResult.progress`** — now purely task-driven: `round(done_tasks / total_tasks * 100)`; returns 0 when no tasks are linked; no more value-based fallback
- **`KeyResultSerializer` simplified** — removed `task_count`, `done_task_count`, `metric_type`, `start_value`, `target_value`, `current_value`, `unit`, `history` from serialized fields; now exposes `id`, `title`, `progress`, `task_ids`, `linked_tasks`
- **`linked_tasks` field added to `KeyResultSerializer`** — returns full `[{ id, title, status_name, is_done }]` for each linked task so the frontend needs no extra fetch
- **Migration required** — run `makemigrations projects --name v3_8_0_simplify_keyresult` + `migrate`

### Frontend — Sidebar & Navigation
- **Nav groups** — sidebar links now grouped with section labels: *(unlabelled)* Dashboards / Projects → **Work** Inbox / My Work / Goals → **Views** Portfolio / Roadmap / Timesheets → **Workspace** Members / Settings
- **User panel dropdown** — replaced 4 separate icon buttons (Bell, Sliders, ?, LogOut) with a single `⋯` button that opens an upward dropdown: Account settings · Preferences · Keyboard shortcuts (with `?` hint) · Sign out; `NotificationBell` remains as a sibling element

### Frontend — Approval Workflows
- **Approvals tab** — moved approval cards from the left column (always visible) into a dedicated "Approvals" tab alongside Comments / Activity / Time Log; shows count badge; empty state when no approvals exist
- **Request approval dropdown** — replaced the full-screen modal with an inline dropdown anchored below the approval button in the task panel header; `useMemo` on the member filter prevents re-render lag on search keystroke
- **Reviewer comment display** — `ApprovalCard` now shows the reviewer's comment as a quoted block (amber left border) below their row when status is `changes_requested` or `rejected`
- **Re-submit for review button** — appears on `ApprovalCard` when the logged-in user is the original requester and the approval status is `changes_requested` or `rejected`; calls `POST .../resubmit/` and resets the approval to pending
- **Approval gate toast** — drag-to-done 403 now shows a toast ("Resolve pending approvals before marking this task done.") via `useToast` in `KanbanPage.handleDragEnd`; removed the broken dynamic-import approach from `useMoveTask`

### Frontend — Comment Form
- **UX redesign** — replaced the wrapper-with-inner-border pattern (dual border) with a single clean border that glows primary on focus; Send + Cancel buttons appear only when the field is focused; Cancel clears text and collapses buttons; successful send resets to rest state
- **`@mention` fix** — parent wrapper had `overflow-hidden` which clipped the `absolute bottom-full` dropdown invisibly; removed `overflow-hidden` from the wrapper; dropdown now opens upward correctly
- **Typing indicator throttle** — presence ping on each keystroke reduced to at most once every 3 s via a `useRef` timestamp gate

### Frontend — Goals Page (v3.8.0 improvements)
- **Linked task list** — collapsible task list under each KR row; chevron toggle appears only when tasks are linked; each task shows a green filled circle ✓ if done / empty circle if pending, strikethrough title, status badge
- **Automatic progress** — removed the pencil edit button that manually set `current_value`; progress is now always driven by linked task completion; `useUpdateKeyResult` removed from the hook and component
- **`displayCurrent`** — simplified to `X/Y tasks` when tasks are linked, "No tasks linked" otherwise; start/target/current value labels row removed
- **KR create payload** — `createKR.mutate()` now sends only `{ title }` (no `metric_type`, `start_value`, `target_value`, `current_value`)
- **Search: AbortController** — task search in KR link popover uses native `AbortController`; previous request cancelled on every keystroke
- **Goals empty state** — replaced plain "No objectives yet" with a 3-step OKR explainer card (Create objective → Add KRs → Link tasks) + "When to use it" section; collapses once objectives exist

### Frontend — Command Palette
- **AbortController search** — replaced TanStack Query `useSearch` hook with a direct `api.get` + `AbortController` in `CommandPalette`; each query change aborts the previous in-flight request; results cleared on palette close

### Frontend — Modal System
- **`Modal.jsx` fixed** — replaced `@configBuilder` import with `./button`; replaced non-existent `variant="danger-light"` / `icon` / `isLoading` Button props with the app's actual Button API; added `VARIANT_MAP` for semantic→shadcn variant translation; close button is now a plain `<button>` with `X` icon; footer has a top border
- **`ShortcutOverlay.jsx`** — migrated from hand-rolled fixed overlay to `<Modal showFooter={false} maxWidth="900px">`; scrollable body via `flex-1 overflow-y-auto` pattern fixed
- **`UserSettingsModal.jsx`** — migrated to `<Modal showFooter={false} padding="p-0">`; sidebar tabs layout lives inside the Modal body; `X` import removed; Esc handler removed (Modal backdrop handles close)
- **`GoalsPage` create objective** — migrated to `<Modal>` with `onConfirm` wired to the create mutation; `handleCreate` function and hand-rolled backdrop removed

### Frontend — Password Change
- **`PwField` focus bug fixed** — `PwField` was defined as a `const` arrow function inside `PasswordTab`; every keystroke re-created its reference and unmounted/remounted the input, dropping focus; moved `PwField` to module scope as a named function component

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 5 — ANALYTICS, REPORTING & INTEGRATIONS (Weeks 18–22)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## v4.0.0 — Analytics Engine v2 (Week 18)
> Status: IN PROGRESS 🔨
> **Intent:** Insights that managers want to see, without needing a BI tool or SQL knowledge.

### Backend
- **Cycle time**: time from first "In Progress" status move → "Done" status, per task
- **Lead time**: task creation date → "Done" date
- **Throughput**: tasks completed per day/week/sprint
- **Velocity**: story points completed per sprint (rolling 6-sprint average)
- **CFD (Cumulative Flow Diagram)**: daily task count per status for any date range
- **Burnup chart**: total scope vs completed (shows scope creep unlike burndown)
- Background computation + Redis caching for heavy queries (TTL: 5 minutes)
- `AnalyticsSnapshot` model: daily batch computation stored for historical trends

### Frontend
- **Analytics Dashboard v2** (replaces current simple bars):
  - **Velocity chart**: stacked bar per sprint — completed story points + task count
  - **Cumulative Flow Diagram**: stacked area chart by status — spot bottlenecks visually
  - **Cycle time scatter plot**: each dot = one task; X = completion date, Y = days in cycle; median line
  - **Lead time histogram**: distribution of task lead times
  - **Burnup chart**: total scope (dashed) vs completed (solid) — scope creep visible
  - **Team workload heatmap**: 7-day rolling, members as rows, days as columns, intensity = task count
  - All charts: hover tooltips, zoom/pan, date range picker, compare to previous period

---

## v4.1.0 — Report Builder (Week 18–19)
> Status: IN PROGRESS 🔨
> **Gap filled:** Jira reports are fixed templates. ClickUp's are hidden behind pay walls. JCN's are fully custom.

### Backend
- `Report` model: `name`, `config` JSONField (chart type, data source, filters, grouping), `owner` FK
- `ScheduledReport` model: `report` FK, `cron` expression, `recipients` (emails), `format` (PDF/PNG/CSV)
- PDF generation (WeasyPrint / Playwright headless screenshot)
- Report sharing: `ReportShare` model — public read-only URL, optional password, optional expiry
- Background scheduled report execution via Celery beat

### Frontend
- **Report Builder** `/w/:ws/reports`:
  - Chart canvas: drag from widget palette onto canvas
  - **15+ chart types**: bar, horizontal bar, line, area, pie, donut, scatter, bubble, heatmap, table, KPI card, funnel, treemap, gauge, progress bar
  - Data source picker: Tasks / Time Entries / Members / Sprints / Custom Fields
  - X-axis / Y-axis / Group by / Color by config per chart
  - Date range + comparison period (this month vs last month, this sprint vs last sprint)
  - Filter panel: same filter builder as views
  - Report title + description (shown in shared/scheduled versions)
- **Scheduled delivery** setup:
  - Frequency: daily / weekly (pick day) / monthly (pick date) / sprint-end
  - Recipients: email chip input
  - Format: PDF (full page) / PNG (chart only) / CSV (data)
  - Preview before saving
- **Report templates gallery**: Sprint Retrospective / Team Performance / Project Health / Time & Billing / Custom OKR Report
- Embed chart: copy `<iframe>` snippet for external stakeholder dashboards
- Report history: last 10 deliveries with status + download link

---

## v4.2.0 — GitHub & GitLab Integration (Week 19)
> Status: IN PROGRESS 🔨
> **Gap filled:** Linear's GitHub integration is the best — JCN matches it and adds two-way sync.

### Backend
- `GitIntegration` model: `workspace` FK, `provider` (github/gitlab), `access_token` (encrypted), `repos` (JSON list)
- GitHub App + GitLab Application OAuth flows
- Webhook receiver: `POST /api/integrations/github/webhook/` and `/gitlab/webhook/`
- Commit → task auto-link: parse `[JCN-{task-id}]` or `Closes JCN-{id}` or `Fixes #title` in commit messages
- PR state → task status auto-transition: PR opened → "In Review", PR merged → "Done", PR closed (no merge) → back to "In Progress"
- `GitEvent` model: immutable log of all git events per task
- Branch name suggestion: `feature/JCN-{id}-{task-slug}`

### Frontend
- **Integrations page** `/w/:ws/settings/integrations`:
  - GitHub / GitLab OAuth connect cards with status indicator
  - Repository selector (multi-select from authorized repos)
  - Mapping config: which PR action → which task status transition
- Task detail panel **Activity tab → Git section**:
  - Linked commits: hash (clickable) + message + author avatar + date
  - Linked PRs: title + status badge (open/merged/closed) + reviewer avatars + CI badge
  - Linked branches
  - "Create branch" button → copies `feature/JCN-{id}-{slug}` to clipboard
- Task shortcode `JCN-{8-char-id}` shown in detail panel header + copyable
- Kanban card hover: "2 commits · 1 PR" git activity chip
- CI/CD status on task: green ✓ / red ✗ / yellow ⏳ pulled from GitHub Actions / GitLab CI

---

## v4.3.0 — Slack & Microsoft Teams Integration (Week 20)  --- Do it in Phase 06
> Status: IN PROGRESS 🔨

### Backend
- Slack OAuth bot token storage + webhook outbound
- Slash commands: `/jcn create [title]`, `/jcn assign [task] @user`, `/jcn status [task] [status]`, `/jcn list`
- Slack interactive messages: "Approve" / "Snooze" buttons in notification messages
- Teams webhook outbound notifications
- Message action: "Create JCN task" from Slack message right-click context menu
- `POST /api/integrations/slack/events/` — Slack Events API handler

### Frontend
- Slack OAuth connect flow in Integrations page
- Channel mapping: project → Slack channel for notifications
- Notification format toggle: Compact (one line) / Detailed (full card with fields)
- Teams webhook URL input in Integrations page
- "Create task from Slack" UX: modal pops up in Slack with all JCN fields
- Task creation from Teams meeting: `/jcn create` works in Teams chat

---

## v4.4.0 — AI-Powered Features (Week 20–21)  --- Do it in Phase 06
> Status: IN PROGRESS 🔨
> **Gap filled:** Other tools bolt on AI as gimmicks. JCN integrates AI into every real workflow moment.

### Backend
- OpenAI / Claude API integration (configurable: workspace brings their own key or uses JCN-managed credits)
- `AISession` model: usage tracking (tokens in/out) per workspace per month
- Streaming responses via SSE (Server-Sent Events) — no waiting for full response
- Endpoints:
  - `POST /ai/task/breakdown/` — task title + context → description + subtasks + estimate + type + priority
  - `POST /ai/task/improve/` — rough description → polished description + acceptance criteria
  - `POST /ai/sprint/plan/` — backlog + team capacity + velocity → suggested sprint composition with rationale
  - `POST /ai/sprint/retro/` — sprint data → auto-generated retrospective (went well / didn't / actions)
  - `POST /ai/task/categorize/` — task title → suggested type + priority + labels
  - `POST /ai/search/natural/` — plain English query → structured filter tree ("show me Ahmad's overdue bugs from this sprint")
  - `POST /ai/doc/summarize/` — long wiki page → TL;DR summary
  - `POST /ai/standup/` — user's tasks + recent activity → auto-generated standup update

### Frontend
- **AI Task Breakdown** button in `CreateTaskModal`:
  - Paste feature description → AI fills title, type, priority, description, subtask tree, estimate
  - Loading: streaming text animation fills fields one by one
  - Edit any field before saving
- **"Improve with AI"** button in description editor:
  - One click → rewrites vague description into structured acceptance criteria
  - Shows diff: original vs improved; accept all / reject / cherry-pick
- **Sprint Planner AI** CTA in SprintPanel:
  - "Plan my sprint" → AI suggests which backlog tasks to include (based on velocity, estimates, team capacity)
  - Shows reasoning: "At your average velocity of 24SP, I suggest these 8 tasks (22SP total)"
  - Accept all / modify → creates sprint tasks
- **Smart Labels** in CreateTaskModal:
  - As user types title, AI badge appears: suggested labels shown as dismissable chips
- **Sprint Retrospective AI** at sprint close:
  - "Generate retrospective" CTA in SprintPanel after sprint completes
  - Auto-generates: "What went well", "What didn't", "Action items" from sprint data
  - Opens in Volt Editor for team editing before sharing
- **Natural Language Search** in Command Palette:
  - Type "show me Ahmad's overdue bugs" → auto-converts to filter and shows results
- **Daily Standup Generator** in My Work page:
  - "Generate standup" button → AI writes draft based on your task activity; copy to Slack
- AI usage indicator in workspace settings: tokens used this month + quota bar

---

## v4.5.0 — Public API & Webhooks (Week 21)
> Status: IN PROGRESS 🔨
> **Gap filled:** Most tools have read-heavy, rate-limited APIs at lower tiers. JCN gives full API access from day 1.

### Backend
- REST API v2 with full OpenAPI 3.1 spec (auto-generated via drf-spectacular)
- `WorkspaceAPIKey` model: name (hashed), `scopes` (read/write/admin), `last_used_at`, `expires_at`
- Rate limiting: 1000 req/hour (free), 10000 req/hour (Pro), unlimited (Enterprise) — Redis token bucket
- `Webhook` model: URL, event subscriptions, HMAC secret for request signing
- Webhook delivery: Celery queue with exponential backoff (3 retries: 1m / 5m / 30m)
- `WebhookDelivery` model: request headers + body + response code + response body + duration_ms
- Cursor-based pagination on all list endpoints (stable, no missed items on concurrent writes)

### Frontend
- **API Keys page** `/w/:ws/settings/api`:
  - "Generate API key" modal: name + scope selector (checkboxes) + expiry date picker
  - Key shown exactly once with one-click copy; cannot be retrieved again
  - Last used timestamp + revoke / regenerate buttons
  - Docs link to API reference
- **Webhooks page** `/w/:ws/settings/webhooks`:
  - Add webhook: URL input + event type multi-select + secret generation
  - "Send test event" button → shows response code + body inline
  - Delivery log per webhook: last 50 deliveries, expandable to see full request/response
- Interactive API docs at `/api/docs/` — "Try it" uses workspace API key, live responses

---

## v4.6.0 — Import & Migration Tools (Week 22) --- Do in Phase 06
> Status: IN PROGRESS 🔨
> **Goal:** Switching to JCN from any tool should take 10 minutes, not 10 days.

### Backend
- Import parsers: Jira XML export, Trello JSON, ClickUp CSV, Asana CSV, GitHub Issues JSON, Linear export, Notion CSV, Monday CSV, generic CSV with field mapping
- `ImportJob` model: status (queued/parsing/importing/complete/failed), progress (%), error log
- Import preview: parse file → return first 10 rows with detected field mapping (no data written yet)
- Duplicate detection: tasks with identical title + description not re-imported
- Import rollback: `DELETE /import-jobs/:id/rollback/` — removes all tasks created by that job (within 24h)

### Frontend
- **Import page** `/w/:ws/settings/import`:
  - Source cards: Jira / Trello / ClickUp / Asana / GitHub / Linear / Notion / Monday / CSV
  - Step 1: Upload file (drag-drop or browse)
  - Step 2: Field mapping — visual table: source field → JCN field (dropdown per row); auto-detected with confidence indicator
  - Step 3: Import preview — first 10 rows shown in task card format
  - Step 4: Import progress (real-time WebSocket: "347 / 1200 tasks imported…")
  - Step 5: Import report: "1,200 tasks imported, 12 skipped (duplicates), 3 warnings"
  - Rollback button: "Undo this import" (available for 24h)
- "Migrating from Jira?" helper link → step-by-step guide

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 6 — ENTERPRISE, SECURITY & LAUNCH (Weeks 23–26)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## v4.7.0 — Mobile Experience & PWA (Week 23)
> Status: IN PROGRESS 🔨
> **Gap filled:** ClickUp's mobile app is notoriously bad. Linear's is good but read-only for most things.

### Frontend
- Full responsive redesign pass — every page works at 375px (iPhone SE) without horizontal scroll
- Mobile navigation: bottom tab bar (Dashboard / Projects / My Work / Inbox / +Create)
- Mobile Kanban: horizontal swipe-snap columns, full-width cards
- Mobile task detail: bottom sheet drawer (swipe up to open, swipe down to close)
- Long-press to drag on mobile (touch-optimized drag-and-drop)
- PWA manifest + service worker:
  - Installable on iOS/Android home screen
  - Offline mode: read tasks from cache, queue mutations, sync when back online
  - Background sync API
- Web Push notifications (VAPID keys + subscription management)
- Mobile command palette: search with voice input via Web Speech API
- Touch gesture shortcuts: swipe right on task = complete, swipe left = archive

---

## v4.8.0 — Enterprise Security & Compliance (Week 23–24)
> Status: IN PROGRESS 🔨

### Backend
- SSO: SAML 2.0 + OAuth2 (Google Workspace, Microsoft Azure AD, Okta) via `python-social-auth`
- 2FA: TOTP authenticator app + 8 backup codes; enforce 2FA per workspace setting
- `AuditEvent` model: actor, action, resource_type, resource_id, before_state, after_state, ip_address, user_agent, timestamp — immutable, append-only
- IP allowlist: `WorkspaceIPAllowlist` model; middleware validates every request
- Session management: `UserSession` model; track all active sessions with device info
- GDPR: right-to-erasure endpoint (anonymises user data), data export ZIP (all workspace data), DPA template generation
- Data retention policies: auto-delete completed tasks after N days (configurable)

### Frontend
- SSO configuration page in workspace settings: connect identity provider, test connection
- 2FA setup flow: QR code scan, backup codes PDF download, recovery flow
- **Audit Log page** `/w/:ws/settings/audit`:
  - Searchable event stream: filter by actor, action type, resource, date range
  - Each event: who, what, when, from where (IP + device) — expandable JSON diff
- IP allowlist manager: add/remove CIDR ranges, test current IP
- Session manager: see all active sessions with device + location + last-active; revoke individual or all
- GDPR panel: export my data, delete my account, request workspace data export

---

## v4.9.0 — Billing & Workspace Plans (Week 24)
> Status: IN PROGRESS 🔨

### Backend
- `Plan` model: Free / Pro ($8/seat/mo) / Business ($16/seat/mo) / Enterprise (custom)
- Plan limits: Free = 5 members + 3 projects + no automations + no AI; Pro = unlimited members + 50 automations + 100 AI credits/mo; Business = unlimited everything + SSO + audit log
- `Subscription` model + Stripe Checkout + Customer Portal + webhook handlers
- `UsageRecord` model: daily snapshot of seats, storage (MB), AI tokens, automation fires
- 14-day trial auto-start on new workspace creation; no credit card required

### Frontend
- **Billing page** `/w/:ws/settings/billing`:
  - Current plan card with usage bars (seats used / storage / AI credits / automation fires)
  - Upgrade CTA → feature comparison modal (not a separate page)
  - Stripe checkout integration (opens Stripe hosted page)
  - Billing history: invoice list with PDF download links
- Feature gate UX: clicking a locked feature shows "Upgrade to Pro" modal with 3 bullet reasons + CTA — never a redirect or an error
- Plan badge in workspace switcher: "Free" / "Pro" / "Business" chip
- Trial countdown banner: "11 days left in your Pro trial" with dismiss

---

## v5.0.0 — Advanced Workflow & Custom Field Power (Week 25)
> Status: IN PROGRESS 🔨
> **Gap filled:** ClickUp has this but it's overwhelming. JCN's implementation is guided and opinionated.

### Backend
- `WorkflowTransition` model: allowed status transitions per board (directed graph config)
- `StatusRequirement` model: fields required when transitioning to a specific status (e.g. assignee required before "In Progress"; acceptance criteria required before "Done")
- `SLAPolicy` model: time targets per priority (Urgent: 4h, High: 24h, Medium: 72h, Low: none)
- SLA breach: Celery beat checks every 15 minutes; breach → notification + `sla_breached` flag on task
- Custom field additions: `multi_select`, `people` (multi-assignee), `phone`, `email`, `rating` (1–5 stars), `money` (with currency), `formula` (computed from other fields), `rollup` (aggregate from subtasks)

### Frontend
- **Workflow Builder** in Board Settings → Workflow tab:
  - Visual graph: status nodes + directed edge arrows = allowed transitions
  - Click and drag to add/remove transitions
  - "Required fields" per transition: checklist of all task fields
  - "Blocked" state: show red lock icon on transition arrow if requirements not met
- SLA indicators on task cards: green ✓ / orange ⚠ overdue / red 🔴 breached
- SLA filter: "Show: SLA breached" in filter bar
- Custom field: `formula` editor with autocomplete (`{hours} * {hourly_rate}`)
- Custom field: `rollup` — show sum/avg/count of any field from child tasks
- Multi-people field: assignee chips (multiple), each notified on task create

---

## v5.1.0 — Final Polish, Performance & Launch (Week 26)
> Status: IN PROGRESS 🔨
> **Goal:** The finished product should feel like it took 3 years to build, not 6 months.

### Performance Targets
- API response P95 < 200ms (with Redis caching + query optimisation)
- Frontend LCP < 1.5s on 4G (code splitting + prefetch on hover)
- Bundle size < 200KB initial JS (tree-shaking + dynamic imports per route)
- Lighthouse: 95+ Performance, 100 Accessibility, 100 Best Practices, 95+ SEO
- WebSocket reconnection gracefully handled (exponential backoff, state reconciliation)
- Virtual scrolling for task lists > 200 items (`@tanstack/react-virtual`)

### Design Audit
- Full UI pass against Emil Kowalski design engineering checklist:
  - All animations reviewed at 0.25× speed — remove anything that feels off
  - No `transition: all` anywhere — every transition specifies exact properties
  - No `ease-in` on UI elements — always `ease-out` or custom curve
  - No `scale(0)` entrances — minimum `scale(0.95)` + opacity
  - Keyboard actions have zero animation — instant feedback
  - All popovers/dropdowns: origin-aware `transform-origin`
  - Tooltips: 300ms initial delay, 0ms on subsequent (feels faster across toolbar)
- Typography audit: consistent scale, no rogue font sizes, no mixed weights
- Colour audit: WCAG AA on all text/background combinations
- Icon audit: consistent Lucide usage, no mixing styles or sizes
- Spacing audit: strict 4px grid — no arbitrary values

### Quality Gates
- End-to-end test suite (Playwright): all critical user flows covered
- Unit test coverage > 80% on backend business logic
- Accessibility: full keyboard navigation tested, VoiceOver + NVDA screen reader pass
- Security: OWASP Top 10 audit, CSRF + XSS + SQL injection pen test
- Load test: 500 concurrent users, P99 API response < 500ms

### Launch Checklist
- Public changelog page `/changelog` — rendered from this CHANGELOG.md
- Documentation site with full-text search (Docusaurus or custom)
- Status page (Statuspage.io) with historical uptime
- Onboarding email sequence: Day 0 (welcome), Day 3 (tips), Day 7 (features), Day 14 (upgrade CTA)
- Beta waitlist → first 100 users → early access program
- Referral program: invite 3 colleagues → get 1 month Pro free

---

> ## 6-Month Summary
>
> | Phase | Weeks | Key Deliverables |
> |-------|-------|-----------------|
> | Design System & Architecture | 1–4 | Themes, animations, access control, multi-board, onboarding |
> | Task Power Features | 5–8 | Hierarchy, rich text, wiki, forms, automation, time tracking |
> | Views & Visualization | 9–13 | Calendar, Gantt, table view, advanced search, dashboards, portfolio |
> | Collaboration & Communication | 14–17 | Presence, approvals, inbox, OKRs, keyboard shortcuts |
> | Analytics & Integrations | 18–22 | Analytics engine, report builder, GitHub, Slack, AI, public API, import |
> | Enterprise & Launch | 23–26 | Mobile PWA, SSO, billing, workflow builder, custom fields v2, final polish |
>
> **After 6 months JCN will have:**
> - Better UX than Linear
> - More structured PM power than Notion
> - Less complexity than ClickUp with more features for what teams actually use
> - Better reporting than Asana
> - Jira-level depth without Jira's interface tax
> - A pricing model that makes Monday irrelevant for teams under 200 people

