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
> **Every version below is: IN PROGRESS 🔨**
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

---

## v2.0.0 — Design System 2.0 (Week 1)
> Status: COMPLETE ✅
> **Intent:** The app should feel like it took 3 years to build. Every pixel earns its place.

### Design Tokens
- Full CSS custom property system: `--space-1` through `--space-16`, `--text-xs` through `--text-4xl`, `--radius-sm` through `--radius-full`, `--shadow-sm` through `--shadow-2xl`
- 3 complete themes: **Light**, **Dark**, **Midnight** (true OLED black) — user toggle, persisted in DB
- 9 accent colours: Indigo (default), Blue, Violet, Pink, Rose, Amber, Emerald, Cyan, Slate — applies to all interactive elements
- Density modes: **Comfortable** (default) / **Compact** / **Cozy** — global CSS variable swap, no class changes in components
- `theme.css` is the single source of truth; Tailwind only extends tokens, never hardcodes values

### Animation Rules (Emil Kowalski principles applied globally)
- Custom easing variables: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`
- All panels: `translateX(100%) → translateX(0)`, 220ms `--ease-out` — no more instant mount
- All modals: `scale(0.95) opacity-0 → scale(1) opacity-1`, 160ms `--ease-out`
- All dropdowns: origin-aware scale from trigger point (Radix `--transform-origin`)
- All toasts: slide-up from bottom-right, stagger-stack like Sonner
- Button press: `active:scale-[0.97]` on all interactive elements
- List items stagger: 30ms delay between items (not all at once)
- Keyboard actions (⌘K, shortcuts): **zero animation** — instant response, no latency

### Component Overhaul
- Form inputs: floating label on focus/filled, error shake animation, character count
- All selects/dropdowns: searchable, keyboard-navigable, scale from trigger
- Avatar group: overlap + `+N` overflow chip
- Skeleton loaders on every async view (no spinners except for button loading states)
- Empty state SVG illustrations (inline, 0 network requests)
- Toast system: position top-centre, max 3 stacked, swipe-to-dismiss, pause-on-hover
- Tooltip system: 300ms delay (first), 0ms (subsequent — feels instant across toolbar)
- `prefers-reduced-motion`: opacity-only fallback for all transform animations

---

## v2.1.0 — Access Control & Permissions Matrix (Week 2)
> Status: COMPLETE ✅
> **Intent:** Proper permissions that don't require a PhD to configure.

### Backend
- `ProjectMember` model — project-level role override: `Admin`, `Editor`, `Viewer`, `Guest` (external)
- Permission resolution: `effective_role = min(workspace_role, project_role)` — most restrictive wins
- `GuestToken` model — time-limited (7/14/30 days), read-only public link to a project
- `has_project_permission(user, project, action)` utility used on every view
- Audit: every permission change logged to `AuditEvent`

### Frontend
- **Project Settings → Members tab**: add project-specific roles, override workspace role
- Visual permission matrix: rows = members, columns = Create/Edit/Delete/Admin — checkbox grid
- Private project toggle (lock icon) — hidden from workspace Projects page unless member
- Guest link generator: copy shareable read-only URL + expiry date picker
- `useProjectPermissions()` hook: `canEdit`, `canAdmin`, `canView`, `isGuest` — disables UI elements contextually
- Access-denied page with "Request access" button (notifies project admins)

---

## v2.2.0 — Multi-Board Architecture (Week 3)
> Status: COMPLETE ✅
> **Intent:** One project, multiple perspectives. A "project" is a container; boards are the views.

### Backend
- `Board` model: belongs to `Project`, has `board_type` (kanban / scrum / list / timeline / calendar), `name`, `description`, `is_default`, `visibility` (workspace-public / private / secret)
- A project can have unlimited boards; tasks belong to the project, boards are views over them
- `Board.config` JSONField: per-board column ordering, swimlane config, WIP limits
- Board templates stored as seed fixtures: "Software Development", "Marketing Campaign", "Product Launch", "Bug Tracker", "Customer Requests"
- Board archive/restore endpoint

### Frontend
- **Board tabs** in project header — horizontal scrollable tab bar, active board highlighted
- "New Board" modal: board type picker (5 types with preview illustrations) + template picker
- Board-specific saved filters (separate from project-level)
- Drag-and-drop board tab reordering
- Board type icon in tab (grid icon for Kanban, list icon for List, etc.)
- "Set as default" option — opens this board when navigating to the project

---

## v2.3.0 — Onboarding & Workspace Setup Wizard (Week 4)
> Status: COMPLETE ✅
> **Intent:** New user → first value in under 5 minutes. No tutorial videos.

### Backend
- `OnboardingState` model — tracks checklist completion per workspace
- `WorkspaceTemplate` model — pre-configured project + boards + statuses + automations
- Built-in templates: Software Team, Startup, Design Studio, Marketing Agency, Education, Operations
- Template import API: apply any template to a new project

### Frontend
- **Setup wizard** (first workspace, 4 steps):
  - Step 1: Team type (6 illustrated cards — software, design, marketing, ops, education, other)
  - Step 2: Template preview with animated board illustration
  - Step 3: Invite teammates (email chip input, bulk paste, send with one click)
  - Step 4: Confetti animation + "Your workspace is ready → Go to first project"
- **Getting Started checklist** (dashboard widget, dismissable after all complete):
  - ✓ Create first project · Add a task · Invite teammate · Connect GitHub · Set up automation
- Project template gallery in CreateProjectModal (visual cards with live preview screenshots)
- "Import from Jira / ClickUp / Trello" option on setup step 2

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 2 — TASK POWER FEATURES (Weeks 5–8)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## v2.4.0 — Advanced Task System (Week 5)
> Status: IN PROGRESS 🔨
> **Intent:** Tasks that can model any kind of work — from a 2-minute fix to a 6-month epic.

### Backend
- **Task hierarchy**: `Task.parent` FK (self-referential) — unlimited depth; Epics → Stories → Tasks → Subtasks in one model
- `Task.estimate_points` (story points) + `Task.estimate_hours` (decimal) — both tracked
- `Task.start_date` DateField — tasks now span a range, not just a due date
- `TaskRelation` model: `relates_to`, `duplicate_of`, `cloned_from` alongside existing `blocks`/`blocked_by`
- `TaskTemplate` model — reusable task structure: pre-filled fields + subtask tree + default assignee + labels
- `RecurringRule` model: RRULE string (daily/weekly/monthly/custom) + `next_occurrence` computed field
- Recurring task auto-generation via Celery beat task (nightly)
- `Task.clone()` method — deep clone with subtasks, labels; strips assignee + dates
- Rollup stats on parent tasks: `total_descendants`, `done_descendants`, `total_estimate_hours`

### Frontend
- Task hierarchy in detail panel: breadcrumb trail — Epic → Story → Task, click to navigate up
- Nested subtask tree (replaces flat list): infinite depth, collapse/expand, indent per level
- Estimate field: `SP` + `h` side by side, both editable inline
- Start date field in meta section alongside due date — shows duration span
- "Relate task" picker in dependencies section with new relation types
- Task template picker in `CreateTaskModal` — "Start from template" toggle
- Recurring task toggle in detail panel + recurrence configurator
- Parent task card shows aggregated progress bar from all descendants
- "Clone task" in task context menu (three-dot menu)
- Epic view: task card expands to show child tree inline

---

## v2.5.0 — Rich Text Editor & Wiki (Week 6)
> Status: IN PROGRESS 🔨
> **Intent:** Task descriptions as powerful as Notion pages. Wiki as structured as Confluence. All in one place.

### Backend
- Task `description` upgraded from `TextField` to `JSONField` (Tiptap/ProseMirror document format)
- `WikiPage` model — project-scoped, tree structure (`parent` FK), `slug`, `is_public`
- `WikiRevision` — immutable version history per page (full JSON snapshot + author + timestamp)
- `Document` model — workspace-scoped standalone documents (meeting notes, specs, runbooks)
- Full-text search across task descriptions + wiki + documents via PostgreSQL `tsvector`
- Mention resolution endpoint: `GET /api/workspaces/{ws}/mention-targets/?q=` → users + tasks + wiki pages + docs
- Public wiki toggle: `WikiPage.is_public` → shareable read-only URL, no login required

### Frontend
- **Volt Editor** (Tiptap-based, fully custom styled):
  - `/` slash menu: Heading 1/2/3, Bullet list, Numbered list, Checklist, Code block, Quote, Table, Divider, Image, Callout, Embed
  - `@user` mentions → inline avatar chip, notification to mentioned user
  - `[[task-title]]` cross-references → live task chip (status colour, priority dot, updates in real time)
  - `[[doc-title]]` wiki links → breadcrumb link with page icon
  - Markdown shortcuts: `## ` → H2, `- ` → bullet, ` ``` ` → code block
  - Code blocks: Shiki syntax highlighting, copy button, language badge
  - Tables: resizable columns, add/remove rows and columns contextually
  - Callout blocks: Info / Warning / Danger / Success (left border colour + icon)
  - Images: paste, drag-drop (uploads to attachment storage), resize handles
  - Mermaid diagrams: `flowchart`, `sequenceDiagram`, `erDiagram` rendered inline
- Wiki section in project sidebar — collapsible page tree
- Document page `/w/:ws/projects/:proj/wiki/:page` with sticky table of contents
- Page history panel — visual diff between any two revisions
- "Related docs" in task detail panel — pages that mention this task

---

## v2.6.0 — Forms & Intake System (Week 6)
> Status: IN PROGRESS 🔨
> **Gap filled:** Jira's issue collector is ugly. Linear has no intake. ClickUp forms are buried 6 levels deep.

### Backend
- `Form` model: project-scoped, `fields` JSONField (label, type, required, options, placeholder)
- Field types: short text, long text, dropdown, multi-select, email, number, date, file upload, assignee picker, priority picker
- `FormSubmission` model: raw JSON answers + auto-created task FK + submitter email
- `POST /api/forms/:token/submit/` — public, no auth, rate-limited (10 submissions/hour/IP)
- Auto-create task: configurable field mapping (form field → task field)
- Confirmation email to submitter (optional, configurable)

### Frontend
- **Form Builder** in project settings → Forms tab:
  - Drag-and-drop field reordering
  - Add field: type selector + label + required toggle + placeholder text
  - Live preview panel updates as you build
  - Success message + redirect URL config
- Public form URL: `/forms/:token` — branded standalone page (no JCN chrome unless paid)
- Embed code for external websites (copy `<iframe>` snippet)
- Submission inbox in project: list of all submissions with "Create task" / "Dismiss" actions
- "From form" badge on tasks created via submissions
- Submission analytics: total count, this week, response rate

---

## v2.7.0 — Automation Engine (Week 7)
> Status: IN PROGRESS 🔨
> **Intent:** Let the app do the repetitive work. Rules-based, no-code, visual builder.

### Backend
- `AutomationRule` model: `trigger` + `conditions` + `actions` (all JSONField) + `is_active` + `fire_count`
- **Triggers:** task.created, task.status_changed, task.assigned, task.priority_changed, task.due_date_passed, task.overdue, comment.created, sprint.started, sprint.completed, form.submitted, member.joined
- **Conditions:** field equals/contains/is-empty/greater-than, assignee is/is-not, label includes/excludes, type is, sprint is, creator is
- **Actions:** change status, set/clear assignee, add/remove label, set priority, post comment (with template variables `{{task.title}}` `{{assignee.name}}`), create subtask from template, send notification (specific user or role), move to sprint, set due date (relative: `+3 days`), archive task, trigger webhook, send email
- `AutomationLog` model: rule FK, trigger payload, conditions evaluated, actions executed, duration_ms, status (success/partial/failed)
- Execution: Django signals for sync actions, Celery queue for email/webhook/AI
- Rate limit: 500 fire/project/day (free), unlimited (Pro+)

### Frontend
- **Automations page** in project settings
- **Rule builder UI:**
  - "When [trigger]" picker with search + category grouping (Task events / Sprint events / Member events)
  - "And [conditions match]" — add rows, each row is field + operator + value; remove button
  - "Then [do this]" — action chain; add multiple actions; drag to reorder
  - Visual cards connected by down arrows; active state shown in green
- **Template gallery** (pre-built, one-click install):
  - "When moved to Done → close all subtasks"
  - "When overdue → escalate to Urgent + notify assignee"
  - "When task created as Bug → assign QA label + notify QA lead"
  - "When sprint starts → post kickoff comment on all sprint tasks"
  - "When form submitted → set status to Triage + notify team lead"
  - "When task unassigned for 3 days → notify project admin"
  - "When estimate is empty → request estimate in comment"
- Automation log: expandable rows, full execution trace, re-run button
- Enable/disable toggle per rule; "Fired 12x this week" count badge

---

## v2.8.0 — Time Tracking (Week 8)
> Status: IN PROGRESS 🔨
> **Gap filled:** Jira's time tracking is buried 3 clicks deep. ClickUp's is disconnected from tasks. Linear has none.

### Backend
- `TimeEntry` model: `user` FK, `task` FK, `start_at`, `end_at`, `duration_seconds`, `description`, `is_billable`, `hourly_rate`
- Active timer: `TimeEntry` with `end_at=null` = running; max 1 active per user (starting new stops previous)
- Endpoints: `POST /timer/start/`, `PATCH /timer/stop/`, `GET /timer/active/`
- Manual entry: `POST /tasks/:id/time-entries/` with duration + optional description
- Time reports: `GET /timesheets/?user=&project=&start=&end=&billable=` — flexible filters
- `Task.total_logged_seconds` aggregated property
- Weekly timesheet: `GET /api/workspaces/:ws/timesheets/?week=YYYY-Www` — user × day matrix

### Frontend
- Timer button on task cards (hover → clock icon) and in task detail panel header
- Active timer: pulsing dot + elapsed time in sidebar footer (stops from anywhere)
- Time entry list in task detail: user avatar, duration, date, description, edit + delete inline
- Manual time log: `+` button → quick picker (15m / 30m / 1h / custom) + description input
- **Timesheets page** `/w/:ws/timesheets`: weekly grid, rows = members, columns = days, cells = logged hours; totals in footer row
- Billable toggle per entry; billable hours shown separately in reports
- Time analytics in project: "Logged vs Estimated" horizontal bar chart
- CSV export: date range picker → download

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 3 — VIEWS & VISUALIZATION (Weeks 9–13)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## v2.9.0 — Calendar View (Week 9)
> Status: IN PROGRESS 🔨
> **Intent:** See work distributed in time, not just status columns.

### Backend
- Calendar endpoint: `GET /tasks/?view=calendar&start=&end=` — tasks with due_date in range
- iCal export: `GET /projects/:id/calendar.ics` — subscribable calendar feed

### Frontend
- **Calendar View** added to project view toggle (Board / List / Sprint / Calendar)
- Month / Week / Day modes (toggle in view header)
- Tasks appear as chips on their due date, colour-coded by status or assignee (toggle)
- Multi-day tasks (start_date → due_date) span across columns
- Drag task chip to reschedule — updates `due_date` via PATCH with optimistic UI
- Click blank date → CreateTaskModal with that date pre-filled
- "No due date" shelf: collapsible list at the bottom of each week column
- Today highlighted with primary colour outline
- iCal export button in view header → subscribe in Google Calendar / Outlook

---

## v3.0.0 — Timeline & Gantt View (Week 10)
> Status: IN PROGRESS 🔨
> **Intent:** Project managers need to see how work fits together in time. This is the view they live in.

### Backend
- Timeline conflict detection: tasks with overlapping time for same assignee → warning flag
- Critical path computation: longest dependency chain, returned as `is_critical` flag on tasks

### Frontend
- **Timeline View** (full Gantt) — added to view toggle
- Horizontal bars = task duration (`start_date` → `due_date`)
- Group by: Status / Assignee / Sprint / Label / Epic (switcher in header)
- Swimlanes: each group is a collapsible row section
- Drag bar body → moves both start and due date
- Drag right edge → extends due_date
- Dependency arrows: visual lines connecting `blocks`/`blocked_by` task pairs
- Critical path: tasks on the critical chain highlighted in amber
- Zoom levels: Day / Week / Month / Quarter — horizontal scroll adapts
- "Today" vertical red line (same as Roadmap)
- Collapsed tasks: click chevron to expand into children
- WIP indicators: coloured column overlays for sprint boundaries
- Export as PNG (screenshot) or printable PDF

---

## v3.1.0 — Table / Grid View (Week 10–11)
> Status: IN PROGRESS 🔨
> **Intent:** For teams who live in spreadsheets — same power, but tasks stay tasks.

### Backend
- Bulk field update endpoint: `PATCH /tasks/bulk/` already built — now also supports custom field values
- Sorting + grouping parameters on task list endpoint

### Frontend
- **Table View** — power-user spreadsheet-style list
- Sticky header row with sort indicators (click to sort, shift+click for multi-sort)
- Column visibility toggle: show/hide any field including custom fields
- Column width: drag to resize, double-click to auto-fit
- Row grouping: group by status / assignee / priority / label / sprint — collapsible groups with count + aggregate
- Inline cell editing: click any cell to edit directly (title, priority, assignee, due date, custom fields)
- Row height: compact / default / tall (shows description preview)
- "Freeze columns" for title column (always visible on horizontal scroll)
- Add column button at end of header row: add custom field inline
- Footer row: sum/avg/count aggregates per column (configurable per column type)
- Keyboard navigation: Tab to move right, Enter to move down, Esc to cancel edit

---

## v3.2.0 — Advanced Search & Filter Builder (Week 11)
> Status: IN PROGRESS 🔨
> **Gap filled:** Notion search is famously bad. Jira's JQL is powerful but alienating. JCN is powerful and friendly.

### Backend
- PostgreSQL full-text search with `tsvector` on task title + description + comment body
- Search index maintained via Django signals on save
- Advanced filter endpoint: `POST /api/search/advanced/` — arbitrary AND/OR filter tree
- Filter tree schema: `{logic: "AND", conditions: [{field, operator, value}, ...], groups: [...]}`
- `SavedSearch` model — name + filter tree + alert flag (notify when new results)
- Search supports: text, assignee, type, priority, status, label, date range, sprint, has-attachment, overdue, unassigned, estimate range, time-logged range, custom fields

### Frontend
- **Command Palette v2:**
  - Type `#bug` to filter by type instantly
  - Type `@bilal` to filter by assignee
  - Type `>overdue` for overdue tasks
  - Type `!urgent` for urgent priority
  - Recently viewed (tasks + pages + docs) with timestamps
  - Quick actions: `c` create task, `p` create project, `i` invite member
  - Navigate with arrow keys, open with Enter, secondary actions with Tab
- **Filter Builder** in all views:
  - Add filter row: field picker (all task fields + custom fields) → operator → value
  - AND/OR logic toggle between rows
  - Group conditions with `( )` brackets for complex logic
  - Save as named view → shared view URL (copy link)
  - Clear all / restore last saved
- Search results page `/w/:ws/search?q=` — paginated, grouped by project, with type badges
- Saved search alerts: "New tasks matching 'API bug'" notification

---

## v3.3.0 — Custom Dashboards (Week 12)
> Status: IN PROGRESS 🔨
> **Intent:** Every team has different metrics. Let them build the dashboard that matters to them.

### Backend
- `Dashboard` model: workspace or project-scoped, `widgets` JSONArray
- Widget types: stat card, bar chart, line chart, pie chart, table, task list, burndown, velocity, team workload, blank (text/heading)
- Dashboard data endpoints: real-time computed via existing analytics queries + new widget-specific endpoints
- `DashboardShare` model: public read-only link with optional password

### Frontend
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
- Multiple dashboards per workspace (tabs in Dashboards nav item)
- Share dashboard: public link, optional password
- Dashboard templates: "Engineering Overview", "Sprint Dashboard", "Team Health", "Exec Summary"

---

## v3.4.0 — My Work & Portfolio Views (Week 13)
> Status: IN PROGRESS 🔨
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

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PHASE 4 — COLLABORATION & COMMUNICATION (Weeks 14–17)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## v3.5.0 — Real-Time Collaboration v2 (Week 14)
> Status: IN PROGRESS 🔨
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
> Status: IN PROGRESS 🔨
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
> Status: IN PROGRESS 🔨
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
> Status: IN PROGRESS 🔨
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
> Status: IN PROGRESS 🔨
> **Gap filled:** Linear set the bar here. JCN matches it and then adds more.

### Frontend
- **Global keyboard shortcuts** (`useHotkeys` throughout app):
  - `c` — create task (context-aware: in current project/sprint)
  - `g p` — go to Projects
  - `g d` — go to Dashboard
  - `g m` — go to My Work
  - `g i` — go to Inbox
  - `g a` — go to Analytics
  - `e` — edit selected task title inline
  - `a` — assign selected task (opens member picker)
  - `s` — change status (opens status picker)
  - `p` — change priority (opens priority picker)
  - `l` — add label (opens label picker)
  - `d` — set due date (opens date picker)
  - `t` — start/stop timer on focused task
  - `/` — open filter builder
  - `⌘K` — command palette (already exists)
  - `?` — keyboard shortcut reference overlay
  - `Esc` — close panel / deselect / cancel edit
  - `↑ ↓` — navigate task list
  - `Enter` — open focused task
  - `Space` — check/uncheck task (in My Work)
- **Shortcut reference overlay** (`?`): beautiful full-screen reference card grouped by context
- Task list keyboard navigation: row focus ring, arrow keys to move
- Quick-assign: `a` → type to filter members → Enter assigns
- Quick-status: `s` → status picker navigable by arrows, 1-click close
- "Vim mode" toggle in preferences: `h j k l` navigation, `:q` to close panel

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

## v4.3.0 — Slack & Microsoft Teams Integration (Week 20)
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

## v4.4.0 — AI-Powered Features (Week 20–21)
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

## v4.6.0 — Import & Migration Tools (Week 22)
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

