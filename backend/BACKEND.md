# JCN Backend — Source of Truth

> **Maintenance rule for Claude**: Before any backend change, read this file. After any change that adds/modifies/removes a model, view, URL, serializer, task, signal, or constant, update the relevant section here in the same commit. Do not let this file drift. If a section grows stale, reread the affected files and reconcile. This file exists to avoid re-reading all source files every session — keep it accurate.

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Django 4.x + Django REST Framework |
| Async / WebSocket | Django Channels (ASGI via Daphne) |
| Background tasks | Celery + Redis broker |
| Cache / Channel layer | Redis |
| Database | PostgreSQL 16 |
| Auth | dj-rest-auth + SimpleJWT + APIKeyAuthentication |
| Schema / Docs | drf-spectacular (OpenAPI) |
| Dev | Docker for db, redis, backend, celery; Vite frontend runs locally |

---

## App Map

```
core/           Django settings, URLs, Celery, ASGI, custom fields (UUIDv7, PrefixedUUID)
accounts/       User auth, UserProfile prefs
workspaces/     Workspace, members, invites, inbox, API keys, webhooks, imports, onboarding
projects/       Boards, tasks, sprints, statuses, labels, comments, wiki, forms, automations, OKRs, approvals
integrations/   Teams + Google Chat outbound webhooks, channel routing
analytics/      On-the-fly metrics (no models, computed from tasks/activity)
```

---

## ID Convention

All model PKs use `UUIDv7Field` from `core.fields` — time-sortable, no B-tree fragmentation.
Opaque token fields (invite tokens, form tokens) stay UUID4.
The DRF layer serializes PKs as prefixed strings via `PrefixedUUIDField` (e.g. `tsk_018e…`, `brd_…`, `wsp_…`).

URL route kwargs use the full UUID (prefixed or plain) — helpers parse both via `_parse_pk()`.

---

## Authentication

| Method | Header / Mechanism |
|--------|--------------------|
| JWT | `Authorization: Bearer <jwt>` via SimpleJWT |
| API Key | `Authorization: Bearer jcn_<raw_key>` via `APIKeyAuthentication` |

Default permission: `IsAuthenticated`. Public endpoints (forms, invite detail) use `AllowAny`.

---

## URL Reference

> Format: `METHOD /path/` — description  
> `{ws}` = workspace UUID (e.g. `wsp_018e…`), `{pid}` = board UUID, `{tid}` = task UUID

### Auth (`/api/auth/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login/` | Log in, returns JWT access + refresh |
| POST | `/api/auth/logout/` | Invalidate refresh token |
| POST | `/api/auth/registration/` | Register new user (email, full_name, password) |
| POST | `/api/auth/token/refresh/` | Exchange refresh token for new access token |
| POST | `/api/auth/google/` | Google OAuth — body: `{ access_token }` (from `@react-oauth/google` implicit flow). Returns same JWT pair + user as email login. Silently merges with existing email account if emails match (`SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True`). View: `accounts/social_views.py::GoogleLogin`. |

### Users (`/api/users/`)

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/users/me/` | Retrieve or update current user + profile (theme, accent, density) |

### Workspaces (`/api/workspaces/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/` | List workspaces the current user belongs to |
| POST | `/api/workspaces/` | Create workspace; caller auto-added as ADMIN member |
| GET | `/api/workspaces/{ws}/` | Workspace detail |
| PATCH | `/api/workspaces/{ws}/` | Update workspace name/logo |
| DELETE | `/api/workspaces/{ws}/` | Delete workspace (owner only) |

### Members & Invites

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/members/` | List all workspace members with roles |
| PATCH | `/api/workspaces/{ws}/members/{id}/` | Change member role (admin only) |
| DELETE | `/api/workspaces/{ws}/members/{id}/` | Remove member from workspace |
| POST | `/api/workspaces/{ws}/invites/` | Create invite row and fire `send_invite_email.delay()` async (Resend) |
| GET | `/api/workspaces/{ws}/invites/pending/` | List pending invites |
| DELETE | `/api/workspaces/{ws}/invites/{token}/` | Cancel a pending invite |
| GET | `/api/invites/{token}/` | Public — get invite info (workspace name, inviter) |
| POST | `/api/invites/{token}/accept/` | Accept invite and join workspace |

### Inbox

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/inbox/` | Inbox items (filterable by status: UNREAD/READ/ARCHIVED/SNOOZED) |
| GET | `/api/inbox/unread-count/` | Fast unread count (optionally scoped to workspace) |
| PATCH | `/api/inbox/{id}/` | Update single inbox item (read, archive, snooze) |
| POST | `/api/inbox/bulk/` | Bulk update inbox items |

### Onboarding

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/workspaces/{ws}/onboarding/` | Get or update onboarding wizard/checklist state (owner only) |

### API Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/api-keys/` | List active API keys (no raw key exposed) |
| POST | `/api/workspaces/{ws}/api-keys/` | Create API key — raw key returned once |
| DELETE | `/api/workspaces/{ws}/api-keys/{id}/` | Deactivate (soft-delete) an API key |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/webhooks/` | List outbound webhooks |
| POST | `/api/workspaces/{ws}/webhooks/` | Create webhook (events list, signing secret) |
| PATCH | `/api/workspaces/{ws}/webhooks/{id}/` | Update webhook URL/events/active status |
| DELETE | `/api/workspaces/{ws}/webhooks/{id}/` | Delete webhook |
| POST | `/api/workspaces/{ws}/webhooks/{id}/test/` | Queue a test delivery via Celery |
| GET | `/api/workspaces/{ws}/webhooks/{id}/deliveries/` | Last 50 delivery logs |

### Import / Migration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/import/sources/` | List supported import sources (Jira, ClickUp, CSV…) |
| GET | `/api/workspaces/{ws}/import/jobs/` | List import jobs |
| POST | `/api/workspaces/{ws}/import/jobs/` | Upload file → parse → create ImportJob |
| GET | `/api/workspaces/{ws}/import/jobs/{id}/` | Job status, field mapping, preview rows |
| PATCH | `/api/workspaces/{ws}/import/jobs/{id}/` | Update field mapping before running |
| DELETE | `/api/workspaces/{ws}/import/jobs/{id}/` | Delete job (PENDING only) |
| POST | `/api/workspaces/{ws}/import/jobs/{id}/run/` | Start async import (Celery) |
| DELETE | `/api/workspaces/{ws}/import/jobs/{id}/rollback/` | Delete all imported tasks (24h window) |

### Boards (Projects)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/` | List active boards visible to the current user |
| POST | `/api/workspaces/{ws}/boards/` | Create board |
| GET | `/api/workspaces/{ws}/boards/{pid}/` | Board detail with statuses and counts |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/` | Update board name/type/status |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/` | Delete board |
| GET | `/api/workspaces/{ws}/boards/{pid}/members/` | List board-level members |
| POST | `/api/workspaces/{ws}/boards/{pid}/members/` | Add board member with role |
| POST | `/api/workspaces/{ws}/boards/{pid}/members/bulk/` | Bulk-add board members |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/members/{id}/` | Change board member role |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/members/{id}/` | Remove board member |

### Task Statuses (Columns)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/statuses/` | List board statuses ordered by `order` |
| POST | `/api/workspaces/{ws}/boards/{pid}/statuses/` | Create status column |
| POST | `/api/workspaces/{ws}/boards/{pid}/statuses/bulk/` | Bulk reorder / update statuses |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/statuses/{id}/` | Rename/reorder/recolor status |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/statuses/{id}/` | Delete status (tasks moved to first remaining) |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/` | List tasks (filters: status, assignee, priority, sprint, label, type, due, search, pending_approval) |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/` | Create task |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/bulk/` | Bulk update tasks (status, assignee, priority, labels) |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/export/` | Export tasks as CSV or JSON |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/` | Task detail — core fields + `field_values`, `ancestors`, `key_result_links`. Subtasks, comments, activities, attachments, children, and dependencies are **not** embedded; fetch via their own endpoints. |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/` | Update task fields. Returns same stripped `TaskDetailSerializer` payload. |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/` | Delete task |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/move/` | Reorder task within/between statuses |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/children/` | List child tasks |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/clone/` | Deep-clone task with all children |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/apply-template/` | Create task from a template |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/activity/` | Paginated audit trail. Uses `StandardResultsSetPagination` (50/page). `?page=N`, `?size=N` (max 100). Returns `{count, next, previous, results}`. |

### Subtasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/` | List subtasks |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/` | Add subtask |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/{id}/` | Update subtask |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/{id}/` | Delete subtask |

### Comments & Reactions

Views live in `projects/views/comments.py` (extracted from `tasks.py`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/` | Paginated top-level comments (20/page) with replies and reactions nested. `?page=N`, `?size=N` (max 50). Returns `{count, next, previous, results}`. |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/` | Add comment or reply. Body: `{ body, parent_id? (UUID — must be a top-level comment), mentioned_user_ids?: [UUID] }`. Notifications sent async via `send_comment_notifications` Celery task. |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/{id}/` | Edit own comment (author only) |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/{id}/` | Delete own comment (author only). Cascades to replies. Invalidates reaction cache. |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/{id}/reactions/` | Toggle emoji reaction. Body: `{ emoji }`. Response: `{ reactions: {emoji: [{id, user_id, name}]}, action: "added"|"removed" }`. Reaction counts cached in Redis (`rxn:<comment_uuid>`). |

**Reply rules**: `parent_id` must point to a top-level comment (no reply-of-reply). Replies are nested under their parent in GET responses via `TaskCommentReplySerializer` (no further nesting). Parent comment author is notified when a reply is posted.

**Mention resolution**: Frontend resolves `@handle` → user UUID at picker selection time. Backend receives `mentioned_user_ids` (validated against workspace membership) — no regex scanning.

### Attachments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/attachments/` | List file attachments |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/attachments/` | Upload attachment |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/attachments/{id}/` | Delete attachment |

### Dependencies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/dependencies/` | List blocking/blocked relationships |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/dependencies/` | Create dependency |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/dependencies/{id}/` | Remove dependency |

### Labels

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/labels/` | List board labels |
| POST | `/api/workspaces/{ws}/boards/{pid}/labels/` | Create label |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/labels/{id}/` | Update label |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/labels/{id}/` | Delete label |

### Custom Fields

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/fields/` | List custom field definitions |
| POST | `/api/workspaces/{ws}/boards/{pid}/fields/` | Create custom field |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/fields/{id}/` | Update field |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/fields/{id}/` | Delete field |
| GET/POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/field-values/` | Get or set custom field values for a task |

### Saved Views

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/saved-views/` | List saved filter presets |
| POST | `/api/workspaces/{ws}/boards/{pid}/saved-views/` | Save a filter preset |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/saved-views/{id}/` | Update saved view |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/saved-views/{id}/` | Delete saved view |

### Sprints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/sprints/` | List sprints |
| POST | `/api/workspaces/{ws}/boards/{pid}/sprints/` | Create sprint |
| GET | `/api/workspaces/{ws}/boards/{pid}/sprints/{id}/` | Sprint detail |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/sprints/{id}/` | Update sprint |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/sprints/{id}/` | Delete sprint |

### Task Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/task-templates/` | List task templates |
| POST | `/api/workspaces/{ws}/boards/{pid}/task-templates/` | Create template |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/boards/{pid}/task-templates/{id}/` | Template CRUD |

### Approvals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/` | List approvals on task |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/` | Request approval (`reviewer_ids`, `due_date`, `note`) |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/{id}/review/` | Submit reviewer verdict (`status`, `comment`) — validated by `ApprovalReviewSerializer` |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/{id}/resubmit/` | Resubmit after changes requested — validated by `ApprovalResubmitSerializer` |

**Approval helpers** (module-level in `views/tasks.py`):

| Helper | Purpose |
|--------|---------|
| `_get_approval(workspace_id, board_id, task_id, approval_id, user)` | Scoped approval lookup with reviewers prefetched |
| `_notify_reviewers(approval, actor, workspace, task)` | Send `APPROVAL_REQUESTED` inbox notification to all reviewers |
| `_broadcast_approval(workspace_id, board_id, task_id, event, approval)` | Broadcast approval event with standard task/board context |

### Wiki

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/wiki/` | List wiki pages (tree structure) |
| POST | `/api/workspaces/{ws}/boards/{pid}/wiki/` | Create wiki page |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/boards/{pid}/wiki/{id}/` | Wiki page CRUD |
| GET | `/api/workspaces/{ws}/boards/{pid}/wiki/{id}/revisions/` | Page revision history |

### Documents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/documents/` | List workspace-level documents |
| POST | `/api/workspaces/{ws}/documents/` | Create document |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/documents/{id}/` | Document CRUD |

### Forms (Intake)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/forms/` | List intake forms |
| POST | `/api/workspaces/{ws}/boards/{pid}/forms/` | Create form |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/boards/{pid}/forms/{id}/` | Form CRUD |
| POST | `/api/workspaces/{ws}/boards/{pid}/forms/{id}/fields/` | Bulk update form fields |
| GET | `/api/workspaces/{ws}/boards/{pid}/forms/{id}/submissions/` | List form submissions |
| GET | `/forms/{token}/` | **Public** — get form schema (AllowAny) |
| POST | `/forms/{token}/submit/` | **Public** — submit form, creates task (AllowAny) |

### Automations ‼️ DISABLED

> Routes commented out in `urls.py`. `fire_automation()` is a no-op stub. Views exist in `views/automation.py` but are unreachable. Re-enable by uncommenting the three paths in `urls.py` and the import in `views/__init__.py`.

| Method | Path | Description |
|--------|------|-------------|
| ~~GET~~ | ~~`/api/workspaces/{ws}/boards/{pid}/automations/`~~ | ~~List automation rules~~ |
| ~~POST~~ | ~~`/api/workspaces/{ws}/boards/{pid}/automations/`~~ | ~~Create rule~~ |
| ~~GET/PATCH/DELETE~~ | ~~`/api/workspaces/{ws}/boards/{pid}/automations/{id}/`~~ | ~~Rule CRUD~~ |
| ~~GET~~ | ~~`/api/workspaces/{ws}/boards/{pid}/automations/{id}/logs/`~~ | ~~Rule execution history~~ |

### OKRs (Objectives & Key Results)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/objectives/` | List objectives |
| POST | `/api/workspaces/{ws}/objectives/` | Create objective |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/objectives/{id}/` | Objective CRUD |
| GET | `/api/workspaces/{ws}/objectives/{id}/key-results/` | List key results |
| POST | `/api/workspaces/{ws}/objectives/{id}/key-results/` | Create key result |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/objectives/{id}/key-results/{id}/` | KR CRUD |
| GET/POST/DELETE | `/api/workspaces/{ws}/objectives/{id}/key-results/{id}/tasks/` | Link/unlink tasks to key result |

**Real-time:** All mutating objective/KR endpoints call `broadcast()` — `objective.created`, `objective.updated`, or `objective.deleted` — so connected clients update instantly without polling. KR mutations (create, delete, patch, task-link changes) broadcast `objective.updated` with the full re-serialized parent objective.

### Integrations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/integrations/` | Status of all integration platforms |
| GET/PUT/DELETE | `/api/workspaces/{ws}/integrations/teams/` | Configure MS Teams webhook |
| POST | `/api/workspaces/{ws}/integrations/teams/test/` | Send test message to Teams |
| GET/PUT/DELETE | `/api/workspaces/{ws}/integrations/google-chat/` | Configure Google Chat webhook |
| POST | `/api/workspaces/{ws}/integrations/google-chat/test/` | Send test message to Google Chat |
| GET | `/api/workspaces/{ws}/integrations/mappings/` | List per-project routing rules |
| POST | `/api/workspaces/{ws}/integrations/mappings/` | Create routing rule |
| PATCH/DELETE | `/api/workspaces/{ws}/integrations/mappings/{id}/` | Update/delete routing rule |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/analytics/{metric}/` | Compute metric on-the-fly |

Available `{metric}` values:

| Metric | What it computes |
|--------|-----------------|
| `overview` | Total/open/done/overdue counts + open by priority |
| `velocity` | Completed story points or task count per sprint |
| `cycle_time` | Avg time from In Progress → Done (median, p75, p90) |
| `lead_time` | Avg time from Backlog → Done |
| `throughput` | Tasks completed per week/day |
| `cfd` | Cumulative flow — tasks in each status over time |
| `burnup` | Scope vs completed over sprint timeline |
| `workload_heatmap` | Task counts per assignee per week |
| `time_in_status` | Avg hours each task spent in each status |
| `overdue_aging` | Distribution of overdue tasks by days late |
| `completion_rate` | % tasks completed on-time vs late vs overdue |
| `estimation_accuracy` | Estimated vs actual hours deviation |

### Miscellaneous

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search/` | Global search across tasks and wiki pages |
| GET | `/api/my-work/` | Current user's assigned tasks + active sprints |
| GET | `/api/workspaces/{ws}/portfolio/` | Workspace-level board health metrics |
| POST | `/api/workspaces/{ws}/presence/` | Update user's current resource (task/board) |
| GET | `/api/schema/` | OpenAPI schema (YAML) |
| GET | `/api/docs/` | Swagger UI |

---

## Model Quick Reference

### accounts

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `User` | `id` (UUIDv7), `email` (unique), `full_name`, `avatar`, `can_create_workspace` | Custom auth model; USERNAME_FIELD = email |
| `UserProfile` | `user` (O2O), `theme`, `accent_color`, `density_mode` | Auto-created via post_save signal on User |

### workspaces

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Workspace` | `id` (UUIDv7), `name`, `logo`, `owner` (FK→User) | No slug — routes use UUID `id`. ordering: -id |
| `WorkspaceMember` | `workspace` (FK), `user` (FK), `role` (ADMIN/MEMBER/VIEWER), `invited_by`, `joined_at` | unique: workspace+user; index: workspace+role |
| `WorkspaceInvite` | `workspace` (FK), `email`, `role`, `token` (UUID4), `status` (PENDING/ACCEPTED/DECLINED) | unique: workspace+email; index: workspace+status |
| `InboxItem` | `user` (FK), `workspace` (FK), `actor_id` (str, denorm), `actor_name` (str, denorm), `verb`, `event_type`, `resource_name`, `board_id`, `project_name`, `meta` (JSON), `status` (UNREAD/READ/ARCHIVED/SNOOZED), `snoozed_until` | indexes: user+status, user+workspace+status; ordering: -id |
| `WorkspaceAPIKey` | `workspace` (FK), `name`, `key_prefix`, `key_hash`, `scopes` (JSON), `is_active`, `expires_at`, `last_used_at`, `created_by` (FK) | Raw key shown once; soft-delete via is_active. `generate()` classmethod returns (instance, raw_key) |
| `Webhook` | `workspace` (FK), `name`, `url`, `events` (JSON), `secret`, `is_active` | HMAC-SHA256 signing. `create_with_secret()` classmethod |
| `WebhookDelivery` | `webhook` (FK), `event`, `request_body`, `response_code`, `response_body`, `duration_ms`, `success`, `attempt` | indexes: webhook+created_at, webhook+success |
| `ImportJob` | `workspace` (FK), `source`, `status`, `file_name`, `parsed_rows`, `field_mapping`, `preview_rows`, `progress_pct`, `total_count`, `imported_count`, `skipped_count`, `error_log`, `imported_task_ids`, `created_by`, `completed_at` | index: workspace+status. Sources: jira, clickup, monday, notion, github, asana, csv |
| `OnboardingState` | `workspace` (O2O), `wizard_completed`, `team_type`, `checklist_dismissed`, `dismissed_by_users` (JSON) | |

### projects

| Model | Key Fields / Indexes | Notes |
|-------|---------------------|-------|
| `Board` | `workspace` (FK), `name`, `board_type`, `status`, `is_private` | Custom manager `for_user()` filters private boards. ordering: -id |
| `TaskStatus` | `board` (FK), `name`, `color`, `order`, `is_done` | unique: board+name; ordering: order |
| `Task` | `board` (FK), `parent` (FK self), `title`, `status` (FK), `priority`, `assignee` (FK), `labels` (M2M), `sprint` (FK), `due_date`, `estimate_points`, `task_type`, `order` | 6 indexes: board+status, board+assignee, board+priority, board+sprint, assignee+status, board+due_date |
| `SubTask` | `task` (FK), `title`, `is_done`, `order` | ordering: order |
| `TaskComment` | `task` (FK), `author` (FK), `body`, `parent` (FK self, nullable, CASCADE, related_name="replies") | index: task+created_at. `parent=None` → top-level comment; `parent!=None` → reply (one level only). Deleting a parent cascades to its replies. |
| `Label` | `board` (FK), `name`, `color` | unique: board+name |
| `BoardField` | `board` (FK), `name`, `type` (TEXT/NUMBER/SELECT/URL/DATE), `options` (JSON) | unique: board+name |
| `TaskFieldValue` | `task` (FK), `field` (FK), `value` | unique: task+field |
| `SavedView` | `board` (FK), `user` (FK), `name`, `filters` (JSON), `is_workspace_scoped` | unique: board+user+name |
| `Sprint` | `board` (FK), `name`, `start_date`, `end_date`, `status` (PLANNING/ACTIVE/COMPLETED) | |
| `TaskAttachment` | `task` (FK), `file`, `original_name`, `file_size`, `mime_type`, `uploaded_by` (FK) | |
| `TaskDependency` | `blocker` (FK→Task), `blocked` (FK→Task), `relation_type` | unique: blocker+blocked |
| `TaskActivity` | `task` (FK), `actor` (FK), `verb`, `meta` (JSON) | index: task+created_at |
| `BoardMember` | `board` (FK), `user` (FK), `role` (admin/editor/viewer) | unique: board+user |
| `TaskTemplate` | `board` (FK), `name`, `default_subtasks` (JSON) | unique: board+name |
| `WikiPage` | `board` (FK), `parent` (FK self), `title`, `slug`, `content`, `order` | unique: board+slug |
| `WikiRevision` | `page` (FK), `content`, `title`, `author` (FK) | |
| `Document` | `workspace` (FK), `title`, `content`, `created_by` (FK) | ordering: -updated_at |
| `Form` | `board` (FK), `name`, `is_active`, `token` (UUID4), `config` (JSON) | |
| `FormField` | `form` (FK), `label`, `field_type`, `is_required`, `options` (JSON), `order` | |
| `FormSubmission` | `form` (FK), `answers` (JSON), `task` (O2O), `status` (NEW/IN_REVIEW/CLOSED) | |
| `AutomationRule` | `board` (FK), `name`, `is_active`, `trigger` (JSON), `conditions` (JSON), `actions` (JSON) | |
| `AutomationLog` | `rule` (FK), `task` (FK), `exec_status`, `duration_ms` | indexes: rule+exec_status, rule+created_at |
| `Objective` | `workspace` (FK), `board` (FK, nullable), `parent` (FK self), `title`, `owner` (FK), `time_period`, `start_date`, `end_date` | `ObjectiveSerializer` exposes: id, title, description, time_period, start_date, end_date, owner, key_results, progress, confidence. Fields `project` and `child_count` were removed — they don't exist on the model. |
| `KeyResult` | `objective` (FK), `title`, `tasks` (M2M) | No `current_value` or `record_checkin` — progress is computed from linked tasks' done status. |
| `Approval` | `task` (FK), `requested_by` (FK), `status` (PENDING/APPROVED/REJECTED/CHANGES_REQUESTED) | |
| `ApprovalReviewer` | `approval` (FK), `user` (FK), `status`, `comment` | unique: approval+user |
| `UserPresence` | `user` (FK), `workspace` (FK), `resource_type`, `resource_id`, `last_seen` | unique: user+workspace+resource_type+resource_id |
| `CommentReaction` | `comment` (FK), `user` (FK), `emoji` | unique: comment+user+emoji |
| `AuditEvent` | `workspace` (FK), `actor` (FK), `action`, `resource_type`, `resource_id`, `before` (JSON), `after` (JSON) | indexes: workspace+created_at, workspace+resource_type |

### integrations

| Model | Key Fields |
|-------|-----------|
| `TeamsIntegration` | `workspace` (O2O), `webhook_url`, `space_name`, `is_active` |
| `GoogleChatIntegration` | `workspace` (O2O), `webhook_url`, `space_name`, `is_active` |
| `IntegrationChannelMapping` | `workspace` (FK), `board` (FK, nullable), `platform`, `channel_name`, `webhook_url`, `enabled_events` (JSON), `is_active` | unique: workspace+board+platform |

---

## Celery Tasks

| Task | Module | Retries | Purpose |
|------|--------|---------|---------|
| `deliver_webhook` | `workspaces.tasks` | 3 (5min → 30min backoff) | POST signed webhook payload; log WebhookDelivery |
| `send_invite_email` | `workspaces.tasks` | 2 (60s delay) | Send invite email via Resend SDK. Fetches invite with `select_related(workspace, invited_by)`, builds inline HTML, sends from `settings.FROM_EMAIL`. Fired by `POST /api/workspaces/{ws}/invites/` immediately after invite row is created. |
| `run_import` | `workspaces.tasks` | — | Parse file → create board/statuses → bulk insert tasks; push progress via WebSocket `import.progress` |
| `send_comment_notifications` | `projects.tasks` | — | Collect all recipients (task assignee/creator, parent comment author, @mentioned users), validate workspace membership for mentions, `bulk_create` all `InboxItem` rows in one DB round-trip, then broadcast per-user via WebSocket. Called with `.delay()` immediately after `POST /comments/` returns. |

---

## Signals

| Signal | Model | Handler | Purpose |
|--------|-------|---------|---------|
| `post_save` | `User` | `create_user_profile` | Auto-create UserProfile on User creation |
| `pre_save` | `Task` | `task_pre_save` | Snapshot old status/assignee for post_save diff |
| `post_save` | `Task` | `task_post_save` | ‼️ Automation calls disabled (no-op stub) — `fire_automation` commented out pending rebuild |

---

## Cross-App Event Flow

```
Task mutated in projects/views/
  → broadcast()               → WebSocket group "workspace_{id}" + _fire_webhooks()
  → _fire_webhooks()          → workspaces.tasks.deliver_webhook.delay()
  → notify()                  → InboxItem.create() + WebSocket group "user_{id}"
  → integrations.services     → Teams / Google Chat (fanout_notification)

Comment posted (POST /comments/)
  → view returns 201 immediately (non-blocking)
  → send_comment_notifications.delay(comment_id, workspace_id, sender_id, notified_ids, mentioned_user_ids)
      → validates mentioned_user_ids against workspace membership
      → InboxItem.objects.bulk_create([...])   ← one DB round-trip for all recipients
      → broadcast_to_user() per recipient      ← WebSocket push (can't batch, per-user groups)

Comment reaction toggled (POST /comments/{id}/reactions/)
  → CommentReaction get_or_create (concurrent-safe)
  → projects.cache.invalidate_reactions(comment_id)
  → projects.cache.set_reactions(comment_id, grouped)   ← repopulate Redis TTL=2h

File uploaded → ImportJob created → run_import.delay()
  → Channels group_send("workspace_{id}") → frontend progress bar

User created → post_save → UserProfile auto-created
```

---

## Permission Model

```
WorkspaceMember.role:  ADMIN > MEMBER > VIEWER
BoardMember.role:      admin > editor > viewer > guest

Role weights (_PROJ_WEIGHT): admin=4, editor=3, viewer=2, guest=1
Action thresholds (_ACTION_MIN): view≥2, edit≥3, delete≥4, admin≥4

Resolution:
  workspace ADMIN  → always "admin"   (no board override can restrict this)
  workspace MEMBER → min(editor=3, board_override_weight)
  workspace VIEWER → always "viewer"  (cannot be promoted)

get_effective_role(user, board)         → role string or None
has_project_permission(user, board, action) → bool
log_audit(actor, workspace, action, resource_type, resource_id, before, after)  → AuditEvent
bulk_log_audit(actor, workspace, action, resource_type, entries)                → bulk AuditEvent
```

Admin-only operations: API keys, webhooks, member role changes, invite cancellation.
Board admin: status management, board deletion, member management.
Viewer: read-only on boards.

---

## Redis Cache (`projects/cache.py`)

Connection pool: `max_connections=50`, 1 s socket timeout. All functions are no-op on Redis error (logged as WARNING — never raises to caller).

| Function | Key schema | TTL | Purpose |
|----------|-----------|-----|---------|
| `get_reactions(comment_id)` | `rxn:<comment_uuid>` | — | Return grouped reactions dict or `None` on miss |
| `set_reactions(comment_id, grouped)` | `rxn:<comment_uuid>` | 2 h | Store grouped reactions dict as JSON |
| `invalidate_reactions(comment_id)` | `rxn:<comment_uuid>` | — | Delete the key (called on every reaction toggle) |

Serializers use `_get_reactions_cached(obj)`: checks Redis first, falls back to prefetch cache (`obj.reactions.all()`), populates Redis on miss. This means reaction data is served from RAM after the first request and never hits Postgres until cache expires or a toggle invalidates it.

---

## Helper Utilities (`projects/views/helpers.py`)

| Helper | Purpose |
|--------|---------|
| `get_workspace_for_user(workspace_id, user)` | 404 if user not a member |
| `_get_board(workspace_id, board_id, user)` | Scoped board lookup |
| `_get_task(workspace_id, board_id, task_id, user, qs=)` | Scoped task lookup; pass custom queryset |
| `_task_list_qs()` | Annotated queryset for task list (5 count annotations, no N+1) |
| `_task_detail_qs()` | Lean queryset for single-task detail — `select_related(status, assignee, created_by, sprint, parent)` + `prefetch_related(labels, field_values__field)`. No subtasks/comments/activities prefetch — those are served by their own endpoints. |
| `_apply_task_filters(qs, params, user)` | Apply FilterBar params to a Task queryset |
| `_require_board_perm(user, board, role)` | Raise 403 if insufficient role |
| `_require_board_admin(request, workspace_id, board_id)` | Return (workspace, board) or raise 403/404 |
| `broadcast(workspace_id, event_type, data)` | WebSocket push + webhook fan-out |
| `broadcast_to_user(user_id, event_type, data)` | Push to a single user's WS group |
| `notify(recipient, actor, verb, workspace, task)` | InboxItem + WS push; no-op if actor==recipient |
| `log_activity(task, actor, verb, meta)` | Write TaskActivity row |

### Webhook event mapping (internal → public)

| Internal event | Public webhook event |
|---------------|---------------------|
| `task.created` | `task.created` |
| `task.updated` | `task.updated` |
| `task.moved` | `task.updated` |
| `task.deleted` | `task.deleted` |
| `task.commented` | `task.commented` |
| `tasks.bulk_updated` | `task.updated` |
| `tasks.bulk_deleted` | `task.deleted` |
| `status.updated` | `status.updated` |
| `sprint.started` | `sprint.started` |
| `sprint.completed` | `sprint.completed` |
| `objective.created` | `objective.created` |
| `objective.updated` | `objective.updated` |
| `objective.deleted` | `objective.deleted` |

All other events (presence, reactions, typing, etc.) are internal-only and never forwarded.

---

## Performance — Non-Negotiable Rules

1. **All PKs are UUIDv7** (`core.fields.UUIDv7Field`). Never use `uuid.uuid4` for a PK.
2. **No N+1**: Every view queryset must use `select_related` for FK/O2O and `prefetch_related` for M2M/reverse FK before serialization. Attach prefetches in `get_queryset()` on the view, not the serializer.
3. **Composite indexes** for every multi-column filter/order pattern. Follow naming: `<model_abbr>_<fields>_idx`.
4. **Bulk writes**: use `bulk_create()` / `bulk_update()` for multi-row mutations (import runner, automation actions, batch status changes).
5. **`QuerySet.update()`** over fetch-loop-save for batch field mutations.
6. **`values()` / `values_list()`** when only a subset of columns is needed (counts, ID lists, analytics aggregations).
7. **Never call `.count()` inside a loop** — aggregate in one query before the loop.
8. **Analytics views**: compute with `.annotate()` + `.values()` + DB aggregations, never Python loops over full querysets.

---

## Pagination (`core/pagination.py`)

Two paginator classes used across list endpoints:

| Class | `page_size` | `page_size_query_param` | `max_page_size` | Used by |
|-------|-------------|-------------------------|-----------------|---------|
| `StandardResultsSetPagination` | 50 | `size` | 100 | `TaskActivityListView` |
| `CommentPagination` | 20 | `size` | 50 | `TaskCommentListCreateView` |

All paginated responses follow DRF's standard envelope: `{count, next, previous, results}`.

---

## Constants

### `core/constants.py` — `DEFAULT_TASK_STATUSES`
```python
[
    {"name": "Backlog",     "color": "#94a3b8", "order": 0, "is_done": False},
    {"name": "In Progress", "color": "#6366f1", "order": 1, "is_done": False},
    {"name": "In Review",   "color": "#f59e0b", "order": 2, "is_done": False},
    {"name": "Done",        "color": "#22c55e", "order": 3, "is_done": True},
]
```

### `workspaces/constants.py` — `WEBHOOK_EVENTS`
```python
["task.created", "task.updated", "task.deleted", "task.assigned",
 "task.commented", "task.completed", "sprint.started", "sprint.completed",
 "member.added", "member.removed"]
```

---

## Known Tech Debt

| Item | Scope | Priority |
|------|-------|---------|
| RBAC is simple (3 ws roles + 4 board roles) — no custom role builder | `WorkspaceMember.Role` | v2 RBAC system |
| `InboxItem` actor fields are denormalized strings | `workspaces/models.py` | Acceptable v1 perf trade-off |
| Workspace templates are static in `constants.py` | `workspaces/constants.py` | Future: `WorkspaceTemplate` model |
| ‼️ Automation engine fully disabled — `fire_automation` is a no-op stub, routes commented out, signals disabled | `projects/automation.py`, `signals.py`, `urls.py` | Rebuild with Celery tasks + action registry pattern before re-enabling |
| Analytics computed on-the-fly | `analytics/views.py` | Future: materialized views or caching |
| `TaskTemplate` / `apply-template` included but template features deprioritized | `projects/views/tasks.py` | To be revisited in v2 |
