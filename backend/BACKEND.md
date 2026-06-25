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
core/           Django settings, URLs, Celery, ASGI, custom fields (UUIDv7)
accounts/       User auth, UserProfile prefs
workspaces/     Workspace, members, invites, inbox, API keys, webhooks, imports, onboarding
projects/       Boards, tasks, sprints, statuses, labels, comments, wiki, forms, automations, OKRs, approvals
integrations/   Teams + Google Chat outbound webhooks, channel routing
analytics/      On-the-fly metrics (no models, computed from tasks/activity)
organization/   Org structure: departments, teams, job titles, reporting lines, org profiles, org chart
hr/             HR management: leave (policies/balances/requests), attendance (clock + QR), employee docs/notes, HR dashboard
```

---

## ID Convention

All model PKs use `UUIDv7Field` from `core.fields` — time-sortable, no B-tree fragmentation.
Opaque token fields (invite tokens, form tokens) stay UUID4.
All serializers return plain UUIDs — `PrefixedUUIDField` has been removed from the entire DRF layer.

URL route kwargs use plain UUIDs — `_parse_pk()` helpers in views still accept both formats for backwards compatibility.

---

## Authentication

| Method | Header / Mechanism |
|--------|--------------------|
| JWT | `Authorization: Bearer <jwt>` via SimpleJWT |
| API Key | `Authorization: Bearer jcn_<raw_key>` via `APIKeyAuthentication` |

Default permission: `IsAuthenticated`. Public endpoints (forms, invite detail) use `AllowAny`.

---

## App & Permission Registry (`workspaces/constants.py`)

Single source of truth for all product apps and their permissions. Replaces the old `MODULE_REGISTRY` in `core/modules.py` (`core/modules.py` is now a thin shim that re-exports `APP_REGISTRY` as `MODULE_REGISTRY` for any remaining legacy references).

### APP_REGISTRY

| Key | Name | depends_on |
|-----|------|------------|
| `projects` | Project Management | — |
| `org` | Org Structure | — |
| `hr` | HR Management | `org` |
| `analytics` | Advanced Analytics | — |

### PERMISSIONS (nested by app key)

```
workspace:  member.invite, member.remove, member.view_profile, report.view,
            settings.manage, api_keys.manage
projects:   project.create, project.delete, project.admin, task.view,
            task.create, task.edit, task.delete, task.move, task.comment,
            sprint.manage, automation.manage
org:        org.manage
hr:         hr.manage_leave, hr.manage_attendance
```

**How to add a new app:** Add to `APP_REGISTRY` + `PERMISSIONS` + `SYSTEM_ROLE_PERMISSIONS`. Frontend picks it up automatically from `GET /api/workspaces/{ws}/permissions/`.

**How to add a new permission:** Add it under the correct app key in `PERMISSIONS` and update `SYSTEM_ROLE_PERMISSIONS`. Serializer validation and the role editor UI derive from this dict — no other files change.

> See `CHANGELOG.md` for full migration history and the planned vD.2 DRF permission class upgrade.

---

## URL Reference

> Format: `METHOD /path/` — description  
> `{ws}` = workspace UUID, `{pid}` = board UUID, `{tid}` = task UUID

### Auth (`/api/auth/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login/` | Log in, returns JWT access + refresh |
| POST | `/api/auth/logout/` | Invalidate refresh token |
| POST | `/api/auth/registration/` | Register new user (email, full_name, password). When `ACCOUNT_EMAIL_VERIFICATION=mandatory` returns `{"detail": "Verification e-mail sent."}` with no tokens — client must redirect to check-inbox page. |
| POST | `/api/auth/registration/verify-email/` | Confirm email address. Body: `{ key }` (from the link in the verification email). Returns `{"detail": "ok"}` on success. |
| POST | `/api/auth/registration/resend-email/` | Resend verification email. Body: `{ email }`. |
| POST | `/api/auth/token/refresh/` | Exchange refresh token for new access token |
| POST | `/api/auth/password/reset/` | Request password reset. Body: `{ email }`. Sends a Resend email with a link to `{FRONTEND_URL}/reset-password/{uid}/{token}`. Always returns 200 (no user enumeration). |
| POST | `/api/auth/password/reset/confirm/` | Confirm password reset. Body: `{ uid, token, new_password1, new_password2 }`. |
| POST | `/api/auth/google/` | Google OAuth — body: `{ access_token }` (from `@react-oauth/google` implicit flow). Returns same JWT pair + user as email login. Silently merges with existing email account if emails match (`SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True`). View: `accounts/social_views.py::GoogleLogin`. On first Google login, `CustomSocialAccountAdapter` (accounts/adapter.py) captures Google's `picture` URL into `User.avatar` and sets `avatar_type="google"` — only if the user hasn't set a custom avatar already. Google OAuth users are treated as email-verified by allauth and bypass email verification. |

### Users (`/api/users/`)

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/api/users/me/` | Retrieve or update current user + profile. Writable fields: `full_name`, `avatar_type` (`initials`/`google`/`icon`), `avatar_icon` (emoji), `theme`, `accent_color`, `density_mode`. `avatar` is read-only (set by Google OAuth adapter only). |

### Workspaces (`/api/workspaces/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/` | List workspaces the current user belongs to. Queryset prefetches `members` so `WorkspaceSerializer` reads `member_count` and `my_role` from the cache — no per-workspace queries. |
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
| POST | `/api/invites/{token}/accept/` | Accept invite and join workspace; auto-assigns the matching system CustomRole |

### Custom RBAC (vD.1)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/permissions/` | Permission schema: `{ apps: APP_REGISTRY, permissions: PERMISSIONS }`. Static — cache with `staleTime: Infinity`. |
| GET | `/api/workspaces/{ws}/roles/` | List all roles (system + custom) with `member_count`, `app_access`, and nested `permissions` |
| POST | `/api/workspaces/{ws}/roles/` | Create a custom role (admin only). Body: `{ name, description?, app_access: {app_key: bool}, permissions: {app_key: {perm_key: bool}} }`. `is_system` is always `false` for created roles. |
| GET | `/api/workspaces/{ws}/roles/{id}/` | Role detail |
| PATCH | `/api/workspaces/{ws}/roles/{id}/` | Update name/description/app_access/permissions (admin only). System roles → 400. |
| DELETE | `/api/workspaces/{ws}/roles/{id}/` | Delete role (admin only). System roles → 400. Roles with active assignments → 400. |
| POST | `/api/workspaces/{ws}/members/{id}/assign-role/` | Assign or reassign a CustomRole to a member (admin only). Body: `{ role: "<uuid>" }`. Role must belong to this workspace. Idempotent via `update_or_create`. |
| POST | `/api/workspaces/{ws}/members/bulk-assign-role/` | Assign a single role to multiple members. Body: `{ role, member_ids: [] }`. Max 200 members. |

**Two-level permission model:**
- `app_access` — `{"projects": true, "hr": false, ...}` controls whether a user can enter a product area
- `permissions` — nested by app key; controls fine-grained actions within apps a user has access to

**System roles** (auto-created per workspace via `create_system_roles()`, `is_system=True`, non-deletable):
- `Admin` — all `app_access` true, all `permissions` true
- `Member` — all apps accessible; project/task/sprint perms on; destructive/admin perms off
- `Viewer` — all apps accessible; read-only perms only

**Permission helpers (`workspaces/permissions.py`):**

| Function | Purpose |
|----------|---------|
| `has_app_access(user, workspace, app_key)` | True if user's role has `app_access[app_key] = True` (or owner) |
| `require_app_access(user, workspace, app_key)` | Raises 403 if no app access |
| `has_permission(user, workspace, app_key, perm_key)` | True if user has the specific permission (implicitly checks app access first) |
| `resolve_permission(user, workspace, perm_key)` | Looks up app via `_PERM_TO_APP` reverse map, then delegates to `has_permission` — O(1), no scanning |

**`has_workspace_permission(user, workspace, action)`** in `workspaces/rbac.py` delegates to `resolve_permission` — kept for call sites that pass a bare action key without knowing the app.

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
| GET/PATCH | `/api/workspaces/{ws}/onboarding/` | Get or update onboarding wizard/checklist state (admin only). GET response shape: `{ wizard_completed, team_type, user_is_admin, checklists: { projects: { dismissed, items: {create_board, add_task, invite_teammate} }, org: { dismissed, items: {create_department, create_team, set_reporting_line} }, hr: { dismissed, items: {create_leave_policy, submit_leave_request, record_attendance} } } }`. PATCH accepts `wizard_completed`, `team_type`, and `module_dismiss: "<module_key>"` to dismiss a specific module's checklist for the current user. |

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
| `overview` | Total/open/done/overdue counts + open by priority. `tasks` and `open_tasks` computed in a single `aggregate()` call. |
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
| `sprint_burndown` | Ideal vs actual burndown for a single sprint. Requires `sprint_id` + `board_id`. Fetches all "first done" timestamps in one annotated query (`Min(created_at)` per task), then accumulates in Python — never issues a per-day COUNT query. |

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
| `User` | `id` (UUIDv7), `email` (unique), `full_name`, `avatar` (CharField, max 500), `avatar_type` (initials/google/icon, default initials), `avatar_icon` (emoji, nullable), `can_create_workspace` | Custom auth model; USERNAME_FIELD = email. `avatar` stores a Google picture URL when `avatar_type="google"`. No file uploads — set by `CustomSocialAccountAdapter` on Google OAuth. |
| `UserProfile` | `user` (O2O), `theme`, `accent_color`, `density_mode` | Auto-created via post_save signal on User |

**Email infrastructure (`accounts/emails/`, `accounts/adapter.py`):**

- `accounts/emails/` — template module (mirrors `workspaces/emails/`). `render(template_name, context)` does `{{key}}` string substitution on HTML files. Current templates: `password_reset.html`, `email_verification.html`.
- `CustomAccountAdapter(DefaultAccountAdapter)` — registered via `ACCOUNT_ADAPTER`. Overrides two methods:
  - `send_mail(template_prefix, email, context)` — intercepts allauth's email sending for `account/email/password_reset_key` and `account/email/email_confirmation*`; sends via Resend directly using branded HTML templates. Other allauth emails (rare edge cases like `account_already_exists`) fall through to Django's default backend.
  - `get_email_confirmation_url(request, emailconfirmation)` — returns `{FRONTEND_URL}/verify-email/{key}` so the link in the verification email points at the React app.
- `CustomPasswordResetSerializer(BasePasswordResetSerializer)` — registered via `REST_AUTH["PASSWORD_RESET_SERIALIZER"]`. Overrides `get_email_options()` to inject a custom `url_generator` that builds `{FRONTEND_URL}/reset-password/{uid}/{token}` using `REST_AUTH["PASSWORD_RESET_CONFIRM_URL"]`. This avoids dj_rest_auth's default which tries to `reverse("password_reset_confirm")` — a Django built-in URL we don't register.

**Key settings (`core/settings.py`):**

| Setting | Value | Notes |
|---------|-------|-------|
| `ACCOUNT_ADAPTER` | `"accounts.adapter.CustomAccountAdapter"` | Routes allauth emails through Resend |
| `REST_AUTH["PASSWORD_RESET_SERIALIZER"]` | `"accounts.serializers.CustomPasswordResetSerializer"` | Builds reset URL using FRONTEND_URL |
| `REST_AUTH["PASSWORD_RESET_CONFIRM_URL"]` | `"reset-password/{uid}/{token}"` | Frontend route pattern; used by `CustomPasswordResetSerializer` |
| `ACCOUNT_EMAIL_VERIFICATION` | env var, default `"mandatory"` | Set `ACCOUNT_EMAIL_VERIFICATION=none` in `.env` to skip in dev |
| `DEFAULT_FROM_EMAIL` | mirrors `FROM_EMAIL` env var | Required by dj_rest_auth's `PasswordResetSerializer.save()` |

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
| `OnboardingState` | `workspace` (O2O), `wizard_completed`, `team_type`, `module_dismissed_by_users` (JSONField `{"projects": ["uuid1"], "org": [], "hr": []}`) | Per-module per-user dismissal. Checklist items computed on-the-fly from `workspaces/checklist.py` registry — add new modules there, no model change needed. |
| `CustomRole` | `workspace` (FK), `name`, `description`, `is_system` (bool), `app_access` (JSONField `{"projects": true, "hr": false, ...}`), `permissions` (JSONField `{"workspace": {"settings.manage": true}, "projects": {"task.create": true}, ...}`) | unique: workspace+name; ordering: -is_system, name; index: `crole_workspace_system_idx`. `is_system=True` protects built-in Admin/Member/Viewer roles. Auto-created per workspace via `create_system_roles()`. |
| `RoleAssignment` | `workspace_member` (O2O→WorkspaceMember), `role` (FK→CustomRole, PROTECT), `assigned_by` (FK→User, nullable) | One per member; `update_or_create` on reassign; index: `rla_role_idx`. Auto-created for workspace owner (Admin) on workspace creation and for invited members on invite acceptance. |

### projects

| Model | Key Fields / Indexes | Notes |
|-------|---------------------|-------|
| `Board` | `workspace` (FK), `name`, `board_type`, `status`, `is_private`, `key` (CharField max 6, db_index) | Custom manager `for_user()` filters private boards. ordering: -id. `key` is a short uppercase slug reserved for v2 sequential task IDs — not yet populated or unique-constrained. |
| `TaskStatus` | `board` (FK), `name`, `color`, `order`, `is_done` | unique: board+name; ordering: order |
| `Task` | `board` (FK), `parent` (FK self), `title`, `status` (FK), `priority`, `assignee` (FK), `labels` (M2M), `sprint` (FK), `due_date`, `estimate_points`, `task_type`, `order` | 6 indexes: board+status+order (covering — filter+sort in one scan), board+assignee, board+priority, board+sprint, assignee+status, board+due_date. `Meta.ordering = ["-id"]`; per-column Kanban sort uses explicit `.order_by("status_id", "order")` in the task list view. |
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

### organization

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `JobTitle` | `workspace` (FK), `name`, `level` (PositiveSmallInt, default 0) | unique: workspace+name; ordering: level, name |
| `Department` | `workspace` (FK), `name`, `description`, `color`, `identifier` (max 6), `parent` (FK self, SET_NULL), `head` (FK→WorkspaceMember, SET_NULL), `created_by` (FK→User) | unique: workspace+name; index: `dept_workspace_parent_idx` (workspace+parent). `identifier` is **not** uniqueness-constrained or auto-generated. |
| `DepartmentMember` | `department` (FK), `member` (FK→WorkspaceMember) | unique: department+member; index: `deptmember_member_idx` (member). No stored `is_head` — the serializer exposes a **computed** `is_head` derived from `Department.head` (single source of truth). |
| `Team` | `workspace` (FK), `department` (FK, SET_NULL), `name`, `description`, `identifier` (max 6), `color`, `lead` (FK→WorkspaceMember, SET_NULL), `created_by` (FK→User) | unique: workspace+name; index: `team_workspace_dept_idx` (workspace+department) |
| `TeamMember` | `team` (FK), `member` (FK→WorkspaceMember) | unique: team+member; index: `teammember_member_idx` (member). No stored `is_lead` — the serializer exposes a **computed** `is_lead` derived from `Team.lead` (single source of truth). |
| `OrgProfile` | `member` (O2O→WorkspaceMember), `job_title` (FK, SET_NULL), `employment_type` (full_time/part_time/contractor/intern), `employee_id`, `start_date`, `location`, `bio` | One per member; auto-created via `get_or_create` on first GET/PATCH. `HRDashboardView` reads `start_date` (joiners/anniversaries) and `employment_type` (headcount split). |
| `ReportingLine` | `workspace` (FK), `manager` (FK→WorkspaceMember), `report` (FK→WorkspaceMember) | unique: workspace+report (one manager per person); index: `repline_workspace_manager_idx` (workspace+manager). `ReportingLineSerializer.validate` rejects self-reference, non-members, and cycles (walks manager's ancestor chain). |

### hr

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `LeavePolicy` | `workspace` (FK), `name`, `leave_type` (annual/sick/unpaid/paternity/maternity/compassionate), `days_per_year`, `carry_over_days`, `accrual_type` (upfront/monthly) | Workspace-level policy config; multiple policies per type allowed |
| `LeaveBalance` | `employee` (FK→WorkspaceMember), `policy` (FK), `year`, `total_days`, `used_days`, `pending_days` | unique: employee+policy+year; indexes: `lb_employee_year_idx` |
| `LeaveRequest` | `employee` (FK→WorkspaceMember), `policy` (FK), `start_date`, `end_date`, `reason`, `status` (pending/approved/rejected/cancelled), `approver` (FK→User), `reviewer_comment`, `reviewed_at` | indexes: `lr_employee_status_idx`, `leave_request_policy_dates_idx` |
| `AttendancePolicy` | `workspace` (O2O), `work_start_time`, `work_end_time`, `grace_period_minutes`, `weekly_hours` | One per workspace; auto-created on first access with sensible defaults (09:00–17:00, 15 min grace, 40 h/week) |
| `Attendance` | `employee` (FK→WorkspaceMember), `date`, `clock_in` (TimeField, nullable), `clock_out` (TimeField, nullable), `source` (manual/qr/api), `notes` | unique: employee+date (one row per employee per day) — this unique index also serves employee + date-range lookups, so no separate index. `clock_out=null` means still clocked in. |
| `EmployeeDocument` | `employee` (FK→WorkspaceMember), `doc_type` (contract/id/certificate/other), `file`, `original_name`, `expiry_date` (nullable), `uploaded_by` (FK→User) | files in `employee_docs/`; admin-only access; index: `edoc_employee_idx`; serializer exposes `days_until_expiry` computed field |
| `EmployeeNote` | `employee` (FK→WorkspaceMember), `author` (FK→User), `content`, `is_private` (default True) | private manager notes; never served to the employee; index: `enot_employee_idx` |

### organization — URL Reference

All org endpoints require `app_access["org"] = true` on the user's role (enforced via `require_app_access(user, workspace, "org")` in `_require_module`). Mutations require workspace admin; reads require membership only.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/org/departments/` | List departments (select_related head/parent, prefetch memberships for `member_count`) |
| POST | `/api/workspaces/{ws}/org/departments/` | Create department (admin) |
| GET | `/api/workspaces/{ws}/org/departments/{dept_id}/` | Department detail |
| PATCH | `/api/workspaces/{ws}/org/departments/{dept_id}/` | Update department (admin) |
| DELETE | `/api/workspaces/{ws}/org/departments/{dept_id}/` | Delete department (admin) |
| GET | `/api/workspaces/{ws}/org/departments/{dept_id}/members/` | List department members |
| POST | `/api/workspaces/{ws}/org/departments/{dept_id}/members/` | Add member to department (admin); body `{ member_id }`. Headship is set via `Department.head_id`, not here — `is_head` is read-only/computed. |
| DELETE | `/api/workspaces/{ws}/org/departments/{dept_id}/members/{membership_id}/` | Remove department member (admin) |
| GET | `/api/workspaces/{ws}/org/teams/` | List teams (select_related lead/department, prefetch memberships) |
| POST | `/api/workspaces/{ws}/org/teams/` | Create team (admin) |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/org/teams/{team_id}/` | Team detail / update / delete (admin for mutations) |
| GET | `/api/workspaces/{ws}/org/teams/{team_id}/members/` | List team members |
| POST | `/api/workspaces/{ws}/org/teams/{team_id}/members/` | Add member to team (admin); body `{ member_id }`. Lead is set via `Team.lead_id`, not here — `is_lead` is read-only/computed. |
| DELETE | `/api/workspaces/{ws}/org/teams/{team_id}/members/{membership_id}/` | Remove team member (admin) |
| GET | `/api/workspaces/{ws}/org/job-titles/` | List job titles (ordered by level, name) |
| POST | `/api/workspaces/{ws}/org/job-titles/` | Create job title (admin) |
| PATCH | `/api/workspaces/{ws}/org/job-titles/{title_id}/` | Update job title (admin) |
| DELETE | `/api/workspaces/{ws}/org/job-titles/{title_id}/` | Delete job title (admin) |
| GET | `/api/workspaces/{ws}/org/members/{member_id}/profile/` | Get member's org profile (auto-creates). Exposes `departments`, `teams`, `manager`, `direct_reports_count` (computed). |
| PATCH | `/api/workspaces/{ws}/org/members/{member_id}/profile/` | Update org profile — **admin or self** (`_require_admin_or_self`) |
| GET | `/api/workspaces/{ws}/org/reporting-lines/` | List reporting lines (manager → report) |
| POST | `/api/workspaces/{ws}/org/reporting-lines/` | Create reporting line (admin); body `{ manager_id, report_id }` |
| DELETE | `/api/workspaces/{ws}/org/reporting-lines/{line_id}/` | Delete reporting line (admin) |
| GET | `/api/workspaces/{ws}/org/chart/` | Org chart tree: all members with job_title, manager_id, departments, teams. Single query via `prefetch_related(department_memberships__department, team_memberships__team, org_profile__job_title, reports_to)`. |

### hr — URL Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/hr/leave-policies/` | List all policies |
| POST | `/api/workspaces/{ws}/hr/leave-policies/` | Create policy (admin only) |
| PATCH | `/api/workspaces/{ws}/hr/leave-policies/{id}/` | Update policy (admin only) |
| DELETE | `/api/workspaces/{ws}/hr/leave-policies/{id}/` | Delete policy (admin only) |
| GET | `/api/workspaces/{ws}/hr/leave-requests/` | List requests; employee sees own, admin sees all; `?status=pending` filter. Defaults to the **last 24 months** (by created_at) as an unbounded-growth backstop — pass `?all=true` to override. |
| POST | `/api/workspaces/{ws}/hr/leave-requests/` | Submit request; validates balance, updates pending_days, notifies admins |
| POST | `/api/workspaces/{ws}/hr/leave-requests/{id}/review/` | Approve/reject (admin only); adjusts used_days/pending_days; notifies employee |
| GET | `/api/workspaces/{ws}/hr/leave-balances/` | Current-year balances; employee sees own, admin sees all |
| GET | `/api/workspaces/{ws}/hr/whos-off/` | Approved leaves covering today + next 7 days |
| GET/PATCH | `/api/workspaces/{ws}/hr/attendance-policy/` | Get or update attendance policy (PATCH: admin only) |
| POST | `/api/workspaces/{ws}/hr/attendance/clock-in/` | Clock in current user for today; errors if already clocked in |
| POST | `/api/workspaces/{ws}/hr/attendance/clock-out/` | Clock out current user; errors if not clocked in or already out |
| GET | `/api/workspaces/{ws}/hr/attendance/` | Admin: all employees' records; `?employee=&date_from=&date_to=`. **Bounded window** via `_parse_date_window` — defaults to last 31 days, max span 366 days (`date_to < date_from` or over-span → 400). Returns a plain array (not paginated) so the UI gets a full week/month at once. |
| GET | `/api/workspaces/{ws}/hr/attendance/my/` | Employee: own records; `?date_from=&date_to=`. Same bounded-window rules as above. |
| GET | `/api/workspaces/{ws}/hr/attendance/summary/` | Admin: per-employee weekly summary (total_hours, late_count, days_present); `?date_from=&date_to=` defaults to current week |
| GET | `/api/workspaces/{ws}/hr/attendance/qr/` | Admin: generate daily HMAC-signed QR code; returns `{date, code, qr_url}` |
| POST | `/attendance/qr/{workspace_id}/{date}/{code}/` | Validate QR code and clock in current user (date must be today) |
| GET | `/api/workspaces/{ws}/hr/dashboard/` | Admin: headcount stats, leave overview (current month), attendance overview (rolling week), upcoming events (next 30 days) |
| GET/POST | `/api/workspaces/{ws}/hr/members/{id}/documents/` | Admin: list or upload employee documents. Upload validates size (≤10 MB, `MAX_DOC_SIZE_BYTES`) and `content_type` against `ALLOWED_DOC_CONTENT_TYPES` (PDF, images, Word) → 400 otherwise. |
| DELETE | `/api/workspaces/{ws}/hr/members/{id}/documents/{doc_id}/` | Admin: delete document (also removes file from storage) |
| GET/POST | `/api/workspaces/{ws}/hr/members/{id}/notes/` | Admin: list or create private manager notes |
| PATCH/DELETE | `/api/workspaces/{ws}/hr/members/{id}/notes/{note_id}/` | Admin: update or delete a note |

`AttendanceSerializer` computed fields: `status` (on_time/late/absent — compared against `AttendancePolicy.work_start_time + grace_period_minutes`), `total_hours` (float, null if no clock_out).

All hr endpoints require `app_access["hr"] = true` on the user's role (enforced via `require_app_access(user, workspace, "hr")` in `_require_module`).

**hr helpers (`hr/views.py`):** `_business_days(start, end)` (Mon–Fri count, inclusive; holidays not modelled); `_parse_date_window(request, default_lookback_days=31, max_span_days=366)` (bounded date-range parser used by attendance lists). Leave balance create/review wrap the balance mutation in `transaction.atomic()` + `select_for_update()`. All "today" logic uses `timezone.localdate()`.

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

## Serializers — Avatar Fields

`MiniUserSerializer` (embedded in tasks, members, comments, presence): exposes `avatar`, `avatar_type`, `avatar_icon` — all read-only. Every context that renders a user avatar receives the full avatar data without extra queries.

`UserSerializer` (GET/PATCH `/api/users/me/`): same three fields; `avatar_type` and `avatar_icon` are writable; `avatar` is read-only.

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

### Workspace-level (vD.1 — Custom RBAC)

Every `WorkspaceMember` has a `RoleAssignment` → `CustomRole` with two JSONFields:
- `app_access` — `{"projects": true, "hr": false, ...}` — coarse app-level gate
- `permissions` — `{"workspace": {"settings.manage": true}, "projects": {"task.create": true}, ...}` — nested fine-grained permissions

Permission resolution:
1. Workspace owner → always `True` for any check.
2. App access check: `role.app_access[app_key]`
3. Permission check: `role.permissions[app_key][perm_key]`
4. No `RoleAssignment` → `False`.

All logic lives in `workspaces/permissions.py`. `workspaces/rbac.py` is a thin wrapper that delegates to it.
Admin-level actions gate on `settings.manage` (in the `workspace` group).
Project-admin actions gate on `project.admin` (in the `projects` group).
App access for hr/org/projects is enforced via `require_app_access()` at the top of each view.

### Board-level (unchanged from v2.1)

```
BoardMember.role:      admin > editor > viewer > guest

Role weights (_PROJ_WEIGHT): admin=4, editor=3, viewer=2, guest=1
Action thresholds (_ACTION_MIN): view≥2, edit≥3, delete≥4, admin≥4

get_effective_role resolution (projects/permissions.py):
  CustomRole has project.admin → always "admin"  (no board override can restrict this)
  CustomRole has task.edit     → min(editor=3, board_override_weight)
  neither                      → always "viewer" (cannot be promoted)

get_effective_role(user, board)         → role string or None
has_project_permission(user, board, action) → bool
log_audit(actor, workspace, action, resource_type, resource_id, before, after)  → AuditEvent
bulk_log_audit(actor, workspace, action, resource_type, entries)                → bulk AuditEvent
```

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

## Helper Utilities (`organization/views.py`)

Module-level helpers shared across all org-structure views:

| Helper | Purpose |
|--------|---------|
| `_get_workspace(workspace_id, user)` | 404 if user not a member (same pattern as projects) |
| `_require_module(request, workspace)` | 403 if user's role has no `app_access["org"]`; delegates to `require_app_access` |
| `_require_admin(workspace, user)` | 403 if not workspace owner or admin member |
| `_require_admin_or_self(workspace, requesting_user, target_member)` | Allows self-edit; otherwise delegates to `_require_admin`. Used by `OrgProfileView.patch`. |

**Serializer conventions:**
- `DepartmentSerializer` and `TeamSerializer`: `get_member_count` uses `len(obj.memberships.all())` — reads from the prefetch cache set by `prefetch_related("memberships")` in list views.
- `OrgProfileSerializer`: uses `MiniJobTitleSerializer` (fields: `id`, `name`, `level`) — omits `created_at` which is irrelevant in this context.
- `OrgChartView`: prefetches `reports_to` only (not `reports_to__manager__user`) — `manager_id` is a stored FK column, no join needed.

---

## Helper Utilities (`projects/views/helpers.py`)

| Helper | Purpose |
|--------|---------|
| `get_workspace_for_user(workspace_id, user)` | 404 if user not a member |
| `_get_board(workspace_id, board_id, user)` | Scoped board lookup |
| `_get_task(workspace_id, board_id, task_id, user, qs=)` | Scoped task lookup; pass custom queryset |
| `_task_list_qs()` | Annotated queryset for task list — 7 count annotations (`_child_count`, `_done_child_count`, `_subtask_count`, `_done_subtask_count`, `_comment_count`, `_pending_approval_count`, `_approved_approval_count`), no N+1. `TaskSerializer` and `TaskCardSerializer` read these via `getattr(obj, "_<annotation>", fallback)` so they're safe for both list (annotation) and single-object (fallback) contexts. |
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
5. **`QuerySet.update()`** over fetch-loop-save for batch field mutations. Capture the return value (`updated = qs.update(...)`) — it is the affected row count. Never call `.count()` after `.update()`.
6. **`values()` / `values_list()`** when only a subset of columns is needed (counts, ID lists, analytics aggregations).
7. **Never call `.count()` inside a loop** — aggregate in one query before the loop.
8. **Analytics views**: compute with `.annotate()` + `.values()` + DB aggregations, never Python loops over full querysets.
9. **Never call `.count()` or `.filter()` on a prefetched relation** — it bypasses the prefetch cache and hits the DB. Use `len(obj.relation.all())` for totals and Python iteration/`sum()` for filtered counts. Only use annotation-based counts (rule 2 above) when the queryset is shared across many rows (list views).
10. **`SerializerMethodField` counts** must use `getattr(obj, "_annotation", fallback)` so the same serializer works safely for both list views (annotation path, zero extra queries) and single-object responses (fallback path, one query).

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
| Board-level RBAC (4 board roles) is still driven by `BoardMember.role` text field — not yet integrated with CustomRole permission flags | `projects/permissions.py` | vD.2 or later |
| `InboxItem` actor fields are denormalized strings | `workspaces/models.py` | Acceptable v1 perf trade-off |
| Workspace templates are static in `constants.py` | `workspaces/constants.py` | Future: `WorkspaceTemplate` model |
| ‼️ Automation engine fully disabled — `fire_automation` is a no-op stub, routes commented out, signals disabled | `projects/automation.py`, `signals.py`, `urls.py` | Rebuild with Celery tasks + action registry pattern before re-enabling |
| Analytics computed on-the-fly | `analytics/views.py` | Future: materialized views or caching |
| `TaskTemplate` / `apply-template` included but template features deprioritized | `projects/views/tasks.py` | To be revisited in v2 |
| No human-readable task IDs | `projects/models.py` | v2 — see Planned Features below |
| `OrgProfileSerializer` fires 4 queries/profile (departments, teams, manager, direct_reports `.count()`) — fine for the single-object endpoint, unusable in a list | `organization/serializers.py` | Annotate/prefetch if it's ever used in a list view |
| `OrgChartView` / `AttendanceSummary` / `HRDashboard` iterate members/records in Python — fine at SMB headcount, would need DB aggregation at scale | `organization/views.py`, `hr/views.py` | Revisit if workspaces exceed a few thousand members |

> **Resolved (this pass):** ReportingLine cycle/self-ref/non-member validation; leave-balance `select_for_update` race; bounded date windows on attendance + leave-request lists (replaces unbounded lists); `EmployeeDocument` upload size/content-type validation; dropped redundant `attendance_employee_date_idx`; extracted `_business_days` + reused `MiniMemberSerializer`; `is_head`/`is_lead` now computed from FK (single source of truth); `date.today()` → `timezone.localdate()`. **Several require migrations — see below.**

### ⚠️ Pending migrations (run before deploy)

The model edits above changed schema. Generate and apply:

```
python manage.py makemigrations hr organization
python manage.py migrate
```

Expected: `hr` initial migration (no migrations existed yet) reflecting the dropped `attendance_employee_date_idx`; `organization` migration dropping `DepartmentMember.is_head`, `TeamMember.is_lead`, and the stale `deptmember_dept_head_idx` / `teammember_team_lead_idx` indexes (plus the previously-uncommitted `OrgProfile.employment_type` from vB.2).

---

## Planned Features

### v2 — Jira-style Sequential Task IDs

**Goal:** Replace opaque UUIDs with short, human-readable task identifiers scoped per-project (e.g. `PROJ-1`, `PROJ-432`). This shifts task lookups from linear search to **binary search** — a sequential integer index is sorted by definition, so the DB can binary-search a B-tree on `sequence_id` in O(log n) instead of scanning. At millions of rows the difference is significant.

**Design:**
- Add `sequence_id = PositiveIntegerField` to `Task`, unique per board.
- Add a `BoardCounter` model (or use a DB sequence per board) as the atomic counter — never derive the next ID from `MAX(sequence_id) + 1` (race condition under concurrent inserts).
- Board identifier (e.g. `PROJ`) derived from board name slug, stored on `Board` as `key` (unique per workspace, max 6 chars, uppercase).
- Display format: `f"{board.key}-{task.sequence_id}"` — computed at the API layer, never stored.
- Expose as a read-only field on `TaskSerializer` and `TaskCardSerializer`.
- Add `sequence_id` as a filter param on the task list endpoint for direct lookup.

**Why not now:**
- Requires a migration adding `BoardCounter` table + backfill of existing tasks.
- Atomic counter needs either `SELECT FOR UPDATE` on the counter row or a native PostgreSQL sequence per board — the latter is cleaner but requires raw SQL in the migration.
- The `board.key` uniqueness constraint needs careful handling on board rename/delete.
