# JCN — Product Roadmap & Changelog

> **Vision:** A management ecosystem for growing businesses — not a single app, but a suite of purpose-built modules that share a common workspace, identity, and permission layer. Projects. People. HR. All in one place.
>
> **Target:** Teams of 10–200 people who are tired of paying enterprise prices for tools that treat them like an afterthought.
>
> **Why existing tools fail small businesses:**
>
> - **Jira** — built for enterprise, feels like filing taxes
> - **ClickUp** — so many features it becomes paralysing
> - **Notion** — great docs, weak structured project tracking
> - **Linear** — beautiful but too opinionated, no people management
> - **Asana/Monday** — dated UX, expensive seats, weak developer experience
> - **BambooHR / Workday** — HR tools that assume you have a full HR department to run them
>
> **JCN wins by:** One workspace. Every tool your team actually uses. Fast, beautiful, and priced for real businesses.

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
- **KanbanColumn**: `ring-1 ring-primary/20` on drag-over state, `rounded-md` droppable area
- **TaskCard**: `rounded-md`, `shadow-card` + `shadow-card-hover`, subtask progress bar replaces text counter, `rotate-[0.8deg]` on drag
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
>
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

> Status: COMPLETE ✅ _(spec revised — see note)_
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
>
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
  - Markdown shortcuts active: `## ` → H2, `- ` → bullet, ` ``` ` → code block
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
>
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

> Status: COMPLETE ✅ _(scope scoped down — see implementation note)_
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
- **Two-column layout** (max-w-6xl, rounded-md):
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
>
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

- **Nav groups** — sidebar links now grouped with section labels: _(unlabelled)_ Dashboards / Projects → **Work** Inbox / My Work / Goals → **Views** Portfolio / Roadmap / Timesheets → **Workspace** Members / Settings
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

## PHASE 5 (PRE) — ANALYTICS & REPORTING (Weeks 18–19)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Pre-Phase 5 scope:** Pure analytics and reporting — no third-party integrations, no AI. Builds directly on:
>
> - Custom Dashboards system (v3.3.0) — Analytics Engine v2 replaces the built-in "Analytics" tab
> - Celery infrastructure (v2.7.0) — used by `ScheduledReport` delivery
> - Redis caching (v0.1.0 channel layer) — extended for heavy analytics query TTL
>
> **Validation:** No conflicts with Phases 1–4 changes. All new models (`AnalyticsSnapshot`, `Report`, `ScheduledReport`, `ReportShare`) are additive. Routes (`/reports`) are new and do not overlap with existing namespaces.

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

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE 5 (POST) — INTEGRATIONS & AI BUILDER (Weeks 19–22)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Post-Phase 5 scope:** All third-party integrations (GitHub/GitLab, Slack/Teams, Public API & Webhooks, Import tools) plus AI-powered features. These have zero overlap with Pre-Phase 5 analytics work — all models, routes, and signals introduced here are additive.
>
> **No conflicts with completed phases:** Git integration, AI sessions, webhooks, and import jobs are entirely new subsystems. Celery (v2.7.0) and Redis (v0.1.0) infrastructure they rely on is already in place.

---

## v4.2.0 — GitHub & GitLab Integration (Week 19) - Not needed at the moment ❌

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

## v4.3.0 — Slack, Microsoft Teams & Google Chat Integration (Week 20)

> Status: COMPLETE ✅
> **Google Chat added** beyond original spec — all three platforms fully supported.

### Backend — new `integrations` Django app

- **Models**: `SlackIntegration` (OAuth token store), `TeamsIntegration` (webhook), `GoogleChatIntegration` (webhook), `IntegrationChannelMapping` (project → channel/space, per-platform), `SlackCommandLog` (audit log)
- **Slack OAuth flow**: `GET /api/integrations/slack/oauth/begin/` → Slack → `GET /api/integrations/slack/oauth/callback/` — stores bot token, creates default workspace-wide mapping
- **Slash commands** (Slack signing secret verified): `/jcn create <title>`, `/jcn list`, `/jcn status <keyword> <status>`, `/jcn assign <keyword> <email>`, `/jcn help`
- **Slack interactive handler**: `POST /api/integrations/slack/interactive/` — handles "Approve" button click, resolves `ApprovalReviewer` from the matching JCN user
- **Teams**: `PUT /api/workspaces/:slug/integrations/teams/` + `POST …/test/` — saves webhook, sends a live test MessageCard
- **Google Chat**: `PUT /api/workspaces/:slug/integrations/google-chat/` + `POST …/test/` — saves webhook, sends a live test card
- **Channel mappings CRUD**: `/api/workspaces/:slug/integrations/mappings/` — per-project or workspace-wide, per-event toggles (7 types), compact/detailed format, per-mapping webhook override
- **Notification fanout** (`integrations/services.py`): `fanout_notification()` hooked into `projects.views.notify()` after every task event; failures silently logged — never break the main request
- **Message formats**: Slack Block Kit (with "Open in JCN" action button), Teams MessageCard (legacy connector — no Power Apps required), Google Chat cardsV2 (with action button)
- **Status endpoint**: `GET /api/workspaces/:slug/integrations/` — returns live connection state + OAuth config flag

### Frontend — `/w/:ws/settings/integrations`

- **Slack card**: "Add to Slack" OAuth button (gated on server config), connected team name + channel, slash command reference, setup guide (collapsible step-by-step with required scopes and redirect URL)
- **Teams card**: webhook URL + display name form, live "Test" button sends MessageCard
- **Google Chat card**: webhook URL + space name label, live "Test" button sends card
- **Channel mapping UI**: per-project or workspace-wide scope, event picker (7 types), compact/detailed toggle, per-mapping webhook override, active toggle
- **Navigation**: "Integrations" added to sidebar Workspace group; quick-link card added to `SettingsPage`
- **Env vars required**: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `FRONTEND_URL`

### Bugs found + fixed during implementation

- `fanout_notification` imported lazily inside `notify()` (not at module level) to avoid circular import between `projects` and `integrations` apps

---

## v4.4.0 — AI-Powered Features (Week 20–21) - Not needed at the moment ❌

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

> Status: COMPLETE ✅
> **Gap filled:** Most tools have read-heavy, rate-limited APIs at lower tiers. JCN gives full API access from day 1.

### Backend

- **`WorkspaceAPIKey` model** — name, `key_prefix` (first 12 chars for display), SHA-256 hash (never stored raw), `scopes` (read/write/admin JSON list), `last_used_at`, `expires_at`, `is_active`; `WorkspaceAPIKey.generate()` returns `(instance, raw_key)` — raw key is only available at creation time
- **`APIKeyAuthentication`** DRF authenticator (`workspaces/authentication.py`) — validates `Authorization: Bearer jcn_<key>`, updates `last_used_at`, sets `request.api_key` for scope checks in views
- **`Webhook` model** — workspace FK, name, URL, `events` (JSON list of subscribed event names), HMAC `secret` (auto-generated via `secrets.token_hex(32)`), `is_active`; `Webhook.create_with_secret()` class method
- **`WebhookDelivery` model** — immutable log: `event`, `request_body`, `response_code`, `response_body`, `duration_ms`, `success`, `attempt`
- **Celery task** (`workspaces/tasks.py`) — `deliver_webhook(webhook_id, event, payload_dict)`: HMAC-signs with `X-JCN-Signature: sha256=<digest>` + `X-JCN-Timestamp`; exponential retry backoff (attempt 1 → 5 min → 30 min); each attempt logged to `WebhookDelivery`
- **Webhook fanout** — `_fire_webhooks()` hooked into `broadcast()` in `projects/views.py`; maps 8 internal event names to public webhook event names; fires Celery tasks asynchronously, never blocks the request
- **API endpoints**: `GET+POST /api-keys/`, `DELETE /api-keys/:id/`, `GET+POST /webhooks/`, `PATCH+DELETE /webhooks/:id/`, `POST /webhooks/:id/test/`, `GET /webhooks/:id/deliveries/`

### Frontend

- **API Keys page** `/w/:ws/settings/api` — key table with prefix, scopes, last-used, expiry; "Generate key" modal (name + scope checkboxes + optional expiry); raw key shown exactly once with one-click copy in an alert dialog; revoke button per key; link to `/api/docs/`
- **Webhooks page** `/w/:ws/settings/webhooks` — webhook cards with active indicator, URL, "Test" button (queues Celery task), "Log" toggle; delivery log per webhook (last 50: event, HTTP code, duration, timestamp, expandable response body); inline edit form per webhook: name, URL, event picker (10 events), signing secret display, active toggle; signing secret shown once at creation
- **SettingsPage** — "Developer & Integrations" grid linking to Integrations, API Keys, Webhooks, Import

---

## v4.6.0 — Import & Migration Tools (Week 22)

> Status: COMPLETE ✅
> **Goal:** Switching to JCN from any tool should take 10 minutes, not 10 days.

### Backend

- **`ImportJob` model** (`projects/models.py`) — `source` (9 choices), `status` (pending/parsing/mapped/importing/complete/failed), `parsed_rows` (full JSON), `preview_rows` (first 10), `field_mapping`, progress counters, `imported_task_ids` list (for rollback), `created_by`, `completed_at`
- **Import parsers** (`projects/importers/`):
  - `jira.py` — Jira XML RSS export: parses `<item>` elements, extracts summary, type, priority, status, assignee email, due date (RFC 2822 → ISO), labels; normalises priority + task type
  - `trello.py` — Trello board JSON: resolves list-id → status name, card members → assignee email, labels, due dates
  - `csv_parser.py` — generic CSV: auto-detection heuristic scores 30+ column name patterns against 11 JCN fields; returns `{col: {jcn_field, confidence}}` for the mapping step; `apply_mapping()` converts any CSV row dict to a `ParsedTask`; supports ClickUp / Asana / Linear / Notion / Monday / GitHub Issues exports
  - `base.py` — `ParsedTask` dataclass with `to_dict()` / `from_dict()`; `normalize_priority()` + `normalize_type()` tables
  - `registry.py` — maps 9 source keys to their parser modules + format hints
- **Celery task** (`projects/tasks.py`) — `run_import(job_id)`: creates/resolves target project, resolves task statuses and assignees by name/email, creates Task + Label objects in batches, broadcasts `import.progress` WebSocket events every 5%, saves `imported_task_ids` for rollback
- **5 endpoints**: `GET /import/sources/`, `GET+POST /import/jobs/`, `GET+PATCH /import/jobs/:id/`, `POST /import/jobs/:id/run/`, `DELETE /import/jobs/:id/rollback/` (24h window, deletes created tasks)

### Frontend — `/w/:ws/settings/import` (5-step wizard)

- **Step 1 — Source picker**: 9 source cards with logo emoji + format label
- **Step 2 — Upload**: tool-specific instructions + drag-drop zone; file parsed server-side on upload (no data written yet)
- **Step 3 — Field mapping**: editable dropdown per column (CSV) or read-only mapping table (XML/JSON); confidence badge (green/amber/grey) per auto-detected mapping
- **Step 4 — Preview**: first 10 parsed rows in a table with title, status, priority, type, assignee, due date columns
- **Step 5 — Progress**: real-time progress bar fed by `import.progress` WebSocket events; total / imported / skipped stat cards; "Start another import" reset button
- **Import history**: list of past jobs with status, count stats, and "Undo" rollback button (available 24h after completion)
- Real-time updates via existing `useWorkspaceSocket` hook (no new WebSocket infra needed)

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
> | Phase                                    | Weeks | Key Deliverables                                                                      |
> | ---------------------------------------- | ----- | ------------------------------------------------------------------------------------- |
> | Design System & Architecture             | 1–4   | Themes, animations, access control, multi-board, onboarding                           |
> | Task Power Features                      | 5–8   | Hierarchy, rich text, wiki, forms, automation, time tracking                          |
> | Views & Visualization                    | 9–13  | Calendar, Gantt, table view, advanced search, dashboards, portfolio                   |
> | Collaboration & Communication            | 14–17 | Presence, approvals, inbox, OKRs, keyboard shortcuts                                  |
> | Analytics & Reporting (Phase 5 Pre)      | 18–19 | Analytics engine v2, cycle/lead time, CFD, burnup, report builder, scheduled delivery |
> | Integrations & AI Builder (Phase 5 Post) | 19–22 | GitHub/GitLab, Slack/Teams, AI-powered features, public API & webhooks, import tools  |
> | Enterprise & Launch                      | 23–26 | Mobile PWA, SSO, billing, workflow builder, custom fields v2, final polish            |
>
> **After 6 months JCN will have:**
>
> - Better UX than Linear
> - More structured PM power than Notion
> - Less complexity than ClickUp with more features for what teams actually use
> - Better reporting than Asana
> - Jira-level depth without Jira's interface tax
> - A pricing model that makes Monday irrelevant for teams under 200 people

---

---

# V2 — MANAGEMENT ECOSYSTEM (Next 6 Months)

> **The pivot.** JCN launched as a project management tool. Five phases later, the foundation is solid — tasks, sprints, wikis, automations, real-time collaboration, analytics, and integrations are all shipped. Now we expand into a full management ecosystem.
>
> The next six months build three major apps on top of that foundation: an org structure layer so every workspace has a real company skeleton, and an HR module so small businesses can manage their people without buying BambooHR. Custom RBAC lands in Week 19 — after we have three apps running, because granular permissions only matter when there is real complexity to protect. The public landing page ships last — once the ecosystem has two or three apps to showcase, the story writes itself.
>
> **North star:** By Week 26, a 50-person company should be able to run their entire operational layer on JCN — projects, people, and HR — without a single external tool. Then we launch to the world.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE A — ECOSYSTEM RELAUNCH (Weeks 1–2)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Remove signup friction. Make the first 10 minutes count. The landing page comes at launch — once we have a full ecosystem to show, not just one app.

---

## vA.1 — Google OAuth Signup & Login (Week 1)

> Status: COMPLETE ✅

### Backend

- Added `allauth.socialaccount.providers.google` to `INSTALLED_APPS` — no new major package, just activating the Google provider that was already bundled with allauth
- Upgraded `dj-rest-auth` to `dj-rest-auth[with-social]` to unlock `SocialLoginView` base class
- Added `resend==2.10.0` to requirements for invite emails (Week 2)
- `SOCIALACCOUNT_PROVIDERS` config in `settings.py` — scoped to `profile` + `email` only, credentials read from env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- `SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True` — a Google sign-in with an existing email+password account silently merges the two identities, no error thrown
- `SOCIALACCOUNT_STORE_TOKENS = False` — Google access tokens are not persisted in the DB
- New file `accounts/social_views.py` — `GoogleLogin(SocialLoginView)` with `GoogleOAuth2Adapter` and `OAuth2Client`; response shape is identical to email login (access + refresh JWT pair)
- New URL `POST /api/auth/google/` wired in `accounts/urls.py` — accepts `{ access_token }` from frontend, returns same JWT pair as email auth
- `FRONTEND_URL` in settings now reads `VITE_FRONTEND_URL` from `.env` (was reading a separate `FRONTEND_URL` key that didn't exist)
- `RESEND_API_KEY` and `FROM_EMAIL` added to settings — reads from `.env`, defaults to `onboarding@resend.dev` for local dev (no domain verification needed)

### Frontend

- Installed `@react-oauth/google` — Google's official React SDK; handles the OAuth popup and returns an access token
- `VITE_GOOGLE_CLIENT_ID` added to `frontend/.env`
- `App.jsx` wrapped with `GoogleOAuthProvider` (client ID from env); stray backtick in route definition also fixed
- `authStore.js` — new `googleLogin(accessToken)` method: POSTs to `/api/auth/google/`, stores JWT pair, same flow as email login
- New component `components/auth/GoogleButton.jsx` — shared button using `useGoogleLogin` hook (implicit flow); calls `googleLogin()` on success, surfaces specific error message on failure
- `LoginPage.jsx` + `RegisterPage.jsx` — Google button added above the email form with an "or continue with email" divider; "account already exists" error shown inline without disrupting the form

### Setup & Env

- Signed up for Resend, API key stored in `backend/.env`
- Google Cloud Console project created — OAuth 2.0 credentials (Client ID + Secret) stored in `backend/.env`
- `README.md` updated with step-by-step Google Cloud Console setup guide and Resend configuration instructions

---

## vA.2 — Invite Flow Upgrade (Week 2)

> Status: COMPLETE ✅

### Backend

- `send_invite_email(invite_id)` Celery task in `workspaces/tasks.py` — 2 retries, 60s delay; fetches invite with `select_related(workspace, invited_by)`, builds inline HTML email (workspace initial, inviter name, role, CTA), sends via Resend SDK (`resend.Emails.send()`)
- `InviteMemberView` updated to fire `send_invite_email.delay(str(invite.id))` immediately after the invite row is created — fire-and-forget, does not block the API response
- `BACKEND.md` and `FRONTEND.md` updated to document all new endpoints, the Celery task, and both onboarding flows (admin path and invited-user path)

### Frontend

- `AcceptInvitePage.jsx` fully redesigned for unauthenticated users: workspace initial/logo, inviter name, workspace name, role badge, "What you'll get" feature list (Zap / Users / BarChart2), two CTAs:
  - "Create account to join" → stores token in `localStorage("pendingInvite")`, navigates to `/register?invite=TOKEN&email=EMAIL`
  - "I already have an account" → navigates to `/login?next=/invites/TOKEN&email=EMAIL`
- `RegisterPage.jsx` — reads `?invite=TOKEN` and `?email=` params; after email registration OR Google OAuth auto-calls `POST /api/invites/:token/accept/` and navigates directly to the workspace — no second click
- `authStore.googleLogin()` — reads `pendingInvite` from `localStorage` on Google auth success, returns it to the component so invite is accepted before navigation
- `LoginPage.jsx` + `RegisterPage.jsx` — email field pre-filled from `?email=` param; Google OAuth error shown inline
- New `components/workspace/InviteModal.jsx` — replaces the old inline form on MembersPage:
  - Email chip input (comma / space / Enter / Tab to add, Backspace to remove last, paste support)
  - 3-role card picker (Member / Viewer / Admin) with description per role
  - Send button shows live count ("Send 3 invites"); fires `Promise.all` over `useInviteMember` mutations
  - Success flash (CheckCircle2 + count) auto-closes modal after 1.8s
  - "Copy invite link" footer action
- `MembersPage.jsx` — inline invite form replaced with a primary "Invite members" button in the page header; pending invites list promoted to its own standalone card; `InviteModal` rendered at the bottom and wired to the button
- `SetupWizard.jsx` ReadyStep — polls `GET /api/workspaces/:id/invites/pending/` every 5s when invites were sent; shows live "X accepted · Y pending" counter with CheckCircle2 / Clock icons
- `useMembers.js` — added `usePendingInvites(workspaceId, { refetchInterval })` and `useCancelInvite(workspaceId)` hooks

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE B — ORG STRUCTURE (Weeks 4–10)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Give every workspace a real company skeleton — departments, teams, reporting lines, and job titles. This is the structural layer that HR Management (Phase C) builds on, and the team-filtering layer that makes task assignment smarter.
>
> **Why small businesses need this first:** A 50-person company without an org chart is 50 people in a Slack channel. Org structure gives new hires a reporting line, gives task filters a "team" concept, and gives managers a visual answer to "who does what."
>
> **Architecture note:** `WorkspaceMember` is NOT replaced. It remains the platform access record. Org structure models are additive — they describe the company's real-world shape on top of tool access.

---

## vB.1 — Departments & Teams (Weeks 4–6)

> Status: PLANNED 📋

**Backend — new `people` Django app**

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Department` | `workspace` FK, `name`, `head` FK→User (nullable), `parent` FK self (nested depts), `order` | UUIDv7 PK; supports Engineering → Backend nesting |
| `Team` | `workspace` FK, `department` FK (nullable), `name`, `description`, `lead` FK→User (nullable) | Can be cross-functional (no dept) |
| `TeamMembership` | `team` FK, `user` FK, `job_title`, `level` (JUNIOR/MID/SENIOR/LEAD/MANAGER/DIRECTOR/C_LEVEL), `is_lead` | `unique_together: [team, user]` |

**Indexes**: `dept_workspace_parent_idx`, `team_workspace_dept_idx`, `membership_team_user_idx`

**API surface**
- `GET/POST /api/workspaces/{ws}/departments/`
- `GET/PATCH/DELETE /api/workspaces/{ws}/departments/{id}/`
- `GET/POST /api/workspaces/{ws}/teams/`
- `GET/PATCH/DELETE /api/workspaces/{ws}/teams/{id}/`
- `GET/POST /api/workspaces/{ws}/teams/{id}/members/`
- `PATCH/DELETE /api/workspaces/{ws}/teams/{id}/members/{mid}/`

**Frontend — new "People" sidebar group**

- **Teams page** `/w/:ws/teams`:
  - Grid of team cards: name, department badge, lead avatar, member count chip
  - Click team → team detail page: member list with level badges, description, lead highlight, edit controls (admin only)
  - "Create team" modal: name, department picker, optional lead assignment
  - Add members to team: workspace member search + level selector
- **Departments page** `/w/:ws/departments`:
  - Nested list with indentation showing parent/child hierarchy (collapsible)
  - Per department: head avatar, team count, total member count
  - Inline create, rename, re-parent (drag handle), set head
  - Reorder within the same level (drag-and-drop, persisted to `order` field)

---

## vB.2 — Employee Profiles & Org Chart (Weeks 7–10)

> Status: PLANNED 📋

**Backend**

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `EmployeeProfile` | `workspace_member` O2O, `department` FK (nullable), `job_title`, `employment_type` (FULL_TIME/PART_TIME/CONTRACTOR/INTERN), `start_date`, `reports_to` FK→User (nullable), `employee_id` (CharField) | Auto-created on `WorkspaceMember` creation via `post_save` signal |

**API surface**
- `GET/PATCH /api/workspaces/{ws}/members/{id}/profile/`
- `GET /api/workspaces/{ws}/org-chart/` — full tree (dept → sub-depts → teams → members) in one response; used by the org chart page

**Frontend**

- **Member Profile Card** (extended from existing `MembersPage`): shows job title, level badge, department, team(s), direct reports count, start date, employee ID — editable by admins inline
- **Org Chart page** `/w/:ws/org-chart`:
  - Tree layout: company root → departments → sub-departments → teams → members
  - Zoom in/out (scroll wheel / pinch), drag to pan
  - Each node: avatar, name, title — compact at low zoom, expanded at high zoom
  - Click a node → profile card popover with quick links (send message, view tasks)
  - Controls: "Collapse all" / "Expand all", view switcher (Hierarchy / By Department / By Team)
  - Admin controls: drag node to re-parent (triggers `PATCH profile` for department/reports_to)
- **Task filtering by team**: "Team" option added to `FilterBar` assignee picker in the Kanban board — selects all members of a team as a group filter
- **Command Palette**: `@Backend Team` resolves to all team members as a compound assignee filter

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE C — HR MANAGEMENT (Weeks 11–18)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** People operations on top of the org structure. Leave management, attendance, and employee lifecycle — BambooHR-lite for businesses that can't afford BambooHR and don't want to pay Workday.
>
> **Why it has major daily impact:** Leave requests happen every week. "Who's off today?" gets asked in every standup. Attendance records are something every manager needs. Getting this right removes an entire category of external tooling for small businesses.
>
> **Depends on:** Phase B (Org Structure) — departments and teams must exist to manage people within them.

---

## vC.1 — Leave Management (Weeks 11–14)

> Status: PLANNED 📋

**Backend**

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `LeavePolicy` | `workspace` FK, `name`, `leave_type` (ANNUAL/SICK/UNPAID/PATERNITY/MATERNITY/COMPASSIONATE), `days_per_year`, `carry_over_days`, `accrual_type` (UPFRONT/MONTHLY) | Workspace-level policy config; multiple policies of the same type allowed |
| `LeaveBalance` | `employee` FK→WorkspaceMember, `policy` FK, `year`, `total_days`, `used_days`, `pending_days` | Computed from approved requests; updated on every status change |
| `LeaveRequest` | `employee` FK→WorkspaceMember, `policy` FK, `start_date`, `end_date`, `reason`, `status` (PENDING/APPROVED/REJECTED/CANCELLED), `approver` FK→User (nullable), `reviewed_at` | Approval notifications fire through the existing `notify()` + WebSocket system |

**Indexes**: `leave_balance_employee_year_idx`, `leave_request_employee_status_idx`

**API surface**
- `GET/POST /api/workspaces/{ws}/hr/leave-policies/`
- `PATCH/DELETE /api/workspaces/{ws}/hr/leave-policies/{id}/`
- `GET/POST /api/workspaces/{ws}/hr/leave-requests/` — employee: own requests; admin: all requests; `?status=pending` filter
- `PATCH /api/workspaces/{ws}/hr/leave-requests/{id}/review/` — admin/manager only; payload: `{status, comment}`
- `GET /api/workspaces/{ws}/hr/leave-balances/` — employee: own balances; admin: all employees
- `GET /api/workspaces/{ws}/hr/whos-off/` — returns today + next 7 days; used by dashboard widget

**Frontend — HR section (new sidebar group)**

- **Leave page** `/w/:ws/hr/leave`:
  - **My Leave tab**: balance cards per policy (e.g. "Annual Leave: 12 / 25 days used"), coloured progress bar, request history list with status chips
  - **Request form**: policy picker, date range picker (highlights existing leaves, blocks weekends, shows remaining balance live), reason textarea, submit for approval
  - **Team calendar tab**: monthly view, approved leaves shown as coloured bars per member, colour by leave type; exportable as iCal feed
  - **Manager queue tab** (admin/lead only): pending request cards — employee name, policy, dates, reason; Approve / Reject + comment; bulk-approve selected
- **"Who's off today?" Dashboard widget**: avatar stack of members on approved leave today with leave type label; links to team calendar
- **Leave balance widget** on Dashboard: compact donut or bar chart of the current user's annual leave (used/remaining)
- **Notifications**: request submitted → manager notified (bell + email digest); request approved/rejected → employee notified

---

## vC.2 — Attendance Tracking (Weeks 15–17)

> Status: PLANNED 📋
> **Scope:** Manual clock-in/out + QR-code clock-in for office locations. GPS and biometric are enterprise features deferred to a later release.

**Backend**

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Attendance` | `employee` FK→WorkspaceMember, `date`, `clock_in`, `clock_out`, `source` (MANUAL/QR/API), `notes` | `clock_out` nullable = currently clocked in; one row per employee per day |
| `AttendancePolicy` | `workspace` FK, `work_start_time`, `work_end_time`, `grace_period_minutes`, `weekly_hours` | Defines "expected" schedule for late/early detection |

**API surface**
- `POST /api/workspaces/{ws}/hr/attendance/clock-in/`
- `POST /api/workspaces/{ws}/hr/attendance/clock-out/`
- `GET /api/workspaces/{ws}/hr/attendance/` — admin view; `?employee=&date_range=`
- `GET /api/workspaces/{ws}/hr/attendance/my/` — own records
- `GET /api/workspaces/{ws}/hr/attendance/summary/` — weekly hours + late count per employee; used for the admin grid
- `GET /api/workspaces/{ws}/hr/attendance/qr/` — generates a daily QR code (admin only); scan → auto clock-in

**Frontend**

- **Attendance tab** in HR section:
  - Large clock-in/clock-out button (primary action, shows current status: "Clocked in at 9:02 AM")
  - Daily status strip: in-time · out-time · total hours · status (On Time / Late / Absent)
  - Personal calendar: colour-coded cells (green/amber/red/grey) with hover tooltip showing exact times
  - Weekly hours bar chart: actual vs expected, coloured by status
- **QR clock-in** (admin generates): daily QR code displayed on a TV or printout; employees scan with phone → auto clock-in via the mobile-optimised `/attendance/qr/{code}` page
- **Admin attendance grid**: member × day matrix, hours per cell, weekly total column, export CSV, filter by department/team
- **Automation trigger**: `attendance.late` → notify manager (hooks into existing automation engine)

---

## vC.3 — HR Dashboard & Employee Lifecycle (Week 18)

> Status: PLANNED 📋

**Backend**

- `EmployeeDocument` model: `employee` FK, `doc_type` (CONTRACT/ID/CERTIFICATE/OTHER), `file`, `expiry_date`, `uploaded_by` — files stored in `media/employee_docs/`; admin-only access
- `EmployeeNote` model: `employee` FK, `author` FK, `content`, `is_private` — private manager notes; never visible to the employee
- Headcount analytics endpoint: joiners/leavers per month (derived from `EmployeeProfile.start_date`), employment type split, department headcount distribution

**Frontend**

- **HR Dashboard** `/w/:ws/hr`:
  - **Headcount card**: total employees, joiners this month, leavers this month (clickable — links to employee list filtered by start date)
  - **Leave overview**: total days taken across workspace this month; breakdown by leave type and department
  - **Attendance overview**: avg on-time %, late count, absent count for the rolling week
  - **Upcoming events**: birthdays, work anniversaries, contract expiry warnings — pulled from `EmployeeProfile` fields
- **Employee detail page** `/w/:ws/members/{id}` (extends existing member detail):
  - **Profile tab**: all `EmployeeProfile` fields editable inline by admins; employment type badge, start date, reports-to chip
  - **Documents tab**: upload, list with expiry date, download, expiry warning badges (red if <30 days)
  - **Leave history tab**: full request history with status timeline
  - **Notes tab**: private manager notes; add/edit/delete; invisible to the employee themselves
- **New employee onboarding checklist** (admin-configurable): "Complete profile" / "Upload ID" / "Sign contract" — shown as a checklist on the employee's detail page until all steps done

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE D — CUSTOM RBAC (Weeks 19–22)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Replace the hardcoded admin/member/viewer role strings with admin-defined custom roles that carry granular permission flags — now that the ecosystem has three apps (Projects, Org Structure, HR), there is real complexity to protect.
>
> **Why Week 19 and not Week 1:** RBAC at Week 1 would have been premature — there was a single app. With three modules running, a business now genuinely needs to say "HR managers can approve leave but cannot delete projects" or "team leads can view the org chart but cannot edit payroll data." The complexity is now real; the solution is warranted.

---

## vD.1 — Role Builder Backend (Weeks 19–20)

> Status: PLANNED 📋

**Backend — extends `workspaces` app**

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `CustomRole` | `workspace` FK, `name`, `description`, `is_system` bool, `permissions` JSONField (`{"task.create": true, "hr.manage_leave": false, ...}`) | `is_system=True` protects built-in roles from edit/delete |
| `RoleAssignment` | `workspace_member` O2O, `role` FK→CustomRole | Replaces the `role` text field on `WorkspaceMember` |

**Permission surface (initial set)**

```
# Projects
project.create    project.delete    project.admin
task.create       task.delete       task.edit
sprint.manage     automation.manage

# People & HR
member.invite     member.remove     member.view_profile
hr.view           hr.manage_leave   hr.manage_attendance
org.view          org.manage

# Workspace
report.view       settings.manage   api_keys.manage
```

**Migration path**
1. Create three system roles (`Admin`, `Member`, `Viewer`) that mirror current hardcoded behaviour exactly
2. Backfill `RoleAssignment` rows from existing `WorkspaceMember.role` text values
3. New permission checks use `has_workspace_permission(user, workspace, action)` — checks `CustomRole.permissions` JSON
4. `WorkspaceMember.role` text field kept for one release (backward compat), then removed

**API surface**
- `GET/POST /api/workspaces/{ws}/roles/`
- `GET/PATCH/DELETE /api/workspaces/{ws}/roles/{id}/`
- `POST /api/workspaces/{ws}/members/{id}/assign-role/`

---

## vD.2 — Role Builder UI (Weeks 21–22)

> Status: PLANNED 📋

**Frontend — Workspace Settings → Roles tab**

- **Roles list sidebar**: system roles (lock icon, non-deletable) + custom roles; "Create role" button; "Duplicate" action on any role as a starting point
- **Role editor** (right panel):
  - Name + description fields
  - Permission toggles grouped by module: **Projects** · **HR** · **Org Structure** · **Members** · **Settings**
  - Each toggle: label + one-line plain-English description ("Can approve or reject leave requests")
  - Dependency warnings: toggling on `hr.manage_leave` auto-enables `hr.view` with a tooltip
- **Member assignment** (Members page): role dropdown now lists custom roles; multi-select members → assign role in bulk
- **Permission preview card** ("What can this role do?"): collapsible read-only list of all enabled permissions written as sentences — for communicating role scope to non-technical admins
- **Audit trail**: every role change logged to `AuditEvent` (already exists from v2.1.0)

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE E — PLATFORM & LAUNCH (Weeks 23–26)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Polish, harden, price, and ship. A product that feels finished, performs fast, and can be paid for.

---

## vE.1 — Mobile PWA (Week 23)

> Status: PLANNED 📋
> **Scope:** The highest-value mobile flows only — not full feature parity. Full feature parity is a separate milestone.

**What ships**
- Full responsive redesign pass: every existing page usable at 375px without horizontal scroll
- Mobile navigation: bottom tab bar (Home / Projects / My Work / HR / + Create)
- Mobile Kanban: horizontal swipe-snap columns, full-width task cards
- Mobile HR: clock in/out from a single large button; approve/reject leave from a notification tap
- PWA manifest + service worker: installable on iOS/Android home screen, task lists readable offline (read-only cache)
- Web Push notifications (VAPID) for key events: task assigned, leave request, approval needed

---

## vE.2 — Billing & Plans (Week 24)

> Status: PLANNED 📋

**Backend**

| Plan | Price | Limits | Key Features |
|------|-------|--------|--------------|
| **Free** | $0 | Up to 10 members, 3 projects, no HR module | Projects, basic tasks, wiki |
| **Pro** | $7/seat/mo | Up to 100 members, unlimited projects | Everything + HR, Org Structure, automations, custom fields |
| **Business** | $12/seat/mo | Up to 500 members | Everything + SSO, audit log, custom RBAC, priority support |

- Stripe Checkout + Customer Portal + webhook handlers (`customer.subscription.created/updated/deleted`)
- `Subscription` + `UsageRecord` (daily snapshot: seats, storage, automation fires) models
- Feature gates: `workspace.plan.can_use_hr`, `workspace.plan.can_use_rbac`, etc.; checked server-side on every relevant endpoint
- 14-day Pro trial auto-start on new workspace creation; no credit card required

**Frontend**

- **Billing page** `/w/:ws/settings/billing`: current plan card, usage bars, upgrade CTA, invoice history with PDF download
- Feature gate UX: locked features show "Upgrade to Pro" modal with 3 bullet reasons + CTA — never an error toast or redirect
- Trial countdown banner in the workspace header: "9 days left in your Pro trial"
- Plan badge in workspace switcher ("Free" / "Pro" / "Business" chip)

---

## vE.3 — Public Landing Page (Week 25)

> Status: PLANNED 📋
> **Why now and not earlier:** The landing page ships here because the ecosystem is complete — Projects, Org Structure, and HR are all live. The pitch is no longer "another project management tool" but "replace your entire tool stack." Three apps in an ecosystem is a story worth telling. One app is not.

### Page structure (standalone route at `/`)

- **Hero** — headline that leads with the ecosystem angle ("One workspace. Projects, people, and HR — for teams that mean business"), animated product demo, single primary CTA ("Start free — no credit card")
- **Ecosystem showcase** — three app cards: **Projects** · **Org Structure** · **HR** — "Each app is great alone. Together, they replace ClickUp + BambooHR + your org chart tool — for less than either one."
- **Problem section** — honest side-by-side: Jira (enterprise bloat), ClickUp (feature paralysis), BambooHR (HR-only silo), Monday/Asana (expensive + dated). Not vague — specific and confident
- **How it works** — 3-step visual: Create workspace → Build your org → Manage people and projects (under 5 minutes to first value)
- **Social proof** — early adopter testimonials; "Built for teams of 10–200" positioning
- **Pricing preview** — three tier cards (Free / Pro / Business) with feature highlights; no hidden fees language
- **Footer** — docs, changelog, status page, Twitter/X, GitHub

### Technical

- Standalone React route at `/` — public, no auth required, no app sidebar
- Built with the existing design system tokens (`theme.css`) — same fonts, colours, and components as the app
- Mobile-first responsive; no horizontal scroll at 375px
- `<meta>` OG tags, `sitemap.xml`, `robots.txt` for SEO baseline
- CTA buttons route to `/register`; "Log in" link in the nav for existing users

---

## vE.4 — Launch Prep (Week 26)

> Status: PLANNED 📋

**Performance targets**
- API P95 < 200ms (Redis cache TTL audit + slow query log review)
- Frontend LCP < 1.5s (route-level code splitting + prefetch on hover)
- Initial JS bundle < 200KB (tree-shaking + dynamic imports per route)
- Lighthouse: 95+ Performance, 100 Accessibility, 100 Best Practices

**Launch**
- Public changelog page at `/changelog` rendered from this file
- Status page (Statuspage.io or Betterstack) with 90-day uptime history
- Onboarding email sequence: Day 0 (welcome), Day 3 (first project tips), Day 7 (HR module intro), Day 14 (upgrade CTA)
- Beta waitlist → first 200 users → early access program with direct founder access
- Referral program: invite 3 teammates → get 1 month Pro free

---

## Ecosystem v2 — 6-Month Summary

| Phase | Weeks | What Ships | Why It Matters |
|-------|-------|-----------|----------------|
| **A — Relaunch** | 1–2 | Google OAuth, improved invite flow | Remove signup friction before building the ecosystem |
| **B — Org Structure** | 3–9 | Departments, teams, employee profiles, org chart | Company skeleton every team needs daily |
| **C — HR Management** | 10–17 | Leave management, attendance tracking, HR dashboard | Replaces BambooHR for small businesses |
| **D — Custom RBAC** | 18–21 | Role builder, granular permission flags, role assignment UI | Secure three apps properly with one permission layer |
| **E — Platform & Launch** | 22–26 | Mobile PWA, billing & plans, **ecosystem landing page**, performance, public launch | Build the story last — once there's a full ecosystem to tell it |

> **After these 6 months JCN will be:**
>
> - The only tool a 10–200 person business needs for projects **and** people
> - Cheaper than the sum of the tools it replaces (ClickUp + BambooHR + org chart tool)
> - Fast enough and simple enough that people choose it over spreadsheets for leave tracking
> - The management layer that grows with them from 10 to 200 people without a re-platform

---

---

# BEYOND 6 MONTHS — ECOSYSTEM DEPTH

> The phases below extend the ecosystem after the initial launch. They are sequenced — each one builds on what came before it.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE F — AUTOMATION ENGINE REBUILD

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Replace the v1 signal-based, projects-only automation engine with a proper async workflow system that spans every app in the ecosystem.
>
> **Why a rebuild and not an extension:** The v1 engine (v2.7.0) has three hard limitations — it is synchronous (blocks the request thread), it is scoped to `projects` only, and it has no scheduled/time-based triggers. With HR and Org live, teams need cross-app workflows like "when a leave request is approved → post to Slack → update the team calendar → create a handover task." That flow touches three apps and requires async execution. Patching v1 to do this creates more tech debt than starting clean.
>
> **Depends on:** Phase C (HR) and Phase B (Org) being live — the new trigger surface is only valuable when there are multiple apps to wire together.

---

## vF.1 — Async Execution Engine (Backend)

> Status: PLANNED 📋

**New `automations` Django app** (replaces `AutomationRule` + `AutomationLog` in `projects`)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AutomationRule` | `workspace` FK (was project FK — now workspace-scoped), `name`, `is_active`, `trigger` JSONField, `conditions` JSONField, `actions` JSONField, `fire_count`, `last_fired_at` | Migrated from `projects` app |
| `AutomationExecution` | `rule` FK, `celery_task_id`, `status` (QUEUED/RUNNING/SUCCESS/PARTIAL/FAILED/TIMED_OUT), `trigger_event`, `trigger_payload`, `steps` JSONField (per-step: action type, result, duration_ms, error), `started_at`, `finished_at` | Replaces `AutomationLog` |

**Trigger surface**

```python
# Projects (existing triggers, now dispatched async via Celery)
task.created         task.status_changed    task.assigned
task.overdue         task.due_soon          task.completed

# HR (new)
leave.requested      leave.approved         leave.rejected
attendance.clocked_in  attendance.late      attendance.absent

# Org (new)
member.joined        member.left            employee.anniversary
employee.probation_end

# Scheduled (new — Celery beat, per-rule cron)
schedule.daily       schedule.weekly        schedule.monthly
schedule.cron        # arbitrary cron expression

# Incoming webhook (new)
webhook.received     # external system POSTs to a signed JCN endpoint → triggers rule
```

**Condition engine** — AND/OR groups with nested conditions:

```json
{
  "operator": "AND",
  "conditions": [
    { "field": "task.priority", "op": "equals", "value": "urgent" },
    {
      "operator": "OR",
      "conditions": [
        { "field": "task.assignee.department.name", "op": "equals", "value": "Engineering" },
        { "field": "task.labels", "op": "contains", "value": "critical" }
      ]
    }
  ]
}
```

**Action surface**

```python
# Existing (now async)
change_status      change_priority    set_assignee
add_label          post_comment       send_notification

# New
send_email         # Resend/SendGrid — custom subject + body with template vars
http_request       # arbitrary POST/GET with headers + body — outgoing webhook action
create_task        # create a task in any project with pre-filled fields
approve_leave      # programmatically approve a leave request
assign_to_team     # add/remove a user from a team
wait_duration      # pause execution for N minutes/hours before next action
branch_condition   # fork: if X → path A, else → path B
stop_execution     # early exit with optional notification
```

**Execution guarantees**
- Each rule fire is one Celery task; actions within it run sequentially with per-step timeout (default 10s)
- Retry: failed action → retry up to 3× with exponential backoff before marking step `FAILED`
- Rate limit: max 500 executions/day per workspace on Pro; 2000 on Business
- Execution stored for 30 days; older rows purged via Celery beat cleanup task

**API surface**
- `GET/POST /api/workspaces/{ws}/automations/`
- `GET/PATCH/DELETE /api/workspaces/{ws}/automations/{id}/`
- `GET /api/workspaces/{ws}/automations/{id}/executions/`
- `GET /api/workspaces/{ws}/automations/{id}/executions/{eid}/` — per-execution step log
- `POST /api/workspaces/{ws}/automations/{id}/test/` — dry run against a sample payload; returns what would happen
- `POST /api/workspaces/{ws}/automations/incoming/{token}/` — public webhook receiver endpoint (signed)

---

## vF.2 — Visual Flow Builder (Frontend)

> Status: PLANNED 📋

**Replaces the existing `AutomationsPage.jsx` form-based builder**

- **Trigger node** (always first): click to pick trigger type; grouped by app (Projects / HR / Org / Scheduled / Webhook); shows live event description ("Fires when a leave request changes to Approved")
- **Condition block** (optional, after trigger): AND/OR condition builder — field picker (context-aware based on trigger), operator dropdown, value input; add/remove condition rows; add nested group
- **Action nodes** (one or more, in sequence): each node is a card — action type picker, payload config (context-aware inputs per action type); drag to reorder; "+" button adds next action
- **Branch node**: splits the flow into two parallel paths based on a condition; both paths recombine or end independently
- **Wait node**: time delay between actions (e.g. "wait 2 hours, then send reminder")
- **Connection lines** between nodes showing the execution flow
- **Live variable picker**: inside any text field, type `{{` → autocomplete list of available trigger variables (`{{task.title}}`, `{{task.assignee.full_name}}`, `{{leave.start_date}}`)
- **Test run panel**: "Run test" button → pick a sample record → shows per-step execution result inline on each node (green tick / red X / skipped)
- **Execution history tab**: timeline of last 50 executions; click any row → step-by-step breakdown with duration and error message per action; re-run button for failed executions

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE G — RECRUITMENT & ATS

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** End-to-end hiring pipeline — from job posting to signed offer — with a hired candidate automatically becoming a workspace member and employee record.
>
> **Why small businesses need this:** Most small teams manage hiring in a spreadsheet or Notion doc. An ATS that lives inside the same workspace as their projects and HR data means no context-switching and no duplicate data entry when someone gets hired.
>
> **Depends on:** Phase B (Org Structure — departments and job titles) and Phase C (HR — a hired candidate flows directly into `EmployeeProfile`).

---

## vG.1 — Job Postings & Candidate Pipeline (Backend)

> Status: PLANNED 📋

**New `recruitment` Django app**

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `JobPosting` | `workspace` FK, `title`, `department` FK (nullable), `location`, `employment_type`, `description` (markdown), `requirements` (markdown), `status` (DRAFT/OPEN/PAUSED/CLOSED), `token` (UUID4 — public apply link), `published_at` | UUIDv7 PK |
| `PipelineStage` | `job` FK, `name`, `order`, `stage_type` (SCREENING/INTERVIEW/ASSESSMENT/OFFER/HIRED/REJECTED) | Per-job customisable; `stage_type` drives system behaviour on HIRED |
| `Candidate` | `workspace` FK, `full_name`, `email`, `phone`, `resume_url`, `source` (MANUAL/FORM/LINKEDIN/REFERRAL/EMPLOYEE_REFERRAL), `linked_user` FK→User (nullable) | Deduped by email per workspace; `linked_user` set when a JCN user applies |
| `Application` | `candidate` FK, `job` FK, `stage` FK→`PipelineStage`, `status` (ACTIVE/REJECTED/HIRED/WITHDRAWN), `applied_at`, `notes` | `unique_together: [candidate, job]` — one application per candidate per job |
| `Interview` | `application` FK, `interviewer` FK→User, `scheduled_at`, `duration_minutes`, `format` (VIDEO/PHONE/IN_PERSON), `feedback` (markdown), `rating` (1–5, nullable), `status` (SCHEDULED/COMPLETED/CANCELLED) | Notification sent to interviewer on create; reminder 24h before |
| `Offer` | `application` O2O, `salary`, `currency`, `start_date`, `expiry_date`, `status` (DRAFT/SENT/ACCEPTED/DECLINED/EXPIRED), `notes` | On status→ACCEPTED: fires `hire_candidate()` — creates `WorkspaceInvite` + pre-fills `EmployeeProfile` |

**Indexes**: `application_job_stage_idx`, `candidate_workspace_email_idx`, `interview_application_scheduled_idx`

**API surface**
- `GET/POST /api/workspaces/{ws}/recruitment/jobs/`
- `GET/PATCH/DELETE /api/workspaces/{ws}/recruitment/jobs/{id}/`
- `GET /api/recruitment/apply/{token}/` — **public, no auth** — job description for the apply page
- `POST /api/recruitment/apply/{token}/` — **public, no auth** — creates `Candidate` + `Application`
- `GET/POST /api/workspaces/{ws}/recruitment/candidates/`
- `GET /api/workspaces/{ws}/recruitment/candidates/{id}/` — candidate detail + all applications
- `GET /api/workspaces/{ws}/recruitment/jobs/{id}/applications/`
- `PATCH /api/workspaces/{ws}/recruitment/applications/{id}/move/` — move to stage; fires automation trigger `application.stage_changed`
- `PATCH /api/workspaces/{ws}/recruitment/applications/{id}/reject/`
- `GET/POST /api/workspaces/{ws}/recruitment/applications/{id}/interviews/`
- `PATCH/DELETE /api/workspaces/{ws}/recruitment/interviews/{id}/`
- `GET/PATCH /api/workspaces/{ws}/recruitment/applications/{id}/offer/`
- `POST /api/workspaces/{ws}/recruitment/applications/{id}/hire/` — triggers invite + profile pre-fill

**Automation triggers added** (in Phase F engine):
- `application.received` — new application submitted
- `application.stage_changed` — candidate moves to a new pipeline stage
- `application.hired` — offer accepted, candidate converted to employee

---

## vG.2 — Recruitment Frontend

> Status: PLANNED 📋

**New "Recruitment" sidebar group** (visible on Pro/Business plans)

- **Jobs board** `/w/:ws/recruitment/jobs`:
  - Job cards: title, department badge, location, open applications count, status indicator (Open/Paused/Closed/Draft)
  - "Post a job" modal: title, department, location, employment type, markdown description + requirements editor (VoltEditor), pipeline builder (default stages + add/remove/rename)
  - Status toggle per job: Open ↔ Paused ↔ Closed

- **Pipeline view** `/w/:ws/recruitment/jobs/{id}`:
  - Kanban board — columns = pipeline stages, cards = candidates
  - Candidate card: name, source badge, applied date, days in current stage, rating stars (if interviewed), overdue indicator (if in stage > N days without action)
  - Drag card to move stage (calls `/move/` endpoint); viewer role cannot drag
  - "Add candidate" button: manual entry or paste LinkedIn URL (name + email parsed)
  - Filter bar: by source, by interviewer, by rating threshold

- **Candidate profile panel** (right-side panel, same pattern as `TaskDetailPanel`):
  - Header: name, email, phone, source badge, applied jobs list
  - Resume tab: embedded PDF viewer or download link
  - Interviews tab: scheduled interviews with interviewer avatar, date, format, rating chip; "Schedule interview" button opens a date/time picker + interviewer selector (workspace member search)
  - Offer tab: offer builder — salary, currency, start date, expiry; "Send offer" marks status SENT; "Mark accepted / declined" closes the loop
  - Notes tab: internal recruiter notes (rich text, not visible to candidate)
  - Activity tab: stage moves, interview completions, offer events — auto-logged

- **Public apply page** `/careers/{token}`:
  - No JCN chrome — clean standalone page
  - Job title, department, location, employment type, description, requirements
  - Application form: name, email, phone, resume upload (PDF, max 5MB), cover letter (optional textarea)
  - On submit: success screen with "We'll be in touch" message
  - Reuses `PublicFormPage` component pattern

- **Recruitment Dashboard** (card on main HR Dashboard):
  - Open roles count, total applicants this month, interviews scheduled this week, offers pending
  - Pipeline funnel: applicants → screened → interviewed → offered → hired (conversion % per stage)

- **On hire flow**: clicking "Hire" on an accepted offer → confirmation modal → sends workspace invite to candidate's email → `EmployeeProfile` pre-filled with job title, department, start date from the offer → appears in HR employee list on first login

---

## Beyond Phase G

| Phase | Name | App | Status |
|-------|------|-----|--------|
| F | Automation Engine Rebuild | `automations/` | 📋 Planned |
| G | Recruitment & ATS | `recruitment/` | 📋 Planned |
| H | Workspace Federation | `workspaces/` | 🔮 Future |