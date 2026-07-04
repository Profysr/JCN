# JCN Backend — Source of Truth

> **Maintenance rule for Claude**: Before any backend change, read this file. After any change that adds/modifies/removes a model, view, URL, serializer, task, signal, or constant, update the relevant section here in the same commit. Do not let this file drift. If a section grows stale, reread the affected files and reconcile. This file exists to avoid re-reading all source files every session — keep it accurate.

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Django 4.x + Django REST Framework |
| Async / WebSocket | Django Channels (ASGI via Daphne) |
| Message broker | **RabbitMQ** — backs both Celery tasks and the Channels WebSocket layer (`channels-rabbitmq`) |
| Background tasks | Celery worker (broker = RabbitMQ, result backend = `rpc://`) |
| Cache / rate limiting | **Redis** — caching + DRF throttling only (never a broker) |
| Database | PostgreSQL 16 |
| Auth | dj-rest-auth + SimpleJWT + APIKeyAuthentication (scoped + rate-limited) |
| Schema / Docs | drf-spectacular (OpenAPI) |
| Dev | Docker for db, redis, rabbitmq, backend, celery; Vite frontend runs locally |

> **New to the codebase?** Read `FLOWS.md` first — it walks each system (HTTP
> request, WebSocket, Celery, access control, API keys) as a step-by-step flow and
> says which file to edit. Permissions are documented in full in `ACCESS.md`.

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
IDs are plain UUIDs end-to-end. Serializers return plain UUIDs, URL route kwargs are plain UUIDs passed straight into ORM lookups, and WebSocket/webhook/integration payloads emit plain UUIDs too. The prefixed-ID helpers (`PrefixedUUIDField`, `parse_id`, `format_id`, and the per-view `_parse_pk()` shims) have all been removed. Model `PREFIX` class attributes remain as declarative metadata but are no longer consumed anywhere.

---

## Authentication

| Method | Header / Mechanism |
|--------|--------------------|
| JWT | `Authorization: Bearer <jwt>` via SimpleJWT |
| API Key | `Authorization: Bearer jcn_<raw_key>` via `APIKeyAuthentication` |

Default permission: `IsAuthenticated`. Public endpoints (forms, invite detail) use `AllowAny`.

**WebSocket auth** (`workspaces/middleware.py::JWTAuthMiddleware`) accepts the JWT from two transports, first match wins: (1) `Sec-WebSocket-Protocol: jwt, <token>` subprotocol — what the frontend uses (`useWorkspaceSocket.js` passes `["jwt", token]`); keeps the token out of URLs/logs; the consumer echoes `jwt` back on accept; (2) `Authorization: Bearer <token>` header — non-browser clients. The old `?token=` query param has been **removed**. The middleware only resolves `scope["user"]`; workspace membership is checked in `WorkspaceConsumer.connect()`. Close codes: **4401** unauthenticated (client should refresh the JWT and reconnect), **4403** not a workspace member (do not retry).

---

## App & Permission Registry (`workspaces/constants.py`)

Single source of truth for all product apps and their permissions. The old per-workspace module toggle system (`WorkspaceModule` model, `/modules/` routes, `core/modules.py`) has been **fully removed** — app-level access is now controlled entirely by `app_access` on each `CustomRole`.

### APP_REGISTRY

| Key | Name | depends_on |
|-----|------|------------|
| `projects` | Project Management | — |
| `people` | People & HR (Org Structure + HR Management) | — |
| `analytics` | Advanced Analytics | — |

### PERMISSIONS (nested by app key)

```
workspace:  member.invite, member.remove, member.view_profile, report.view,
            settings.manage, api_keys.manage
projects:   project.create, project.delete, project.admin, task.view,
            task.create, task.edit, task.delete, task.move, task.comment,
            sprint.manage, automation.manage
people:     org.view, org.manage, org.approve_profiles,
            hr.view, hr.manage_leave, hr.manage_attendance,
            hr.manage_documents, hr.manage_notes
```

Org Structure and HR Management are two Django apps (`organization`, `hr`)
but one backend permission app, `people` — HR's data model (leave,
attendance, employee records) is built entirely on org data. Permission
strings keep their original `org.*`/`hr.*` prefixes; only the outer app-key
grouping merged.

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
| GET | `/api/workspaces/{ws}/roles/` | **Scoped by caller's role.** Admins (owner or `settings.manage`) → all roles (system + custom) with `member_count`, `app_access`, and nested `permissions`. Non-admins → only their own assigned role (one-element array). `PermissionsContext` uses `roles.find(r => r.name === myRoleName)` which works correctly with either response. |
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

**Access-control layer — one module: `workspaces/access.py`** (see `ACCESS.md` for the full concept + per-endpoint table). `workspaces/permissions.py` and `workspaces/rbac.py` have been **removed**; everything below lives in `access.py`:

| Function | Purpose |
|----------|---------|
| `authorize(request, ws_id, *, app=, perm=, admin=, scope=)` | **The one-call view guard.** Resolves the workspace (membership/404) then enforces scope → admin → app → permission. Returns the workspace. Use this at the top of every protected view. |
| `has_app_access` / `require_app_access(user, ws, app_key)` | Coarse "can enter this product area" check (`CustomRole.app_access`) |
| `has_perm` / `require_perm(user, ws, perm_key)` | Fine-grained action check (app inferred from `_PERM_TO_APP`); owner short-circuits |
| `is_workspace_admin` / `require_workspace_admin(user, ws)` | Owner OR `settings.manage` |
| `get_workspace_or_404` / `member_workspace(user, ws_id)` | Membership-gated workspace fetch (raises 404 / returns None) |
| `request_scopes` / `has_scope` / `require_scope(request, scope)` | API-key scope ceiling (`read ⊆ write ⊆ admin`); JWT users are unbounded |
| `workspace_admins(workspace)` | List of admin members (owner + `settings.manage`) — for notification fan-out |
| `create_system_roles(workspace)` | Seeds the Admin/Member/Viewer roles on workspace creation |

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
| POST | `/api/workspaces/{ws}/boards/{pid}/statuses/bulk/` | **The only mutation path for existing statuses** — rename, recolor, reorder, set `is_done`/`is_started`, AND delete (any existing status absent from the payload is deleted). |

> **No per-status `PATCH`/`DELETE` routes exist** (`urls.py` defines only the two routes above). All edits/deletions go through `POST …/statuses/bulk/` (`TaskStatusBulkUpdateView`). Two guards in `views/tasks.py`:
> - `_guard_deletions` — if a status omitted from the payload **still has tasks**, the whole request is rejected with **400** `{"error": ...}`. Tasks are **not** auto-reassigned — move tasks off a column before deleting it. (`Task.status` is `SET_NULL`, so this guard is what prevents orphaned tasks.)
> - `BulkStatusUpdateSerializer.validate_statuses` — enforces a **single `is_done=True`** column (if several are sent, the last one wins).

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

**Mention resolution**: Frontend resolves `@handle` → user UUID at picker selection time. Backend receives `mentioned_user_ids`. For **private boards**, the view validates each user ID against board membership (`user_can_be_board_participant`) before saving the comment — returns **400** naming the blocked users if any fail. Public boards accept any workspace member.

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
| POST | `/api/workspaces/{ws}/boards/{pid}/sprints/{id}/tasks/bulk/` | Bulk assign/remove tasks — body `{task_ids: [uuid, …], action: "add"\|"remove"}` |

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
| POST | `/api/workspaces/{ws}/boards/{pid}/tasks/{tid}/approvals/{id}/admin-override/` | Admin-only force approve/reject/request-changes, bypassing reviewers — `ApprovalAdminOverrideView` (`_is_workspace_admin` required) |

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
| PUT | `/api/workspaces/{ws}/boards/{pid}/forms/{id}/fields/` | Bulk-replace form fields (`FormFieldsBulkUpdateView`) |
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

Four dedicated views replace the old `AnalyticsMetricView` dynamic router. All filter params are **flat** (no bracket notation) and applied by a single shared helper so chart counts and drill-down rows always agree.

**Filter params (all optional, accepted by every view):**

| Param | Values | Notes |
|-------|--------|-------|
| `board` | UUID | scope to one board |
| `status` | id1,id2,… | comma-separated status IDs |
| `priority` | lowest,low,medium,high,highest | comma-separated |
| `type` | task,bug,feature,story,epic,improvement,question | comma-separated |
| `assignee` | id1,id2,… | comma-separated user IDs |
| `label` | id1,id2,… | comma-separated label IDs |
| `due` | overdue,today,this_week,no_date | OR within dimension |
| `open` | true\|false | open vs done tasks |
| `overdue` | true | open AND past due_date |
| `blocked` | true\|false | has / has no blocking dep |
| `search` | text | title icontains |
| `created_before` | `14d` or ISO datetime | relative or absolute cutoff |
| `created_after` | `30d` or ISO datetime | relative or absolute cutoff |
| `due_before` | YYYY-MM-DD | |
| `due_after` | YYYY-MM-DD | |
| `sprint` | current\|last\|uuid | filter by sprint (group_by sprint is disabled) |

**Views:**

| Method | Path | View | Pagination | Description |
|--------|------|------|------------|-------------|
| GET | `/api/workspaces/{ws}/analytics/summary/` | `WorkspaceSummaryView` | none | Headline KPIs: `{total, open, done, overdue}` in one `aggregate()` call. Use for top-of-page KPI cards. |
| GET | `/api/workspaces/{ws}/analytics/aggregate/` | `AnalyticsAggregateView` | offset per dim | **Jira-style rich response.** Returns a `summary` block (total/open/done/overdue/stale/blocked) plus a `groups` map keyed by dimension — one request powers all board-level charts. `group_by` accepts comma-separated dims: `status,priority,type,assignee,board,date`. `metric=count\|story_points`. `stale_days=N` (default 30). `page` + `page_size` (max 50) per dimension. |
| GET | `/api/workspaces/{ws}/analytics/team/` | `TeamWorkloadView` | cursor by user | Per-member rollup: `{ user, assigned, open, overdue, completed, points, days, total_due }`. `days=N` (default 14) controls heatmap window. Only members with assigned tasks appear. |
| GET | `/api/workspaces/{ws}/analytics/tasks/` | `TaskDrilldownView` | cursor by ticket | Flat paginated task list — the click-through engine for every chart segment. `order=recent\|oldest\|due`. Row: `id, board_id, board, title, priority, task_type, estimate_points, due_date, status, assignee, days_overdue`. Cursor pagination: no `count` key — use `next` link to load more. |

**`aggregate/` response shape:**
```json
{
  "summary": { "total": 120, "open": 45, "done": 75, "overdue": 12, "blocked": 8, "stale": 20 },
  "group_by": ["status", "priority"],
  "metric": "count",
  "groups": {
    "status":   { "results": [{"key": "uuid", "label": "In Progress", "color": "#6366f1", "value": 23}], "total_groups": 4, "page": 1, "page_size": 25, "has_more": false },
    "priority": { "results": [...], "total_groups": 5, ... }
  }
}
```

**`team/` row shape:**
```json
{ "user": { "id": "uuid", "email": "...", "full_name": "..." }, "assigned": 4, "open": 3, "overdue": 1, "completed": 1, "points": 8, "days": { "2026-06-22": 0, "2026-06-23": 2 }, "total_due": 2 }
```

> `_apply_task_filters(qs, params, workspace)` in `analytics/views.py` is the single source of truth for task filtering — applied identically across all four views. Sprint `group_by` is disabled; sprint filter param is still accepted. All sprint metric functions (`velocity`, `burnup`, `completion_rate`) have been removed.

> **Old `AnalyticsMetricView` catch-all removed.** The `/analytics/{metric}/` dynamic route no longer exists. Any frontend code using `filter[X]` bracket params or the old metric names (`overview`, `velocity`, `burnup`, `completion_rate`) must be updated to the flat param names and new URLs above.

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

## Projects — Behavior, Validation & Permissions (test reference)

> Everything a test case needs that the URL/model tables don't capture: who is allowed to do what, what gets rejected, and what side effects fire. Scoped to the `projects` app. Sources: `projects/permissions.py`, `projects/serializers.py`, `projects/views/*.py`, `projects/signals.py`.

### Board-level permission model (`projects/permissions.py`)

`has_project_permission(user, board, action)` resolves in this **order** (first hit wins):

1. Not a workspace member → **False**.
2. Workspace **owner** → **True** (always).
3. Workspace **CustomRole** has the mapped permission (`_ACTION_TO_PERM`) → **True**.
4. **BoardMember** override role allows the action (`BOARD_ROLE_PERMISSIONS`) → its value.
5. Otherwise → **False**.

> Note the precedence: a workspace CustomRole grant is checked **before** the per-board `BoardMember` role. A board-level role can therefore only *add* access a member doesn't already have via their workspace role — it can't *revoke* it.

**`_ACTION_TO_PERM`** (board action → workspace permission key): `view→task.view`, `edit→task.edit`, `delete→task.delete`, `move→task.move`, `comment→task.comment`, `admin→board.admin`.

**`BOARD_ROLE_PERMISSIONS`** (BoardMember fallback matrix):

| Role | view | edit | delete | move | comment | admin |
|------|:----:|:----:|:------:|:----:|:-------:|:-----:|
| `admin`  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `editor` | ✓ | ✓ | — | ✓ | ✓ | — |
| `viewer` | ✓ | — | — | — | ✓ | — |
| `guest`  | ✓ | — | — | — | — | — |

`GET …/boards/{pid}/role-permissions/` returns this table verbatim (consumed by the frontend `useBoardRoleDefinitions`).

**Where checks are enforced** (guards `_require_board_perm` / `_require_board_admin` / `_is_workspace_admin` — all in `projects/permissions.py`):

| Endpoint | Required |
|----------|----------|
| Board list/detail | `has_app_access(user, ws, "projects")` + board visibility (`Board.objects.for_user` filters private boards) |
| `DELETE /boards/{pid}/` | workspace admin |
| Board member add/remove (`POST/DELETE …/members/`) | board `admin` |
| `DELETE /tasks/{tid}/` and bulk-delete | board `delete` |
| `POST /tasks/{tid}/clone/`, apply-template | board `edit` |
| `POST /forms/` | board `edit`; `DELETE /forms/{id}/` → board `admin` |
| `PATCH`/`DELETE /comments/{id}/` | **author only** (else 403) |
| Public form `GET/POST /forms/{token}/…` | `AllowAny` (no auth) |

> **Gap to be aware of when testing:** `PATCH /tasks/{tid}/` and `…/move/` do not call an explicit `_require_board_perm("edit"/"move")` — they rely on board visibility via `_get_task`. A viewer who can load a task could currently PATCH it. Treat as a known soft spot, not documented intent.

### Validation rules (serializers)

- **Task** (`TaskSerializer`): `title` required (max 500). `validate()` rejects `start_date > due_date` → **400** `{"start_date": "Start date cannot be after the due date."}`; it merges incoming values with the existing instance so a partial PATCH validates against stored fields. For **private boards**, `validate()` also checks `assignee_id` via `user_can_be_board_participant` — rejects with **400** `{"assignee_id": "This user doesn't have access to this board."}` if the assignee is not a board member or workspace admin. The `board` object is passed through serializer context by both `TaskListCreateView.post()` and `TaskDetailView.patch()`. Write-only: `assignee_id`, `status_id`, `label_ids`, `sprint_id`, `parent_id`. Read-only: `id`, `created_by`, `created_at`, `updated_at`, `version`. Defaults: `priority=medium`, `task_type=task`, `order=0`, `version=1`. On create sets `created_by=request.user`; `label_ids` → `task.labels.set(...)`.
- **Version conflict**: `PATCH /tasks/{tid}/` calls `_check_version_conflict` — if the body's `version` is present and ≠ the stored `version`, returns **409** `{detail, current_version, updated_at}`. On success the task's `version` is incremented. (Test optimistic-concurrency by PATCHing with a stale `version`.)
- **Status bulk** (`BulkStatusUpdateSerializer`): `statuses` list (≥1). Per item: `id?`, `name`, `color`, `is_done`, `is_started`. Enforces a single `is_done=True` (last wins). Deletion guard described in the Task Statuses section above.
- **Approval** (`ApprovalSerializer`): `reviewer_ids` (≥1) required, write-only; `due_date`/`note` optional. On create, idempotently `get_or_create`s an `ApprovalReviewer` (status `PENDING`) per reviewer. `overridden_by` (read-only, `MiniUserSerializer`) and `override_comment` (read-only) are included in the response when set. Review (`ApprovalReviewSerializer`): `status` ∈ {approved, rejected, changes_requested}, `comment?`. Resubmit (`ApprovalResubmitSerializer`): empty body; **403** unless `request.user == approval.requested_by`; **400** if already `APPROVED`. Admin override (`ApprovalAdminOverrideSerializer`): `status` ∈ {approved, rejected, changes_requested}, `comment?`; sets `overridden_by=request.user`; **403** unless `_is_workspace_admin`; logs `approval_admin_overridden` activity; broadcasts `approval.updated`.
- **Comment**: `body` required; `parent_id` (write-only) must reference a **top-level** comment (`parent__isnull=True`) on the same task — validated in the view, so reply-of-reply → 404/400.

### Business logic & side effects worth testing

- **Task move** (`TaskMoveView`): body `{status_id?, order?}`. If destination is a **done** column and the task has a **pending approval**, rejected with **403** `{approval_required: true}` (`_check_move_blocked`). If destination has `is_started=True` and the task has no `start_date`, it's auto-set to today. Activity (`task.moved`) logged + broadcast only when the status actually changed.
- **Deep clone** (`Task.clone()`): recursively clones the task and all children; copies labels + subtasks (order preserved); appends `" (Copy)"` to title; **strips** `assignee`, `start_date`, `due_date`, `sprint`, `order`. Logs activity `CREATED` with `meta.cloned_from`.
- **Comment notifications** (async `send_comment_notifications`): task assignee + creator, parent-comment author (on reply), and `@mentioned_user_ids` each notified once (deduped); the author is never notified of their own comment. **Private-board mention guard** runs synchronously in the view *before* the comment is saved: each mentioned user ID is checked via `user_can_be_board_participant`; if any fail, the view returns **400** with the names of the blocked users and the comment is not persisted. Public boards have no mention restriction beyond workspace membership (validated by the Celery task).
- **Public form submission** (`PublicFormSubmitView`, `AllowAny`): creates a `FormSubmission`; if `config.create_task` (default true), creates a Task with `created_by=NULL`, title from `config.title_field_id` (else "Submission from …"), status from `config.default_status_id` (else the board's first status), then links `submission.task`.
- **Bulk task update** (`TaskBulkUpdateView`): `{task_ids, action: update|delete, updates?}`. Skips rows already at the target value; re-serializes affected cards and broadcasts `tasks.bulk_updated`.
- **Reactions**: `CommentReactionToggleView` toggles one emoji per user/comment; counts cached in Redis (`rxn:<comment_uuid>`), invalidated on toggle and on comment delete.

### Signals (`projects/signals.py`)

- `task_pre_save` — for existing tasks, snapshots old `status_id`/`assignee_id` onto the instance (`_status_changed`, `_assignee_changed`, `_old_status`) for activity logging; skips new rows.
- `task_post_save` — currently a **no-op** (`pass`). The automation hooks (`fire_automation`) are commented out — consistent with **Automations being disabled** (see the Automations section). No automation/broadcast side effects fire from signals; broadcasts and inbox notifications are emitted explicitly from the views/Celery tasks.

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
| `InboxItem` | `user` (FK), `workspace` (FK), `actor_id` (str, denorm), `actor_name` (str, denorm), `verb`, `event_type`, `resource_name`, `board_id`, `board_name` (renamed from `project_name`), `meta` (JSON), `status` (UNREAD/READ/ARCHIVED/SNOOZED), `snoozed_until` | indexes: user+status, user+workspace+status; ordering: -id. `verb`/`event_type` have **no model choices** — the contract is `core.events.NOTIFICATION_VERBS` (verb → event_type + label); `event_type` is always derived, never passed by callers. |
| `WorkspaceAPIKey` | `workspace` (FK), `name`, `key_prefix`, `key_hash`, `scopes` (JSON), `is_active`, `expires_at`, `last_used_at`, `created_by` (FK) | Raw key shown once; soft-delete via is_active. `generate()` classmethod returns (instance, raw_key) |
| `Webhook` | `workspace` (FK), `name`, `url`, `events` (JSON), `secret`, `is_active` | HMAC-SHA256 signing. `create_with_secret()` classmethod |
| `WebhookDelivery` | `webhook` (FK), `event`, `request_body`, `response_code`, `response_body`, `duration_ms`, `success`, `attempt` | indexes: webhook+created_at, webhook+success |
| `ImportJob` | `workspace` (FK), `source`, `status`, `file_name`, `parsed_rows`, `field_mapping`, `preview_rows`, `progress_pct`, `total_count`, `imported_count`, `skipped_count`, `error_log`, `imported_task_ids`, `created_by`, `completed_at` | index: workspace+status. Sources: jira, clickup, monday, notion, github, asana, csv |
| `OnboardingState` | `workspace` (O2O), `wizard_completed`, `team_type`, `module_dismissed_by_users` (JSONField `{"projects": ["uuid1"], "org": [], "hr": []}`) | Per-module per-user dismissal. Checklist items computed on-the-fly from `workspaces/checklist.py` registry — add new modules there, no model change needed. |
| `CustomRole` | `workspace` (FK), `name`, `description`, `is_system` (bool), `app_access` (JSONField `{"projects": true, "hr": false, ...}`), `permissions` (JSONField `{"workspace": {"settings.manage": true}, "projects": {"task.create": true}, ...}`) | unique: workspace+name; ordering: -is_system, name; index: `crole_workspace_system_idx`. `is_system=True` protects built-in Admin/Member/Viewer roles. Auto-created per workspace via `create_system_roles()`. |
| `RoleAssignment` | `workspace_member` (O2O→WorkspaceMember), `role` (FK→CustomRole, PROTECT), `assigned_by` (FK→User, nullable) | One per member; `update_or_create` on reassign; index: `rla_role_idx`. Auto-created for workspace owner (Admin) on workspace creation and for invited members on invite acceptance. |
| `AuditEvent` | `workspace` (FK), `actor` (FK), `action`, `resource_type`, `resource_id`, `before` (JSON), `after` (JSON) | indexes: workspace+created_at, workspace+resource_type. Moved here from `projects/models.py` — it's workspace-wide infra, not project-specific. Write helpers `log_audit()`/`bulk_log_audit()` live in `workspaces/audit.py` (moved from `projects/permissions.py`); any app can call them. Still write-only — no audit-log viewer endpoint exists yet. **Requires `makemigrations projects workspaces` — see Pending migrations.** |

### projects

| Model | Key Fields / Indexes | Notes |
|-------|---------------------|-------|
| `Board` | `workspace` (FK), `name`, `board_type`, `status`, `is_private`, `key` (CharField max 6, db_index) | Custom manager `for_user()` filters private boards. ordering: -id. `key` is a short uppercase slug reserved for v2 sequential task IDs — not yet populated or unique-constrained. |
| `TaskStatus` | `board` (FK), `name`, `color`, `order`, `is_done` | unique: board+name; ordering: order |
| `Task` | `board` (FK), `parent` (FK self), `title`, `status` (FK), `priority`, `assignee` (FK), `labels` (M2M), `sprint` (FK), `start_date`, `due_date`, `estimate_points`, `task_type`, `order` | `TaskSerializer.validate` rejects `start_date > due_date` (merges with instance values so partial PATCH validates against the existing field) → 400 `{"start_date": ...}`. 6 indexes: board+status+order (covering — filter+sort in one scan), board+assignee, board+priority, board+sprint, assignee+status, board+due_date. `Meta.ordering = ["-id"]`; per-column Kanban sort uses explicit `.order_by("status_id", "order")` in the task list view. |
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
| `Approval` | `task` (FK), `requested_by` (FK), `status` (PENDING/APPROVED/REJECTED/CHANGES_REQUESTED), `overridden_by` (FK User, nullable), `override_comment` (TextField, blank) | `overridden_by` set when a workspace admin force-changes status via `admin-override/` endpoint |
| `ApprovalReviewer` | `approval` (FK), `user` (FK), `status`, `comment` | unique: approval+user |
| `UserPresence` | `user` (FK), `workspace` (FK), `resource_type`, `resource_id`, `last_seen` | unique: user+workspace+resource_type+resource_id |
| `CommentReaction` | `comment` (FK), `user` (FK), `emoji` | unique: comment+user+emoji |

`AuditEvent` moved to `workspaces/models.py` (see the "workspaces" table above) — it was never project-specific, and `organization` and `workspaces` itself both write to it now.

### organization — Org Events

`organization/events.py` has been **removed** — org views call `core.events.broadcast(workspace_id, event_type, data)` directly (see the Eventing section). All org event names are registered in `core.events.EVENTS`.

**Event types wired so far:**

| View / task | Event fired |
|-------------|-------------|
| `DepartmentListCreateView.post` | `org.department.created` |
| `DepartmentDetailView.patch` | `org.department.updated` |
| `DepartmentDetailView.delete` | `org.department.deleted` |
| `TeamListCreateView.post` | `org.team.created` |
| `TeamDetailView.patch` | `org.team.updated` |
| `TeamDetailView.delete` | `org.team.deleted` |
| `ReportingLineListCreateView.post` | `org.reporting_line.created` |
| `ReportingLineDetailView.delete` | `org.reporting_line.deleted` |
| `DepartmentMemberListCreateView.post` / `DepartmentMemberDetailView.delete` | `org.department_member.added` / `.removed` |
| `TeamMemberListCreateView.post` / `TeamMemberDetailView.delete` | `org.team_member.added` / `.removed` |
| `JobTitleListCreateView.post` / `JobTitleDetailView.patch` / `.delete` | `org.job_title.created` / `.updated` / `.deleted` |
| `MyOrgProfileView.post` (submit) | `org.profile.submitted` |
| `OrgProfileView.patch` / `MyOrgProfileView.patch` | `org.profile.updated` |
| `ApproveProfileView.post` | `org.profile.approved` |
| `BulkApproveProfilesView.post` | `org.profile.approved` (one per profile) |

All of the above were already firing `broadcast()` and registered in `core.events.EVENTS`, but 8 of them (`department_member.*`, `team_member.*`, `job_title.*`, `profile.updated`) were missing from `workspaces/constants.py::WEBHOOK_EVENTS` — external webhook subscribers had no way to select them even though they fired over WebSocket. Fixed; see the `WEBHOOK_EVENTS` reference below.

**Structural mutations are also audit-logged** via `workspaces.audit.log_audit()` — department/team create/update/delete, department/team member add/remove, and reporting-line create/delete each write an `AuditEvent` row (before/after snapshot where applicable). Job-title changes are not audit-logged (not considered a structural reorg).

### organization — Permission model

All gating goes through `workspaces/access.py` (see `ACCESS.md`). In `organization/views.py`:
- **Reads** (`_read_ws`): `access.authorize(request, ws, perm="org.view", scope="read")` + `_require_onboarded` (non-admins with a draft/missing profile are walled off). Job-title *list* skips the onboarding wall so the chart can render pre-approval.
- **Structural mutations** (`_manage_ws`): `perm="org.manage"`, `scope="write"` (departments, teams, job titles, reporting lines, and their memberships).
- **Profile review/approval**: `perm="org.approve_profiles"`.
- **Own profile** (`/org/me/profile/`) and **view-a-member's-profile** (`/org/members/{id}/profile/`): membership + `member.view_profile` for others' profiles — never gated on `org.view`, since these are consumed workspace-wide (directory, HR).
`_require_onboarded` and `_require_profile_view_access` are the only org-local helpers left — both delegate their access checks to `access.py`.

Bug fixes bundled in this migration: the admin check no longer queries the removed `WorkspaceMember.role` field (was a 500); a duplicate reporting-line manager now returns a clean 400; write-only `*_id` fields reject cross-workspace IDs; `OrgProfileView.patch` now enforces the same "approved ⇒ manager-only" lock as `/org/me/profile/`.

More bug fixes (later pass): removing the `DepartmentMember`/`TeamMember` row that held headship/leadership now also clears `Department.head`/`Team.lead` (was left dangling, pointing at a non-member); `DepartmentSerializer` now validates `parent_id` for self-reference and cycles the same way `ReportingLineSerializer` already did for manager chains; assigning `head_id`/`lead_id` now auto-creates the corresponding department/team membership if the appointee wasn't already a member (previously you could appoint a non-member head with no validation either way).

### organization

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `JobTitle` | `workspace` (FK), `name`, `level` (PositiveSmallInt, default 0) | unique: workspace+name; ordering: level, name |
| `Department` | `workspace` (FK), `name`, `description`, `color`, `identifier` (max 6), `parent` (FK self, SET_NULL), `head` (FK→WorkspaceMember, SET_NULL), `created_by` (FK→User) | unique: workspace+name; index: `dept_workspace_parent_idx` (workspace+parent). `identifier` is **not** uniqueness-constrained or auto-generated. `DepartmentSerializer.validate` rejects self-reference and cycles in `parent` (ancestor walk, same pattern as `ReportingLine`). Setting `head_id` auto-creates a `DepartmentMember` row for that member if missing. |
| `DepartmentMember` | `department` (FK), `member` (FK→WorkspaceMember) | unique: department+member; index: `deptmember_member_idx` (member). No stored `is_head` — the serializer exposes a **computed** `is_head` derived from `Department.head` (single source of truth). Deleting the membership that holds headship clears `Department.head` back to null. |
| `Team` | `workspace` (FK), `department` (FK, SET_NULL), `name`, `description`, `identifier` (max 6), `color`, `lead` (FK→WorkspaceMember, SET_NULL), `created_by` (FK→User) | unique: workspace+name; index: `team_workspace_dept_idx` (workspace+department). Setting `lead_id` auto-creates a `TeamMember` row for that member if missing. |
| `TeamMember` | `team` (FK), `member` (FK→WorkspaceMember) | unique: team+member; index: `teammember_member_idx` (member). No stored `is_lead` — the serializer exposes a **computed** `is_lead` derived from `Team.lead` (single source of truth). Deleting the membership that holds leadership clears `Team.lead` back to null. |
| `OrgProfile` | `member` (O2O→WorkspaceMember), `job_title` (FK, SET_NULL), `employment_type` (full_time/part_time/contractor/intern), `employee_id`, `start_date`, `location`, `bio` | One per member; auto-created via `get_or_create` on first GET/PATCH. `HRDashboardView` reads `start_date` (joiners/anniversaries) and `employment_type` (headcount split). |
| `ReportingLine` | `workspace` (FK), `manager` (FK→WorkspaceMember), `report` (FK→WorkspaceMember) | unique: workspace+report (one manager per person); index: `repline_workspace_manager_idx` (workspace+manager). `ReportingLineSerializer.validate` rejects self-reference, non-members, and cycles (walks manager's ancestor chain). |

### hr

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `LeavePolicy` | `workspace` (FK), `name`, `leave_type` (annual/sick/unpaid/paternity/maternity/compassionate), `days_per_year`, `carry_over_days`, `accrual_type` (upfront/monthly) | Workspace-level policy config; multiple policies per type allowed |
| `LeaveBalance` | `employee` (FK→WorkspaceMember), `policy` (FK), `year`, `total_days`, `used_days`, `pending_days` | unique: employee+policy+year; indexes: `lb_employee_year_idx` |
| `LeaveRequest` | `employee` (FK→WorkspaceMember), `policy` (FK), `start_date`, `end_date`, `reason`, `status` (pending/approved/rejected/cancelled), `approver` (FK→User), `reviewer_comment`, `reviewed_at` | indexes: `lr_employee_status_idx`, `leave_request_policy_dates_idx` |
| `AttendancePolicy` | `workspace` (O2O), `work_start_time`, `work_end_time`, `grace_period_minutes`, `weekly_hours` | One per workspace; auto-created on first access with sensible defaults (09:00–17:00, 15 min grace, 40 h/week) |
| `Attendance` | `employee` (FK→WorkspaceMember), `date`, `clock_in` (TimeField, nullable), `clock_out` (TimeField, nullable), `source` (manual/api), `notes` | unique: employee+date (one row per employee per day) — this unique index also serves employee + date-range lookups, so no separate index. `clock_out=null` means still clocked in. |
| `EmployeeDocument` | `employee` (FK→WorkspaceMember), `doc_type` (contract/id/certificate/other), `file`, `original_name`, `expiry_date` (nullable), `uploaded_by` (FK→User) | files in `employee_docs/`; admin-only access; index: `edoc_employee_idx`; serializer exposes `days_until_expiry` computed field |
| `EmployeeNote` | `employee` (FK→WorkspaceMember), `author` (FK→User), `content`, `is_private` (default True) | private manager notes; never served to the employee; index: `enot_employee_idx` |

### organization — URL Reference

Access via `workspaces/access.py`: reads require `org.view` (+ onboarding), structural mutations require `org.manage`, profile approval requires `org.approve_profiles`. All enforced with `access.authorize(...)`. See the "organization — Permission model" section above and `ACCESS.md`.

Departments, teams, and reporting lines are paginated (`core.pagination.OrgListPagination`: page-based, `size` query param, default 50/max 100). The frontend hooks (`useDepartments`, `useTeams`) follow `next` until exhausted so dropdowns/grids still see the full set — see `frontend/src/apps/org-structure/hooks/useOrg.js::fetchAllPages`. The reporting-lines list isn't consumed by the frontend (kept for API completeness) so it wasn't given the same client-side unrolling.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/{ws}/org/departments/` | List departments, paginated (select_related head/parent, prefetch memberships for `member_count`) |
| POST | `/api/workspaces/{ws}/org/departments/` | Create department (admin) |
| GET | `/api/workspaces/{ws}/org/departments/{dept_id}/` | Department detail |
| PATCH | `/api/workspaces/{ws}/org/departments/{dept_id}/` | Update department (admin) |
| DELETE | `/api/workspaces/{ws}/org/departments/{dept_id}/` | Delete department (admin) |
| GET | `/api/workspaces/{ws}/org/departments/{dept_id}/members/` | List department members |
| POST | `/api/workspaces/{ws}/org/departments/{dept_id}/members/` | Add member to department (admin); body `{ member_id }`. Headship is set via `Department.head_id`, not here — `is_head` is read-only/computed. |
| DELETE | `/api/workspaces/{ws}/org/departments/{dept_id}/members/{membership_id}/` | Remove department member (admin) |
| GET | `/api/workspaces/{ws}/org/departments/{dept_id}/chart/` | Department's members as org-chart nodes — backs the lazy "By Department" chart view (see below). |
| GET | `/api/workspaces/{ws}/org/teams/` | List teams, paginated (select_related lead/department, prefetch memberships) |
| POST | `/api/workspaces/{ws}/org/teams/` | Create team (admin) |
| GET/PATCH/DELETE | `/api/workspaces/{ws}/org/teams/{team_id}/` | Team detail / update / delete (admin for mutations) |
| GET | `/api/workspaces/{ws}/org/teams/{team_id}/members/` | List team members |
| POST | `/api/workspaces/{ws}/org/teams/{team_id}/members/` | Add member to team (admin); body `{ member_id }`. Lead is set via `Team.lead_id`, not here — `is_lead` is read-only/computed. |
| DELETE | `/api/workspaces/{ws}/org/teams/{team_id}/members/{membership_id}/` | Remove team member (admin) |
| GET | `/api/workspaces/{ws}/org/job-titles/` | List job titles (ordered by level, name) — not paginated (small, bounded list) |
| POST | `/api/workspaces/{ws}/org/job-titles/` | Create job title (admin) |
| PATCH | `/api/workspaces/{ws}/org/job-titles/{title_id}/` | Update job title (admin) |
| DELETE | `/api/workspaces/{ws}/org/job-titles/{title_id}/` | Delete job title (admin) |
| GET | `/api/workspaces/{ws}/org/members/{member_id}/profile/` | Get member's org profile (auto-creates). Exposes `departments`, `teams`, `manager`, `direct_reports_count` (computed). |
| PATCH | `/api/workspaces/{ws}/org/members/{member_id}/profile/` | Update org profile — **admin or self** (`_require_admin_or_self`) |
| GET | `/api/workspaces/{ws}/org/reporting-lines/` | List reporting lines (manager → report), paginated. Not called by the frontend. |
| POST | `/api/workspaces/{ws}/org/reporting-lines/` | Create reporting line (admin); body `{ manager_id, report_id }` |
| DELETE | `/api/workspaces/{ws}/org/reporting-lines/{line_id}/` | Delete reporting line (admin) |
| GET | `/api/workspaces/{ws}/org/chart/` | **Lazy org chart, root level**: members with no manager only (each node carries `has_reports`/`direct_reports_count`). Was previously every member in one response — rewritten so a 1,000+ person workspace doesn't pay for the whole tree on first paint. |
| GET | `/api/workspaces/{ws}/org/chart/{member_id}/reports/` | Direct reports (one level) of a member — the expand-on-click step for the hierarchy chart. |
| GET | `/api/workspaces/{ws}/org/chart/unassigned/` | Members with no department — the "By Department" view's overflow bucket, fetched on click. |
| GET | `/api/workspaces/{ws}/org/me/profile/` | Current user's own org profile (auto-creates). |
| PATCH | `/api/workspaces/{ws}/org/me/profile/` | Update own org profile fields (draft or submitted). |
| POST | `/api/workspaces/{ws}/org/me/profile/` | Submit profile — draft → submitted; fires `notify_hr_profile_submitted` Celery task. |
| GET | `/api/workspaces/{ws}/org/profiles/pending/` | Admin-only list of submitted profiles awaiting review. |
| POST | `/api/workspaces/{ws}/org/profiles/{profile_id}/approve/` | Approve a single submitted profile; fires `notify_member_profile_approved`. |
| POST | `/api/workspaces/{ws}/org/profiles/bulk-approve/` | Approve multiple profiles in one request. Body: `{ profile_ids: [uuid, …] }` (max 100). Returns `{ approved: N }`. Fires approval email per member. |

### organization — Component Guide

> What each piece is *for* (merged from the old `ORGANIZATION.md`). Access rules
> are in the "organization — Permission model" section above and in `ACCESS.md`.

**Models** — `JobTitle` (a named rank/level; fills the job-title dropdown and the
label under a name on the chart). `Department` (top-level unit with a `head`,
optional `parent` for sub-departments, color/identifier for UI chips) → frontend
[DepartmentsPage.jsx](../frontend/src/apps/org-structure/pages/DepartmentsPage.jsx).
`DepartmentMember` (join row; `is_head` is **computed** from `Department.head`, not
stored, so promoting a head never rewrites membership rows). `Team` (smaller group,
optionally under a `Department`, with its own `lead`) →
[TeamsPage.jsx](../frontend/src/apps/org-structure/pages/TeamsPage.jsx). `TeamMember`
(mirrors `DepartmentMember`; `is_lead` derived from `Team.lead`). `OrgProfile`
(extends a member with org fields + onboarding `status` draft→submitted→approved;
non-admins are walled off until approved) → the wall is
[OrgOnboardingGate.jsx](../frontend/src/apps/org-structure/components/OrgOnboardingGate.jsx),
the card is
[MemberProfilePage.jsx](../frontend/src/apps/org-structure/pages/MemberProfilePage.jsx).
`ReportingLine` (manager→report edge; `unique_together=[workspace, report]` = one
manager per person) drawn as the connectors in
[OrgChartPage.jsx](../frontend/src/apps/org-structure/pages/OrgChartPage.jsx).

**Serializers** — Mini serializers (`MiniMemberSerializer`, `MiniDepartmentSerializer`,
`MiniTeamSerializer`, `MiniJobTitleSerializer`) are the *nested* shape so a
department's `head` or a profile's `manager` doesn't drag in unneeded fields.
`DepartmentSerializer`/`TeamSerializer` are the writable full shapes: computed
`member_count` + write-only `*_id` fields (`head_id`, `parent_id`, `lead_id`,
`department_id`) so the client sends a plain UUID. Each `*_id` and `member_id` now
**validates the referenced row is in the same workspace** (rejects cross-workspace
IDs). `OrgProfileSerializer` adds computed `departments`/`teams`/`manager`/
`direct_reports_count` so one request renders a full profile card; only `job_title_id`
+ freeform fields are writable, and `job_title_id` is workspace-validated.
`ReportingLineSerializer.validate` rejects self-report, non-members, cycles, and a
**second manager** for a report (clean 400 instead of a DB IntegrityError).

**Views** (`organization/views.py`) — gating goes through `workspaces/access.py` via
the local `_read_ws` (reads: `org.view` + onboarding) and `_manage_ws` (structural
mutations: `org.manage`); profile approval uses `org.approve_profiles`. Every
mutation calls `broadcast_org_event(...)` so other clients update without polling.
- **Departments / Teams** — CRUD + membership management, backed by `useOrg.js`.
- **Job Titles** — admin-managed lookup; the **list has no onboarding wall** so a
  member can read titles to understand the chart before their profile is approved.
- **Org Profiles** — `OrgProfileView` (view/patch one member's profile),
  `MyOrgProfileView` (own profile: GET always allowed to render the wall; PATCH edit;
  POST submit), `PendingProfilesView` + `ApproveProfileView`/`BulkApproveProfilesView`
  (the review queue, gated on `org.approve_profiles`).
- **Reporting Lines** / **Org Chart** — `OrgChartView` is a read-only denormalized
  tree built in one prefetched query; `OrgChartPage.jsx` renders it directly.

> **`OrgProfileView.get` is gated by `member.view_profile` (self always allowed)**,
> **not** by `org.view` — because this endpoint is consumed workspace-wide
> (`MemberProfilePanel.jsx` directory, HR `MemberDetailPage.jsx`), not just the org app.

> **Currently unused by the frontend** (kept for API completeness / future deep-links):
> `GET …/org/departments/{id}/`, `GET …/org/teams/{id}/`, `GET …/org/reporting-lines/`.
> The pages read single rows out of their list cache instead.

**Real-time & background** — `organization/events.py` has been **removed**; org views
call `core.events.broadcast(workspace_id, event_type, data)` directly. Org event names
are registered in `core.events.EVENTS` (all map to identical public webhook names;
profile submit/approve also carry a chat surface). `organization/tasks.py`:
`notify_hr_profile_submitted` and `notify_member_profile_approved` build recipient
lists and call `core.events.push_inbox_items()`, `.delay()`-ed from views.

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
| GET | `/api/workspaces/{ws}/hr/dashboard/` | Admin: headcount stats, leave overview (current month), attendance overview (rolling week), upcoming events (next 30 days) |
| GET/POST | `/api/workspaces/{ws}/hr/members/{id}/documents/` | Admin: list or upload employee documents. Upload validates size (≤10 MB, `MAX_DOC_SIZE_BYTES`) and `content_type` against `ALLOWED_DOC_CONTENT_TYPES` (PDF, images, Word) → 400 otherwise. |
| DELETE | `/api/workspaces/{ws}/hr/members/{id}/documents/{doc_id}/` | Admin: delete document (also removes file from storage) |
| GET/POST | `/api/workspaces/{ws}/hr/members/{id}/notes/` | Admin: list or create private manager notes |
| PATCH/DELETE | `/api/workspaces/{ws}/hr/members/{id}/notes/{note_id}/` | Admin: update or delete a note |

`AttendanceSerializer` computed fields: `status` (on_time/late/absent — compared against `AttendancePolicy.work_start_time + grace_period_minutes`), `total_hours` (float, null if no clock_out).

Access via `workspaces/access.py` (helpers `_view_ws` / `_self_ws` / `_manage_ws` in `hr/views.py`): reads require `hr.view`; employee self-service (submit leave, clock in/out) requires `people` app access (`app="people"`) + write scope; management gates on `hr.manage_leave` (policies, reviews, dashboard), `hr.manage_attendance` (attendance policy/records/summary), `hr.manage_documents` (employee docs), `hr.manage_notes` (private notes). All enforced with `access.authorize(...)`. See `ACCESS.md`.

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
| `deliver_webhook` | `workspaces.tasks` | 3 (5min → 30min backoff) | POST signed webhook payload; log WebhookDelivery. Queued only by `core.events._fire_webhooks()` (via `broadcast()`) and `WebhookTestView`. |
| `send_invite_email` | `workspaces.tasks` | 2 (60s delay) | Invite email via `core.emails.send_email(app="workspaces", template="invite.html")`. Fired by `POST /api/workspaces/{ws}/invites/`. |
| `run_import` | `workspaces.tasks` | — | Parse file → create board/statuses → bulk insert tasks; progress via `core.events.broadcast("import.progress", …)` (internal-only event) |
| `send_comment_notifications` | `projects.tasks` | 3 (30s) | Collect recipients (notified users, parent comment author, validated @mentions), then one `core.events.push_inbox_items()` call (bulk INSERT + per-user WS push). Fired by `POST /comments/`. |
| `send_chat_notification` | `integrations.tasks` | 2 (30s) | Teams/Google Chat fan-out for one event. Queued ONLY through `core.events.broadcast()` when the event has a `"chat"` entry in `EVENTS`. Builds the card `resource` from the task (task events) or receives a generic resource dict (org/HR events). |
| `notify_hr_profile_submitted` | `organization.tasks` | 2 (60s delay) | `push_inbox_items()` for all admins. Fired by `POST /org/me/profile/` (submit action). |
| `notify_member_profile_approved` | `organization.tasks` | 2 (60s delay) | `push_inbox_items()` for the member. Fired by single-approve and bulk-approve views. |

**Rule:** tasks never hand-roll `group_send` / InboxItem payloads / Resend calls — they go through `core.events.*` and `core.emails.send_email`.

---

## Serializers — Shared Mini Serializers

`MiniUserSerializer` (embedded in tasks, members, comments, presence): exposes `avatar`, `avatar_type`, `avatar_icon` — all read-only. Every context that renders a user avatar receives the full avatar data without extra queries.

`UserSerializer` (GET/PATCH `/api/users/me/`): same three fields; `avatar_type` and `avatar_icon` are writable; `avatar` is read-only.

**Status serializers** (`projects/serializers.py`):
- `TaskStatusSerializer` — full status: `id, name, color, order, is_done, is_started`. Used **only** by the board `/statuses/` endpoint, where column ordering + done detection need the flags.
- `MiniTaskStatusSerializer` — display-only `id, name, color`. Used for status **embedded in task payloads** (`status_detail` on `TaskSerializer` / `MinimalTaskSerializer`, and `status` on the analytics `TaskDrilldownSerializer`). The frontend never reads `order`/`is_done`/`is_started` off an embedded status (it reads those from the statuses list), so the mini form trims every task row. Don't swap it back unless an embed site starts needing the flags.

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
Mutation in any app's view/task
  → core.events.broadcast(ws_id, event, data, task_id=?, actor_id=?, chat=?)
      → WebSocket group "workspace_{id}"                          (always)
      → workspaces.tasks.deliver_webhook.delay()                  (if EVENTS[event]["webhook"])
      → integrations.tasks.send_chat_notification.delay()        (if EVENTS[event]["chat"] + actor)
          → services.fanout_notification() → Teams / Google Chat cards
  → core.events.notify(recipient, actor, verb, ws, task?)         (inbox bell, per recipient)
      → push_inbox_items() → InboxItem bulk INSERT + WS group "user_{id}"

Comment posted (POST /comments/)
  → view returns 201 immediately (non-blocking)
  → send_comment_notifications.delay(comment_id, workspace_id, sender_id, notified_ids, mentioned_user_ids)
      → validates mentioned_user_ids against workspace membership
      → core.events.push_inbox_items([...])   ← one INSERT + per-recipient WS push

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

**All access logic lives in one module: `workspaces/access.py`** (full reference: `ACCESS.md`). The old `workspaces/permissions.py` and `workspaces/rbac.py` have been **removed** — every app now calls `access.authorize(...)` (or the `access.*` helpers) at the top of each view. An API-key request also carries a scope ceiling (`read ⊆ write ⊆ admin`) and is rate-limited (`workspaces/throttling.py`).

**API-key scope is enforced globally, not per-app.** `access.APIKeyScopePermission` is wired into `REST_FRAMEWORK.DEFAULT_PERMISSION_CLASSES` (`core/settings.py`) and every view across every app declares `permission_classes = [permissions.IsAuthenticated, APIKeyScopePermission]` — GET/HEAD/OPTIONS require `scope:read`, POST/PUT/PATCH/DELETE require `scope:write`; a no-op for JWT users. `hr`/`org`/`analytics`/`integrations` additionally call `authorize(..., scope="admin")` on specific admin-tier actions. Because DRF's `permission_classes` on a view **replaces** the default list rather than extending it, this must be listed explicitly on every view — there is no way to rely on the settings default alone.
- Admin-level actions gate on `settings.manage` (owner always passes).
- Project-admin actions gate on `project.admin` / board `board.admin`.
- App access for hr/org/projects/analytics is enforced via `authorize(request, ws, app="…")`.
- Org mutations require `org.manage` (structure) or `org.approve_profiles`; org reads require `org.view` + onboarding.
- HR management gates on `hr.manage_leave` / `hr.manage_attendance` / `hr.manage_documents` / `hr.manage_notes`; HR reads on `hr.view`; employee self-service on `people` app access.

### Board-level (unchanged from v2.1)

**`user_can_be_board_participant(user, board)`** (`projects/permissions.py`) — returns `True` if user can be assigned to tasks or mentioned in comments on a private board. Checks: workspace owner → workspace `board.admin` permission → explicit `BoardMember` row. Used by `TaskSerializer.validate()` (assignee check) and `TaskCommentListCreateView.post()` (mention check). Does not check workspace membership — callers that already have a board object can assume the user is a workspace member.

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
```

`log_audit()` / `bulk_log_audit()` moved to `workspaces/audit.py` (they write `AuditEvent`, which is workspace-wide infra, not project-specific — see the `workspaces` model table). Every app imports from there now; `projects/permissions.py` no longer defines them.

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
| `_read_ws(request, workspace_id, *, onboarded=True)` | `access.authorize(perm="org.view", scope="read")` + onboarding wall (skip with `onboarded=False` for the job-title list) |
| `_manage_ws(request, workspace_id)` | `access.authorize(perm="org.manage", scope="write")` — structural mutations |
| `_require_onboarded(workspace, user)` | Business rule: non-admins with a draft/missing profile are blocked (delegates admin check to `access.is_workspace_admin`) |
| `_require_profile_view_access(workspace, user, member)` | Self, or `member.view_profile` — for viewing another member's profile |
| Profile approval views | `access.authorize(perm="org.approve_profiles", …)` directly |

**Serializer conventions:**
- `DepartmentSerializer` and `TeamSerializer`: `get_member_count` uses `len(obj.memberships.all())` — reads from the prefetch cache set by `prefetch_related("memberships")` in list views.
- `OrgProfileSerializer`: uses `MiniJobTitleSerializer` (fields: `id`, `name`, `level`) — omits `created_at` which is irrelevant in this context.
- `_chart_member_base_qs(workspace)` / `_serialize_chart_node(m)`: shared by `OrgChartView`, `OrgChartReportsView`, `DepartmentChartMembersView`, and `UnassignedChartMembersView` so all four chart endpoints stay in lockstep on node shape and query cost. Prefetches `reports_to` only (not `reports_to__manager__user`) — `manager_id` is a stored FK column, no join needed. Annotates `reports_count = Count("direct_reports", distinct=True)` — `distinct=True` matters because each view also filters on a different join (`reports_to__isnull`, `reports_to__manager_id`, or `department_memberships__department`), and an un-distinct'd `Count` would double-count under the resulting multi-join.

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
| `log_activity(task, actor, verb, meta)` | Write TaskActivity row |

> `broadcast` / `broadcast_to_user` / `notify` moved to **`core/events.py`**; the board
> guards `_require_board_perm` / `_require_board_admin` / `_is_workspace_admin` moved to
> **`projects/permissions.py`**. helpers.py is query/lookup helpers only.

---

## Eventing & Notifications — `core/events.py` (single source of truth)

Every real-time / fan-out primitive lives in this ONE module. Two registries drive everything:

**`EVENTS`** — one entry per internal event, declaring the external surfaces it reaches. `broadcast()` reads it; call sites never wire webhooks/chat themselves.
- `"webhook"` — public webhook event name (several internal events collapse into one public name, e.g. `task.moved` → `task.updated`). Must stay a subset of `workspaces/constants.py::WEBHOOK_EVENTS`.
- `"chat"` — NOTIFICATION_VERBS key for Teams/Google Chat cards.
- An event absent from `EVENTS` is WebSocket-only (`import.progress`, `presence.updated`, `reaction.updated`, `approval.updated`, …).

**`NOTIFICATION_VERBS`** — one entry per notification verb: its InboxItem `event_type` and human label. `InboxItem.verb`/`event_type` model choices were **removed** — this registry is the contract (used by inbox rows, WS payloads, and chat card labels).

| Function | Purpose |
|----------|---------|
| `broadcast(workspace_id, event, data, *, task_id=, actor_id=, chat=)` | **THE one fan-out call after a mutation**: WS group push, plus webhooks and chat per the `EVENTS` entry. Pass `task_id`+`actor_id` for task events (chat card built from the task; board-mapped channels included) or `chat={"title", "subtitle"?, "facts"?, "url"?}`+`actor_id` for anything else (org/HR — workspace-wide channels only). |
| `broadcast_to_user(user_id, event, data)` | Push to a single user's WS group |
| `notify(recipient, actor, verb, workspace, task=None)` | One InboxItem + WS bell push; no-op if actor==recipient; `task=None` supported (HR/org) |
| `push_inbox_items(rows)` | Bulk InboxItem INSERT + per-recipient WS push; `event_type` derived from verb — never passed |
| `verb_event_type(verb)` / `verb_label(verb)` | Registry lookups |

All functions are fire-and-forget: failures are logged, never raised.

**How to add a new event:** add one `EVENTS` entry (+ the public name in `WEBHOOK_EVENTS` if new), then call `broadcast()` at the mutation site. **New notification verb:** one `NOTIFICATION_VERBS` entry.

**Chat integrations** (`integrations/`): `broadcast()` queues `integrations.tasks.send_chat_notification` (Celery), which builds a generic `resource` dict and calls `services.fanout_notification()` — generic card formatters, no event constants in the integrations app. Wired events: `task.created`, `task.assigned`, `comment.created`, `approval.created` (task-scoped), `org.profile.submitted`, `org.profile.approved`, `leave.requested/approved/rejected` (workspace-scoped). `IntegrationChannelMapping.enabled_events` filters on the chat verb strings.

---

## Email — `core/emails.py` (single dispatch helper)

`send_email(to, subject, *, app=, template=, context=, html=)` — renders `<app>/emails/<template>` (`{{key}}` substitution) and sends via Resend. Raises on failure so Celery callers can retry. No app imports `resend` directly. Templates stay per-app in `<app>/emails/*.html` (accounts: password reset + verification, workspaces: invite, organization: profile submitted/approved — currently unused). The per-app `render()` loaders were **removed**.

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
 "member.added", "member.removed",
 "org.profile.submitted", "org.profile.approved", "org.profile.updated",
 "org.department.created", "org.department.updated", "org.department.deleted",
 "org.department_member.added", "org.department_member.removed",
 "org.team.created", "org.team.updated", "org.team.deleted",
 "org.team_member.added", "org.team_member.removed",
 "org.job_title.created", "org.job_title.updated", "org.job_title.deleted",
 "org.reporting_line.created", "org.reporting_line.deleted"]
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
| `AttendanceSummary` / `HRDashboard` iterate records in Python — fine at SMB headcount, would need DB aggregation at scale | `hr/views.py` | Revisit if workspaces exceed a few thousand members |
| Org chart "By Department" view has no bulk "expand all departments" — each card is fetched individually on click | `organization/views.py`, `OrgChartPage.jsx` | Acceptable trade-off for the lazy rewrite; revisit if it's a common workflow |

> **Resolved (this pass):** ReportingLine cycle/self-ref/non-member validation; leave-balance `select_for_update` race; bounded date windows on attendance + leave-request lists (replaces unbounded lists); `EmployeeDocument` upload size/content-type validation; dropped redundant `attendance_employee_date_idx`; extracted `_business_days` + reused `MiniMemberSerializer`; `is_head`/`is_lead` now computed from FK (single source of truth); `date.today()` → `timezone.localdate()`. **Several require migrations — see below.**

> **Resolved (later pass):** dangling `Department.head`/`Team.lead` on membership delete; `Department.parent` cycle/self-ref validation; `head_id`/`lead_id` auto-membership; missing org events in `WEBHOOK_EVENTS`; `AuditEvent`/`log_audit`/`bulk_log_audit` moved from `projects` to `workspaces` (cross-app infra, was living in the wrong app); org mutations now audit-logged; departments/teams/reporting-lines list endpoints paginated; `OrgChartView` rewritten from "return every member" to a lazy root+expand-per-node tree (`OrgChartReportsView`, `DepartmentChartMembersView`, `UnassignedChartMembersView`) — the "iterates all members in Python" entry above no longer applies to the org chart specifically. **Requires migrations — see below.**

### ⚠️ Pending migrations (run before deploy)

The model edits above changed schema. Generate and apply:

```
python manage.py makemigrations hr organization workspaces projects
python manage.py migrate
```

Expected: `hr` initial migration (no migrations existed yet) reflecting the dropped `attendance_employee_date_idx`; `organization` migration dropping `DepartmentMember.is_head`, `TeamMember.is_lead`, and the stale `deptmember_dept_head_idx` / `teammember_team_lead_idx` indexes (plus the previously-uncommitted `OrgProfile.employment_type` from vB.2); `workspaces` migration renaming `InboxItem.project_name` → `board_name` (**answer "y" to Django's rename prompt** so it emits `RenameField`, not drop+add) and altering `verb`/`event_type` (choices removed).

**`AuditEvent` app move (`projects` → `workspaces`) — handle by hand, don't blindly accept Django's default:** run `makemigrations`, and when prompted whether `workspaces.AuditEvent` is a move of `projects.AuditEvent` (Django detects same field set), confirm it *if* your Django version offers a state-only move; otherwise it will propose `DeleteModel` in `projects` + `CreateModel` in `workspaces`, which **drops the audit table's data**. If you need to preserve existing `AuditEvent` rows, write the migration by hand: `SeparateDatabaseAndState` with `state_operations=[migrations.DeleteModel("AuditEvent")]` in `projects` and `state_operations=[migrations.CreateModel(...)]` in `workspaces`, both with empty `database_operations` — this repoints Django's model state without touching the actual table (keep the same `db_table`, e.g. via `Meta.db_table = "projects_auditevent"` on the new model, or a `db_table` rename op). If this is a dev database with no audit history worth keeping, the default drop+recreate is fine.

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
