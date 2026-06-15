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
workspaces/     Workspace, members, invites, notifications, inbox, API keys, webhooks, imports, onboarding
projects/       Boards, tasks, sprints, statuses, labels, comments, wiki, forms, automations, OKRs, approvals
integrations/   Teams + Google Chat outbound webhooks, channel routing
analytics/      On-the-fly metrics (no models, computed from tasks/activity)
```

---

## ID Convention

All model PKs use `UUIDv7Field` from `core.fields` — time-sortable, no B-tree fragmentation.
Opaque token fields (invite tokens, form tokens) stay UUID4.
The DRF layer serializes PKs as prefixed strings via `PrefixedUUIDField` (e.g. `tsk_018e…`, `brd_…`, `wsp_…`).

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
> `{ws}` = workspace slug, `{pid}` = board/project UUID, `{tid}` = task UUID

### Auth (`/api/auth/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login/` | Log in, returns JWT access + refresh |
| POST | `/api/auth/logout/` | Invalidate refresh token |
| POST | `/api/auth/registration/` | Register new user (email, full_name, password) |
| POST | `/api/auth/token/refresh/` | Exchange refresh token for new access token |

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
| POST | `/api/workspaces/{ws}/invites/` | Send invite email to a new member |
| GET | `/api/workspaces/{ws}/invites/pending/` | List pending invites |
| DELETE | `/api/workspaces/{ws}/invites/{token}/` | Cancel a pending invite |
| GET | `/api/invites/{token}/` | Public — get invite info (workspace name, inviter) |
| POST | `/api/invites/{token}/accept/` | Accept invite and join workspace |

### Notifications & Inbox

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/` | Recent bell notifications for current user |
| POST | `/api/notifications/mark-read/` | Mark one or all notifications as read |
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
| GET | `/api/workspaces/{ws}/boards/` | List all boards in workspace |
| POST | `/api/workspaces/{ws}/boards/` | Create board |
| GET | `/api/workspaces/{ws}/boards/{pid}/` | Board detail with statuses and counts |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/` | Update board name/type/status |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/` | Delete board |
| GET | `/api/workspaces/{ws}/boards/{pid}/members/` | List board-level members |
| POST | `/api/workspaces/{ws}/boards/{pid}/members/` | Add board member with role |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/members/{id}/` | Change board member role |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/members/{id}/` | Remove board member |
| GET | `/api/workspaces/{ws}/boards/{pid}/my-permissions/` | Caller's effective role on this board |

### Task Statuses (Columns)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/statuses/` | List board statuses ordered by `order` |
| POST | `/api/workspaces/{ws}/boards/{pid}/statuses/` | Create status column |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/statuses/{id}/` | Rename/reorder/recolor status |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/statuses/{id}/` | Delete status (tasks moved to first remaining) |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/` | List tasks (filters: status, assignee, priority, sprint, label, due_before, search) |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/` | Create task |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/bulk/` | Bulk update tasks (status, assignee, priority, labels) |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/export/` | Export tasks as CSV or JSON |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/` | Task detail (full nested payload) |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/` | Update task fields |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/` | Delete task |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/move/` | Reorder task within/between statuses |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/children/` | List child tasks (subtask tasks) |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/clone/` | Deep-clone task with all children |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/apply-template/` | Create task from a template |
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/activity/` | Audit trail for task |

### Subtasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/` | List subtasks |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/` | Add subtask |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/{id}/` | Update subtask |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/subtasks/{id}/` | Delete subtask |

### Comments & Reactions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/` | List comments with reactions |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/` | Add comment |
| PATCH | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/{id}/` | Edit comment |
| DELETE | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/{id}/` | Delete comment |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/comments/{id}/reactions/` | Toggle emoji reaction |

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
| GET | `/api/workspaces/{ws}/boards/{pid}/sprints/{id}/burndown/` | Burndown chart data points |

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
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/` | Request approval |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/{id}/review/` | Submit reviewer verdict |
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/{id}/resubmit/` | Resubmit after changes requested |

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

### Automations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/boards/{pid}/automations/` | List automation rules |
| POST | `/api/workspaces/{ws}/boards/{pid}/automations/` | Create rule |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/boards/{pid}/automations/{id}/` | Rule CRUD |
| GET | `/api/workspaces/{ws}/boards/{pid}/automations/{id}/logs/` | Rule execution history |

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
| `Workspace` | `id`, `name`, `slug`, `logo`, `owner` (FK→User) | ordering: -id |
| `WorkspaceMember` | `workspace` (FK), `user` (FK), `role` (ADMIN/MEMBER/VIEWER), `invited_by` | unique: workspace+user; index: workspace+role |
| `WorkspaceInvite` | `workspace` (FK), `email`, `role`, `token` (UUID4), `status` (PENDING/ACCEPTED/DECLINED) | unique: workspace+email; index: workspace+status |
| `Notification` | `recipient` (FK), `actor` (FK), `verb`, `workspace` (FK), `meta` (JSON), `read` | indexes: recipient+read, recipient+created_at |
| `InboxItem` | `user` (FK), `workspace` (FK), `notification` (O2O), `actor_id`, `actor_name` (denorm), `verb`, `event_type`, `status` (UNREAD/READ/ARCHIVED/SNOOZED) | indexes: user+status, user+workspace+status |
| `WorkspaceAPIKey` | `workspace` (FK), `name`, `key_prefix`, `key_hash`, `scopes` (JSON), `is_active` | Raw key shown once; soft-delete via is_active |
| `Webhook` | `workspace` (FK), `url`, `events` (JSON), `secret`, `is_active` | HMAC-SHA256 signing |
| `WebhookDelivery` | `webhook` (FK), `event`, `response_code`, `success`, `attempt` | indexes: webhook+created_at, webhook+success |
| `ImportJob` | `workspace` (FK), `source`, `status`, `parsed_rows`, `field_mapping`, `progress_pct`, `imported_task_ids` | index: workspace+status |
| `OnboardingState` | `workspace` (O2O), `wizard_completed`, `team_type`, `dismissed_by_users` (JSON) | |

### projects

| Model | Key Fields / Indexes | Notes |
|-------|---------------------|-------|
| `Board` | `workspace` (FK), `name`, `board_type`, `status`, `is_private` | ordering: -id |
| `TaskStatus` | `board` (FK), `name`, `color`, `order`, `is_done` | unique: board+name; ordering: order |
| `Task` | `board` (FK), `parent` (FK self), `title`, `status` (FK), `priority`, `assignee` (FK), `labels` (M2M), `sprint` (FK), `due_date`, `estimate_points`, `order` | 6 indexes: board+status, board+assignee, board+priority, board+sprint, assignee+status, board+due_date |
| `SubTask` | `task` (FK), `title`, `is_done`, `order` | ordering: order |
| `TaskComment` | `task` (FK), `author` (FK), `body` | index: task+created_at |
| `Label` | `board` (FK), `name`, `color` | unique: board+name |
| `BoardField` | `board` (FK), `name`, `type` (TEXT/NUMBER/SELECT/URL/DATE), `options` (JSON) | unique: board+name |
| `TaskFieldValue` | `task` (FK), `field` (FK), `value` | unique: task+field |
| `SavedView` | `board` (FK), `user` (FK), `name`, `filters` (JSON), `is_workspace_scoped` | unique: board+user+name |
| `Sprint` | `board` (FK), `name`, `start_date`, `end_date`, `status` (PLANNING/ACTIVE/COMPLETED) | |
| `TaskAttachment` | `task` (FK), `file`, `original_name`, `file_size`, `mime_type`, `uploaded_by` (FK) | |
| `TaskDependency` | `blocker` (FK→Task), `blocked` (FK→Task), `relation_type` | unique: blocker+blocked |
| `TaskActivity` | `task` (FK), `actor` (FK), `verb`, `meta` (JSON) | index: task+created_at |
| `BoardMember` | `board` (FK), `user` (FK), `role` (ADMIN/EDITOR/VIEWER) | unique: board+user |
| `TaskTemplate` | `board` (FK), `name`, `default_subtasks` (JSON) | unique: board+name |
| `WikiPage` | `board` (FK), `parent` (FK self), `title`, `slug`, `content`, `order` | unique: board+slug |
| `WikiRevision` | `page` (FK), `content`, `title`, `author` (FK) | |
| `Document` | `workspace` (FK), `title`, `content`, `created_by` (FK) | ordering: -updated_at |
| `Form` | `board` (FK), `name`, `is_active`, `token` (UUID4), `config` (JSON) | |
| `FormField` | `form` (FK), `label`, `field_type`, `is_required`, `options` (JSON), `order` | |
| `FormSubmission` | `form` (FK), `answers` (JSON), `task` (O2O), `status` (NEW/IN_REVIEW/CLOSED) | |
| `AutomationRule` | `board` (FK), `name`, `is_active`, `trigger` (JSON), `conditions` (JSON), `actions` (JSON) | |
| `AutomationLog` | `rule` (FK), `task` (FK), `exec_status`, `duration_ms` | indexes: rule+exec_status, rule+created_at |
| `Objective` | `workspace` (FK), `board` (FK, nullable), `parent` (FK self), `title`, `owner` (FK), `time_period` | |
| `KeyResult` | `objective` (FK), `title`, `tasks` (M2M) | |
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
| `run_import` | `workspaces.tasks` | — | Parse file → create board/statuses → bulk insert tasks; push progress via WebSocket `import.progress` |

---

## Signals

| Signal | Model | Handler | Purpose |
|--------|-------|---------|---------|
| `post_save` | `User` | `create_user_profile` | Auto-create UserProfile on User creation |
| `pre_save` | `Task` | `task_pre_save` | Snapshot old status/assignee for post_save diff |
| `post_save` | `Task` | `task_post_save` | Fire automation rules on create/status change/assignment |

---

## Cross-App Event Flow

```
Task mutated in projects/views.py
  → _fire_webhooks()          → workspaces.tasks.deliver_webhook.delay()
  → fanout_notification()     → integrations.services (Teams / Google Chat)
  → Notification.create()     → in-app bell
  → InboxItem.create()        → inbox row (actor fields denormalized)

File uploaded → ImportJob created → run_import.delay()
  → Channels group_send("workspace_{slug}") → frontend progress bar

User created → post_save → UserProfile auto-created
```

---

## Permission Model

```
WorkspaceMember.role:  ADMIN > MEMBER > VIEWER
BoardMember.role:      ADMIN > EDITOR > VIEWER

Effective role = max(workspace_role, board_override_role)
get_effective_role(user, board)  — in projects/permissions.py
has_project_permission(user, board, action)  — weight-based check
```

Admin-only operations: API keys, webhooks, member role changes, invite cancellation.
Board admin: status management, board deletion, member management.
Viewer: read-only on boards.

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
| RBAC is simple (3 roles) — fine for v1 | `WorkspaceMember.Role` | v2+ |
| `InboxItem` actor fields are denormalized strings | `workspaces/models.py` | Acceptable v1 perf trade-off |
| Workspace templates are static in `constants.py` | `workspaces/constants.py` | Future: `WorkspaceTemplate` model |
| Automation runs synchronously in signals | `projects/signals.py` | Future: queue to Celery for large boards |
| Analytics computed on-the-fly | `analytics/views.py` | Future: materialized views or caching |
