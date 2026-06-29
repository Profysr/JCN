# JCN Test Cases — Project Management, Accounts, Analytics, Workspaces

> Scope: **Accounts/Auth, Workspaces (members, invites, RBAC, modules, onboarding, inbox, API keys, webhooks, import), Project Management (boards → OKRs), Analytics, and the shared `<Select>`.** Org Structure and HR are **excluded**.
>
> Each case is scenario-based and grounded in current behavior (see `backend/BACKEND.md` and `frontend/FRONTEND.md`). Type tags: **[API]** backend endpoint, **[UI]** frontend behavior, **[E2E]** full flow. Use as manual QA scripts or as the basis for automated tests.
>
> Common preconditions unless stated: an authenticated user who is a member of workspace `W`; for board cases, board `B` exists in `W` with at least one status.

---

## 1. Accounts & Authentication

### Registration & email verification

| ID | Type | Scenario | Steps / Preconditions | Expected result |
|----|------|----------|------------------------|-----------------|
| AUTH-01 | API | Register new user (verification off) | `ACCOUNT_EMAIL_VERIFICATION=none`; POST `/api/auth/registration/` with email, full_name, password | 201 with JWT `access` + `refresh` + user; `can_create_workspace=true` |
| AUTH-02 | API | Register new user (verification mandatory) | `ACCOUNT_EMAIL_VERIFICATION=mandatory`; POST registration | 201 `{"detail":"Verification e-mail sent."}` with **no tokens**; verification email sent via Resend |
| AUTH-03 | API | Duplicate email registration | Register with an email already in use | 400 validation error; no second user created |
| AUTH-04 | API | Weak/invalid password | Register with too-short password | 400 with password validation message |
| AUTH-05 | API | Verify email with valid key | POST `/api/auth/registration/verify-email/` `{key}` from email link | 200 `{"detail":"ok"}`; account becomes verified |
| AUTH-06 | API | Verify email with bad key | POST verify-email with garbage key | 4xx error; account stays unverified |
| AUTH-07 | API | Resend verification email | POST `/api/auth/registration/resend-email/` `{email}` | 200; new verification email sent |
| AUTH-08 | UI | Register → check-inbox redirect | Submit RegisterPage when verification mandatory (no tokens in response) | Redirects to `/verify-email?email=…` (VerifyEmailSentPage) with resend button |
| AUTH-09 | UI | Email-verify confirm page | Open `/verify-email/:key` | Auto-POSTs key on mount; shows verifying spinner → success/error state |

### Login / logout / token

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| AUTH-10 | API | Login success | POST `/api/auth/login/` valid creds | 200 with access + refresh |
| AUTH-11 | API | Login wrong password | POST login with bad password | 400/401; no tokens |
| AUTH-12 | API | Login unverified (mandatory mode) | Login before verifying email | Rejected with verification-required error |
| AUTH-13 | API | Token refresh | POST `/api/auth/token/refresh/` with valid refresh | 200 new access token |
| AUTH-14 | API | Token refresh with expired/invalid | POST refresh with bad token | 401 |
| AUTH-15 | UI | 401 auto-refresh + retry | Access token expired; trigger any authed request | `api.js` interceptor refreshes via `/token/refresh/`, retries original request once, transparently |
| AUTH-16 | UI | Refresh failure → logout | Refresh token also invalid | localStorage cleared; redirect to `/login` |
| AUTH-17 | UI | Logout clears cache | Click logout | `queryClient.clear()` wipes RQ cache; tokens removed; redirect to login |

### Password reset

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| AUTH-18 | API | Request reset (existing email) | POST `/api/auth/password/reset/` `{email}` | 200; Resend email with link to `{FRONTEND_URL}/reset-password/{uid}/{token}` |
| AUTH-19 | API | Request reset (unknown email) | POST reset with non-existent email | **200 anyway** (no user enumeration); no email sent |
| AUTH-20 | API | Confirm reset valid | POST `/api/auth/password/reset/confirm/` `{uid, token, new_password1, new_password2}` | 200; password changed; old password no longer works |
| AUTH-21 | API | Confirm reset mismatched passwords | new_password1 ≠ new_password2 | 400 |
| AUTH-22 | UI | Forgot-password inline confirmation | Submit ForgotPasswordPage | Shows "check your inbox" regardless of email existence |

### Google OAuth

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| AUTH-23 | API | Google login new user | POST `/api/auth/google/` `{access_token}` | Same JWT pair + user; treated as email-verified; `avatar` set to Google picture, `avatar_type="google"` |
| AUTH-24 | API | Google login merges existing email | Google email matches an existing email account | Silently merged (auto-connect); does not overwrite a custom avatar |
| AUTH-25 | E2E | Google OAuth + pending invite | Click "Create account to join" → sign up via Google | Token survives redirect via localStorage; invite auto-accepted; lands in workspace |

### Profile & account (`/api/users/me/`)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| AUTH-26 | API | Get current user | GET `/api/users/me/` | Returns user + profile (theme, accent_color, density_mode) |
| AUTH-27 | API | Update profile fields | PATCH me with full_name/theme/accent_color/density_mode | 200; fields updated |
| AUTH-28 | API | Set emoji avatar | PATCH `{avatar_type:"icon", avatar_icon:"🦊"}` | 200; avatar renders as emoji |
| AUTH-29 | API | `avatar` is read-only | PATCH `{avatar:"http://evil"}` | Field ignored (read-only; only Google adapter sets it) |
| AUTH-30 | UI | Avatar picker auto-saves | UserSettingsModal → pick Initials/Google/Icon | PATCHes on selection; live preview via optimistic store update; no separate Save |
| AUTH-31 | UI | Google avatar option hidden | User who never used Google OAuth opens avatar picker | "Google Profile" option not shown (only if `user.avatar` set) |
| AUTH-32 | API | Change password | POST `/api/auth/password/change/` | 200; new password works |

---

## 2. Workspaces

### Workspace CRUD & one-workspace rule

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| WS-01 | API | Create workspace | POST `/api/workspaces/` `{name}` (or multipart with logo) | 201; caller auto-added as ADMIN member; `can_create_workspace` flips to **false** |
| WS-02 | API | Second workspace blocked | POST `/api/workspaces/` again as same user | Permission error from serializer (one workspace per account) |
| WS-03 | API | List workspaces | GET `/api/workspaces/` | Only workspaces the user belongs to; `member_count` + `my_role` from prefetch (no N+1) |
| WS-04 | API | Workspace detail | GET `/api/workspaces/{ws}/` | 200 detail |
| WS-05 | API | Non-member cannot read | GET `/api/workspaces/{ws}/` as non-member | 403/404 |
| WS-06 | API | Update name/logo | PATCH `/api/workspaces/{ws}/` | 200 updated |
| WS-07 | API | Delete workspace (owner) | DELETE `/api/workspaces/{ws}/` as owner | 204 |
| WS-08 | API | Delete workspace (non-owner) | DELETE as non-owner member | 403 |
| WS-09 | UI | Workspace list cache | Load app | `["workspaces"]` `staleTime: Infinity`, no focus refetch; only updates on mutation |

### Members & roles

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| MEM-01 | API | List members | GET `/api/workspaces/{ws}/members/` | All members with roles |
| MEM-02 | API | Change member role (admin) | PATCH `/api/workspaces/{ws}/members/{id}/` as admin | **405 Method Not Allowed** — PATCH is disabled; use `POST /members/{id}/assign-role/` `{role:<uuid>}` instead |
| MEM-03 | API | Change role (non-admin) | PATCH `/api/workspaces/{ws}/members/{id}/` as non-admin | **405 Method Not Allowed** — method disabled entirely |
| MEM-04 | API | Remove member | DELETE `/api/workspaces/{ws}/members/{id}/` as admin | 204; member loses access |
| MEM-05 | UI | Members list stale | Load MembersPage | `["workspace-members", ws]` `staleTime: Infinity`; mutations invalidate it |
| MEM-06 | UI | Cannot remove self / owner badge | Open MembersPage as admin | Remove control hidden for self and workspace owner |

### Invites

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| INV-01 | API | Create invite (admin) | POST `/api/workspaces/{ws}/invites/` `{email, role}` as admin | 201; invite row created; `send_invite_email.delay()` currently commented out — no email sent but token returned |
| INV-01b | API | Create invite (non-admin) | POST invites as non-admin member | **403** — admin only |
| INV-02 | API | Duplicate invite | Invite same email twice | 400; blocked by unique(workspace+email) |
| INV-03 | API | List pending invites (admin) | GET `/api/workspaces/{ws}/invites/pending/` as admin | Pending invites only |
| INV-03b | API | List pending invites (non-admin) | GET invites/pending/ as non-admin member | **403** — admin only |
| INV-04 | API | Cancel invite | DELETE `/api/workspaces/{ws}/invites/{token}/` | Removed; disappears from pending list |
| INV-05 | API | Public invite detail | GET `/api/invites/{token}/` (unauth) | Workspace name + inviter info (AllowAny) |
| INV-06 | API | Accept invite | POST `/api/invites/{token}/accept/` | Joins workspace; auto-assigns matching system CustomRole |
| INV-07 | E2E | Invited user — logged in, correct email | Open `/invites/:token` while logged in as invited email | Auto-accepts; redirect to `/w/:ws` after ~1.8s |
| INV-08 | E2E | Invited user — wrong email | Logged in as different email | "Wrong account" screen; no action |
| INV-09 | E2E | Invited user — not logged in | Open invite link logged out | Landing with workspace/inviter/role; "Create account" and "I already have an account" CTAs |
| INV-10 | E2E | Invited user skips onboarding | Accept invite | Lands directly in workspace; no OnboardingPage/SetupWizard; getting-started checklist hidden (admin-only) |

### Custom RBAC (roles & permissions)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| RBAC-01 | API | Permission schema — admin | GET `/api/workspaces/{ws}/permissions/` as admin/owner | Full `{apps: APP_REGISTRY, permissions: PERMISSIONS}` returned; cache `staleTime: Infinity` |
| RBAC-01b | API | Permission schema — non-admin | GET permissions as member with `projects` access only | `apps` and `permissions` filtered to `projects` + `workspace` group only; HR/Org/Analytics omitted |
| RBAC-02 | API | List roles — admin | GET `/api/workspaces/{ws}/roles/` as admin/owner | All roles (system + custom) with `member_count`, `app_access`, nested `permissions` |
| RBAC-02b | API | List roles — non-admin | GET roles as Viewer/Member | **One-element array** containing only that user's own role; no other roles exposed |
| RBAC-03 | API | Create custom role (admin) | POST roles `{name, app_access, permissions}` | 201; `is_system=false` |
| RBAC-04 | API | Update system role rejected | PATCH a system role (Admin/Member/Viewer) | 400 |
| RBAC-05 | API | Delete system role rejected | DELETE a system role | 400 |
| RBAC-06 | API | Delete role with assignments | DELETE a custom role that has members | 400 (active assignments) |
| RBAC-07 | API | Assign role to member | POST `/members/{id}/assign-role/` `{role:<uuid>}` as admin | 201 on first assignment, 200 on reassignment; member's effective permissions change immediately |
| RBAC-07b | API | Get role UUIDs before assigning | GET `/api/workspaces/{ws}/roles/` | Returns all roles with `id`, `name`, `app_access`, `permissions`, `member_count`; use `id` in assign-role body |
| RBAC-08 | API | Assign role from another workspace | assign-role with role uuid not in this workspace | Rejected |
| RBAC-09 | API | Bulk assign role | POST `/members/bulk-assign-role/` `{role, member_ids:[]}` | All assigned; **max 200** members enforced |
| RBAC-10 | API | app_access gate | User whose role has `app_access.projects=false` hits a board endpoint | 403 (`require_app_access`) |
| RBAC-15 | API | Update app_access on custom role | PATCH `/api/workspaces/{ws}/roles/{id}/` `{app_access:{projects:true, hr:false}}` as admin | 200; all members assigned this role immediately lose/gain access accordingly |
| RBAC-16 | API | Update app_access on system role | PATCH a system role (Admin/Member/Viewer) `{app_access:…}` | 400 — system roles cannot be modified |
| RBAC-11 | API | Owner bypass | Workspace owner performs any gated action | Always allowed |
| RBAC-12 | UI | Role builder | Settings → Roles & Permissions | Per-permission toggles grouped by category; dependency rules auto-enable required perms (e.g. enabling a dependent perm enables its prerequisite) |
| RBAC-13 | UI | Nav gating | User without a nav item's `permission` | Sidebar hides that item; owner always sees all; items without `permission` always visible |
| RBAC-14 | UI | System role lock icon | MembersPage role dropdown | System roles shown with 🔒 suffix |

### Onboarding

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| ONB-01 | API | Get onboarding state | GET `/api/workspaces/{ws}/onboarding/` (admin) | `{wizard_completed, team_type, user_is_admin, checklists:{projects,…}}` |
| ONB-02 | API | Complete wizard | PATCH onboarding `{wizard_completed:true, team_type}` | Persisted |
| ONB-03 | API | Dismiss a module checklist | PATCH `{module_dismiss:"projects"}` | That module's checklist dismissed **for the current user only** |
| ONB-04 | E2E | Admin first-run flow | New admin with no workspace | `/` → empty list → `/onboarding` → create workspace → `/w/:id/setup` SetupWizard (team type → invite → ready+confetti) → app |
| ONB-05 | UI | Projects getting-started checklist | Admin on DashboardsPage | Items: create board, add task, invite teammate; progress bar; collapse; per-user permanent dismiss |
| ONB-06 | UI | Checklist hidden for non-admins | Member views landing | No getting-started checklist (`user_is_admin=false`) |

### Inbox / notifications

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| INBOX-01 | API | List inbox | GET `/api/inbox/` (filter by status UNREAD/READ/ARCHIVED/SNOOZED) | Filtered items |
| INBOX-02 | API | Unread count | GET `/api/inbox/unread-count/` | Fast count (optionally workspace-scoped) |
| INBOX-03 | API | Mark read/archive/snooze | PATCH `/api/inbox/{id}/` | Status updated |
| INBOX-04 | API | Bulk update | POST `/api/inbox/bulk/` | Multiple items updated |
| INBOX-05 | UI | Badge increments via socket | Receive `notification.created` WS event | Unread count `setQueryData` **+1 in place** (no GET); list invalidated |
| INBOX-06 | UI | Badge poll-free | Idle on any page | `inbox-unread-count` `staleTime: Infinity`, no focus/reconnect refetch; only moves via created/read/bulk events |

### API keys

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| APIKEY-01 | API | Create key | POST `/api/workspaces/{ws}/api-keys/` | 201; **raw key returned once only** |
| APIKEY-02 | API | List keys | GET api-keys | No raw key exposed; prefix only |
| APIKEY-03 | API | Revoke key | DELETE `/api/workspaces/{ws}/api-keys/{id}/` | Soft-deleted (`is_active=false`) |
| APIKEY-04 | API | Auth with API key | Request with `Authorization: Bearer jcn_<raw>` | Authenticated via APIKeyAuthentication |
| APIKEY-05 | API | Revoked key rejected | Use a revoked key | 401 |
| APIKEY-06 | UI | Expiry select | Create-key form, pick expiry (`<Select>`) | "Never"/7/30/90/365 days; `expires_at` computed accordingly |

### Webhooks

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| WH-01 | API | Create webhook | POST `/api/workspaces/{ws}/webhooks/` `{url, events, secret}` | 201 |
| WH-02 | API | Update webhook | PATCH webhook | URL/events/active updated |
| WH-03 | API | Delete webhook | DELETE webhook | 204 |
| WH-04 | API | Test delivery | POST `/webhooks/{id}/test/` | Test delivery queued via Celery |
| WH-05 | API | Deliveries log | GET `/webhooks/{id}/deliveries/` | Last 50 deliveries; HMAC-SHA256 signed |
| WH-06 | UI | Deliveries stale | View deliveries | `staleTime: 15s` |

### Import / migration

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| IMP-01 | API | List sources | GET `/api/workspaces/{ws}/import/sources/` | Jira/ClickUp/CSV/etc.; cache Infinity |
| IMP-02 | API | Upload & create job | POST `/import/jobs/` with file | Parsed; ImportJob created (PENDING) with preview rows |
| IMP-03 | API | Update field mapping | PATCH `/import/jobs/{id}/` | Mapping saved before run |
| IMP-04 | API | Run import | POST `/import/jobs/{id}/run/` | Async Celery import starts |
| IMP-05 | API | Delete pending job | DELETE `/import/jobs/{id}/` (PENDING) | Removed; non-pending cannot be deleted |
| IMP-06 | API | Rollback within 24h | DELETE `/import/jobs/{id}/rollback/` | All imported tasks removed (24h window) |
| IMP-07 | UI | Live polling | Job status `importing` | `useImportJob` polls every 2s until done |
| IMP-08 | UI | Field-mapping select | Mapping screen `<Select>` per column | Options from `JCN_FIELDS`; default "— Skip —" |

---

## 3. Project Management

### Boards

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| BRD-01 | API | List boards | GET `/api/workspaces/{ws}/boards/` | Active boards visible to user; private boards filtered by `for_user()` |
| BRD-02 | API | Create board | POST boards `{name, board_type, is_private}` | 201; `name` required |
| BRD-03 | API | Board detail with statuses | GET `/boards/{pid}/` | Board + embedded statuses + counts |
| BRD-04 | API | Private board hidden from non-member | Non-BoardMember (non-admin) GETs private board | 403/404 |
| BRD-05 | API | Workspace admin sees all boards | Admin lists boards | Includes private boards |
| BRD-06 | API | Update board | PATCH `/boards/{pid}/` | Name/type/status updated |
| BRD-07 | API | Delete board (workspace admin) | DELETE `/boards/{pid}/` as workspace admin | 204 |
| BRD-08 | API | Delete board (non-admin) | DELETE as non-admin | 403 |
| BRD-09 | UI | `useBoard` no retry | Open board user can't access | `retry:false` → immediate 403/404 → inline "Access denied" screen in KanbanPage |
| BRD-10 | UI | Board card health/progress | BoardsPage | Card shows BoardTypeIcon, completion %, health badge (on-track/at-risk/off-track), overdue count, active sprint |
| BRD-11 | UI | Create board confetti | CreateBoardModal submit | Board-type gradient preview; success confetti; auto-close ~2s |
| BRD-12 | UI | Board create gated | User without `project.create` | Create button hidden/disabled |
| BRD-13 | UI | BoardTypeIcon everywhere | Board shown in any surface | Never a letter avatar — always `<BoardTypeIcon board_type=…>` |

### Board members & permissions

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| BMEM-01 | API | List board members | GET `/boards/{pid}/members/` | Board-level members |
| BMEM-02 | API | Add member (board admin) | POST `/boards/{pid}/members/` | Added with role |
| BMEM-03 | API | Bulk add members | POST `/boards/{pid}/members/bulk/` | All added |
| BMEM-04 | API | Change/remove member (board admin) | PATCH/DELETE member | Updated/removed |
| BMEM-05 | API | Member mutation requires board admin | Non-admin adds member | 403 |
| BMEM-06 | API | Role-permissions map | GET `/boards/{pid}/role-permissions/` | Returns `BOARD_ROLE_PERMISSIONS` table verbatim |
| BMEM-07 | API | Permission resolution order | Member with workspace role granting `task.edit` but board role `viewer` | **Can edit** — workspace CustomRole checked before BoardMember override; board role can only add, not revoke |
| BMEM-08 | API | Editor cannot delete | BoardMember `editor` deletes a task | 403 (matrix: editor delete=false) |
| BMEM-09 | API | Viewer can comment, not move | BoardMember `viewer` moves a task | 403 move; comment allowed |
| BMEM-10 | API | Guest view-only | BoardMember `guest` comments | 403 (comment=false) |
| BMEM-11 | UI | BoardAccessModal | Open access modal | `useBoardMembers` fetches only while open (`enabled`); role dropdown viewer/editor/admin; remove |
| BMEM-12 | UI | Derived permissions | `useBoardPermissions` | Returns `{role, canView, canEdit, canDelete, canMove, canComment, canAdmin, isViewer, isLoaded}` |

### Task statuses (columns) — **bulk-only**

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| ST-01 | API | List statuses | GET `/boards/{pid}/statuses/` | Ordered by `order` |
| ST-02 | API | Create status | POST `/boards/{pid}/statuses/` | 201; unique(board+name) |
| ST-03 | API | Bulk rename/reorder/recolor | POST `/statuses/bulk/` with full list | Applied via `bulk_update` |
| ST-04 | API | **No per-status PATCH/DELETE route** | PATCH/DELETE `/statuses/{id}/` | 404 (routes don't exist) |
| ST-05 | API | Delete via omission — empty column | Bulk POST omitting an **empty** status | That status deleted |
| ST-06 | API | Delete guard — column has tasks | Bulk POST omitting a status that **still has tasks** | **400** `{"error":…}`; nothing deleted; tasks NOT auto-reassigned |
| ST-07 | API | Single `is_done` enforced | Bulk POST with two `is_done=true` | Only the **last** kept as done |
| ST-08 | UI | BoardSettingsModal status edit | Add/edit/delete statuses | Reflects bulk save; deleting a non-empty column surfaces the 400 error |

### Tasks — CRUD, validation, version

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| TASK-01 | API | Create task | POST `/boards/{pid}/tasks/` `{title}` | 201; `created_by=request.user`; defaults priority=medium, type=task, version=1 |
| TASK-02 | API | Create without title | POST with empty/missing title | 400 (title required) |
| TASK-03 | API | start_date > due_date rejected | PATCH/POST with start after due | 400 `{"start_date":"Start date cannot be after the due date."}` |
| TASK-04 | API | Partial PATCH date validation | Task has start_date; PATCH only due_date earlier than it | 400 (merges with stored start_date) |
| TASK-05 | API | start == due allowed | start_date = due_date | Accepted |
| TASK-06 | API | List with filters | GET tasks?status=&assignee=&priority=&sprint=&label=&type=&due=&search=&pending_approval= | Filtered list |
| TASK-07 | API | Task detail shape | GET `/tasks/{tid}/` | Core fields + `field_values`, `ancestors`, `key_result_links`; subtasks/comments/etc. NOT embedded |
| TASK-08 | API | Set label_ids | PATCH `{label_ids:[…]}` | `task.labels.set()`; nested labels returned |
| TASK-09 | API | **Version conflict 409** | PATCH `{version:<stale>, …}` | **409** `{detail, current_version, updated_at}`; on success `version` increments |
| TASK-10 | API | Delete task | DELETE `/tasks/{tid}/` with board `delete` perm | 204 |
| TASK-11 | API | Delete without perm | DELETE as user lacking `delete` | 403 |
| TASK-12 | API | Export tasks | GET `/tasks/export/?format=csv|json` | File download |
| TASK-13 | UI | Create modal validation | CreateTaskModal: start after due | Toast "Start date cannot be after the due date"; no submit |
| TASK-14 | UI | Detail panel edits route through one hook | Edit any field in TaskDetailPanel | `useUpdateTaskDetail` → merges into `["tasks"]`+`["children"]`+detail; sprint invalidated only if status/sprint changed |
| TASK-15 | UI | Conflict banner | Two tabs edit same task; save stale | Amber banner "saved X ago"; Dismiss / Reload latest |
| TASK-16 | UI | Card progress from counts | Toggle a subtask | Card subtask progress updates from patched counts — **no full board refetch** |

### Task move (drag-drop)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| MOVE-01 | API | Move within/between columns | PATCH `/tasks/{tid}/move/` `{status_id, order}` | Reordered; `task.moved` broadcast; activity logged only if status changed |
| MOVE-02 | API | Auto start_date on start column | Move task with no start_date into `is_started=true` column | `start_date` set to today |
| MOVE-03 | API | Move-to-done blocked by pending approval | Move task with pending approval into a done column | **403** `{approval_required:true}` |
| MOVE-04 | UI | Optimistic drag + rollback | Drag card across columns; server errors | Card moves immediately, then **rolls back** on error (snapshots restored) |
| MOVE-05 | UI | Sprint counts refresh on move | Drag a task in a sprint board | `["sprint", ws, proj]` invalidated; completion % updates |
| MOVE-06 | UI | Open detail syncs on move | Move a task whose detail panel is open | `setQueryData(detailKey)` keeps panel in sync |

### Bulk actions

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| BULK-01 | API | Bulk update fields | POST `/tasks/bulk/` `{task_ids, action:"update", updates:{status_id|priority|assignee_id}}` | Applied; rows already at target skipped; `tasks.bulk_updated` broadcast |
| BULK-02 | API | Bulk delete | POST `/tasks/bulk/` `{action:"delete"}` with `delete` perm | Tasks removed |
| BULK-03 | API | Bulk delete without perm | Bulk delete lacking `delete` | 403 |
| BULK-04 | UI | Bulk bar appears on selection | Select ≥1 task checkbox (Kanban/List) | BulkActionBar slides in with count |
| BULK-05 | UI | Selection survives view switch | Select in Kanban, switch to List | Selection persists |

### Task hierarchy & clone

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| HIER-01 | API | List children | GET `/tasks/{tid}/children/` | Immediate children |
| HIER-02 | API | Create child | POST `/tasks/{tid}/children/` | Child created; parent `child_count` bumps |
| HIER-03 | API | Attach existing as child | PATCH child `{parent_id}` | Removed from board columns; parent badge increments |
| HIER-04 | API | Detach child | PATCH child `{parent_id:null}` | Parent badge decrements |
| HIER-05 | API | Deep clone | POST `/tasks/{tid}/clone/` with `edit` perm | Recursively clones children + subtasks + labels; title gets " (Copy)"; **strips** assignee/dates/sprint; activity `meta.cloned_from` |
| HIER-06 | UI | Lazy child rows | ListView expand a row with `child_count>0` | `useChildTasks` fires only on expand; skeleton renders exactly `child_count` placeholder rows |
| HIER-07 | UI | Clone navigates to copy | Duplicate from detail panel | Toast "Task cloned"; navigates to `?task=<newId>` |

### Subtasks (checklist)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| SUB-01 | API | Add subtask | POST `/tasks/{tid}/subtasks/` `{title}` | Created |
| SUB-02 | API | Toggle subtask | PATCH subtask `{is_done}` | Toggled |
| SUB-03 | API | Delete subtask | DELETE subtask | Removed |
| SUB-04 | UI | Counts patched, no refetch | Add/toggle/delete subtask | `subtask_count`/`done_subtask_count` patched into detail + all `["tasks"]` variants; no list refetch |

### Comments & reactions

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| CMT-01 | API | Add top-level comment | POST `/tasks/{tid}/comments/` `{body}` | Created; activity `COMMENTED`; notifications async |
| CMT-02 | API | Reply to comment | POST comments `{body, parent_id}` (parent is top-level) | Nested reply |
| CMT-03 | API | Reply-of-reply rejected | `parent_id` points to a reply | 404/400 (one level only) |
| CMT-04 | API | Edit own comment | PATCH comment as author | 200 |
| CMT-05 | API | Edit others' comment | PATCH comment as non-author | 403 |
| CMT-06 | API | Delete own comment cascades | DELETE comment with replies | Removed with replies; reaction cache invalidated |
| CMT-07 | API | Mentions notify | POST comment `{mentioned_user_ids}` | Validated against workspace membership; each mentioned member notified once |
| CMT-08 | API | Notification dedup | Comment mentions the assignee who is also creator | Notified once; author never notified of own comment; parent author notified on reply |
| CMT-09 | UI | Mention picker | CommentEditor type `@` | Member list filter + arrow-nav + Enter to select; resolves handle→UUID |
| CMT-10 | UI | Optimistic comment append | Post comment | Appended to last page of infinite query via `setQueryData`; `comment_count` increments; no refetch |
| CMT-11 | API | Toggle reaction | POST `/comments/{id}/reactions/` `{emoji}` | `{reactions, action:"added"|"removed"}`; cached in Redis `rxn:<uuid>` |
| CMT-12 | UI | Reaction live update | Receive `reaction.updated` WS event | Reactions patched on `task-detail` cache |
| CMT-13 | UI | Comments infinite scroll preserved | Scroll older comments, then a new one arrives | Never reset to page 1 (updated in place) |

### Attachments

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| ATT-01 | API | Upload | POST `/tasks/{tid}/attachments/` (multipart) | Stored with original_name, size, mime |
| ATT-02 | API | List | GET attachments | Files listed |
| ATT-03 | API | Delete | DELETE attachment | Removed (file deleted from storage) |
| ATT-04 | UI | Upload + delete in panel | TaskAttachmentsSection | Upload zone; list with download/delete; invalidates `["attachments", …]` |

### Dependencies

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| DEP-01 | API | Add dependency | POST `/tasks/{tid}/dependencies/` | Blocking/blocked relation created; unique(blocker+blocked) |
| DEP-02 | API | Remove dependency | DELETE dependency | Removed |
| DEP-03 | UI | Add/remove links | TaskDependenciesSection | Search to add; both invalidate `["dependencies", …]` |
| DEP-04 | UI | Critical path on Gantt | Open Timeline view with dependencies | Dependency chain highlighted (amber) |

### Labels

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| LBL-01 | API | Create label | POST `/boards/{pid}/labels/` | Created; unique(board+name) |
| LBL-02 | API | Update/delete label | PATCH/DELETE label | Applied |
| LBL-03 | UI | LabelPicker create+toggle | Task properties → Labels | Create new (name+color swatch); toggle on task; `["labels"]` `staleTime: Infinity`, invalidated on mutation |

### Custom fields & saved views

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| CF-01 | API | Create field | POST `/boards/{pid}/fields/` (TEXT/NUMBER/SELECT/URL/DATE) | Created; unique(board+name) |
| CF-02 | API | Set field value | POST `/tasks/{tid}/field-values/` | Stored; unique(task+field) |
| CF-03 | UI | Upsert field value | Edit a custom field in panel | `setQueryData` on `task-detail` (find by field_id, replace or append); no invalidate |
| SV-01 | API | Save view | POST `/boards/{pid}/saved-views/` `{name, filters}` | Created; unique(board+user+name) |
| SV-02 | API | Delete view | DELETE saved-view | Removed |
| SV-03 | UI | Apply / save / delete view | FilterBar saved views | Click applies filters; save persists current filters; delete removes; `staleTime: Infinity` |

### Sprints

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| SPR-01 | API | Create sprint | POST `/boards/{pid}/sprints/` | Created (PLANNING) |
| SPR-02 | API | Sprint detail | GET `/sprints/{id}/` | Task counts, completion % |
| SPR-03 | API | Update / delete sprint | PATCH/DELETE sprint | Applied |
| SPR-04 | UI | Sprint detail invalidated by task changes | Create/move/delete a task in the sprint | `["sprint", ws, proj]` invalidated (counts refresh) |
| SPR-05 | UI | Sprint selector & states | SprintView/SprintPanel | Active-sprint dropdown; planning vs columns/swimlanes by status; backlog (no `sprint_id`) split out |
| SPR-06 | UI | Create sprint modal | CreateSprintModal | name + start/end dates + capacity → `useCreateSprint`; error toast on failure |

### Approvals (state machine)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| APR-01 | API | Request approval | POST `/tasks/{tid}/approvals/` `{reviewer_ids, due_date?, note?}` | Approval PENDING; one `ApprovalReviewer` (PENDING) per reviewer (idempotent); reviewers notified `APPROVAL_REQUESTED` |
| APR-02 | API | Request without reviewers | POST with empty `reviewer_ids` | 400 (≥1 required) |
| APR-03 | API | Reviewer approves | POST `/approvals/{id}/review/` `{status:"approved"}` | Reviewer updated; parent recomputed |
| APR-04 | API | One reject → REJECTED | Any reviewer `rejected` | Approval status REJECTED |
| APR-05 | API | One changes_requested (no reject) → CHANGES_REQUESTED | A reviewer requests changes | Status CHANGES_REQUESTED |
| APR-06 | API | All approved → APPROVED | Every reviewer approves | Status APPROVED |
| APR-07 | API | Resubmit by requester | POST `/approvals/{id}/resubmit/` as requester (not approved yet) | Approval + all reviewers reset to PENDING; reviewers re-notified |
| APR-08 | API | Resubmit by non-requester | Resubmit as another user | 403 |
| APR-09 | API | Resubmit already approved | Resubmit an APPROVED approval | 400 |
| APR-10 | UI | Approval live update | Receive `approval.created/updated` WS | `["approvals", …]` and `["tasks", …]` invalidated (affects `pending_approval_count` on cards) |
| APR-11 | UI | Request approval dropdown | TaskDetailPanel approval button | Reviewer search + multi-select, due date, note; sends request |

### Wiki & documents

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| WIKI-01 | API | Create/list wiki pages | POST/GET `/boards/{pid}/wiki/` | Tree structure; unique(board+slug) |
| WIKI-02 | API | Update page | PATCH `/wiki/{id}/` | Saved; revision recorded |
| WIKI-03 | API | Revisions | GET `/wiki/{id}/revisions/` | History; read-only |
| WIKI-04 | UI | Wiki editor | WikiPage | Nested tree create/expand; lazy Tiptap editor; public/private toggle; revisions panel with "Restore this version" |
| DOC-01 | API | Workspace documents CRUD | `/workspaces/{ws}/documents/` | Create/list/update/delete |

### Forms (intake)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| FORM-01 | API | Create form | POST `/boards/{pid}/forms/` with `edit` perm | Created with UUID `token` |
| FORM-02 | API | Delete form requires admin | DELETE form as non-admin board member | 403 (admin required) |
| FORM-03 | API | Bulk-replace fields | **PUT** `/forms/{id}/fields/` | Fields replaced (note: PUT, not POST) |
| FORM-04 | API | Public form schema | GET `/forms/{token}/` (unauth) | Schema returned (AllowAny) |
| FORM-05 | API | Public submit → task | POST `/forms/{token}/submit/` (unauth) | Submission created; if `config.create_task` (default) → Task created with `created_by=NULL`, title from `title_field_id` or "Submission from …", status from `default_status_id` or board's first status; `submission.task` linked |
| FORM-06 | API | List submissions auth-only | GET `/forms/{id}/submissions/` | Requires workspace membership + board access |
| FORM-07 | UI | Form builder | FormsPage builder tab | Field cards: label, type `<Select>`, placeholder, required, options; add/remove/reorder |
| FORM-08 | UI | Submission status change | Submissions tab status `<Select>` | new/in-review/closed; row-click expand not triggered by select (stopPropagation) |
| FORM-09 | UI | Copy public link / preview | Form header | Copy link; preview opens public form in new tab |

### OKRs (Objectives & Key Results)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| OKR-01 | API | Create objective | POST `/workspaces/{ws}/objectives/` | Created; broadcasts `objective.created` |
| OKR-02 | API | Update/delete objective | PATCH/DELETE objective | Broadcasts `objective.updated`/`deleted` |
| OKR-03 | API | Key results CRUD | `/objectives/{id}/key-results/` | KR mutations broadcast `objective.updated` with re-serialized parent |
| OKR-04 | API | Link/unlink tasks to KR | `/key-results/{id}/tasks/` | Progress computed from linked tasks' done status |
| OKR-05 | UI | Live OKR updates | Teammate changes an objective | `["objectives", ws]` invalidated via `objective.*` WS event (no polling) |

### Automations — **DISABLED**

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| AUTO-01 | API | Automation routes unreachable | Hit `/boards/{pid}/automations/` | Route not registered (commented out); `fire_automation` is a no-op; `task_post_save` signal does nothing |
| AUTO-02 | UI | No automations UI | App nav | AutomationsPage route disabled; `useAutomations` hook dead |

### Real-time (board socket)

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| WS-RT-01 | UI | task.created/updated/moved/deleted | Teammate changes a task while board open | `["tasks"]` updated via `setQueriesData`/invalidate; sprint invalidated; all views update simultaneously (single `allTasks` source) |
| WS-RT-02 | UI | Socket-backed no focus dupes | Window refocus on board | `SOCKET_BACKED` queries don't double-refetch on focus (socket already pushed) |
| WS-RT-03 | UI | Two scoped connections | Navigate off the board | Workspace socket (inbox/objective/presence) stays alive app-wide; board socket only while board open |

---

## 4. Analytics (V2)

> 4 endpoints only: `summary`, `aggregate`, `team`, `tasks`. All filters are **flat** comma-separated params via `_apply_task_filters` (single source). Frontend caches `staleTime: Infinity` — Refresh button is the only refetch.

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| AN-01 | API | Summary KPIs | GET `/analytics/summary/` | `{total, open, done, overdue}` |
| AN-02 | API | Aggregate group_by | GET `/analytics/aggregate/?group_by=status,priority` | `summary` block + `groups` map per dimension; `metric=count` default |
| AN-03 | API | Aggregate invalid group_by | `group_by=sprint` (disabled) | Sprint dimension not produced (only assignee/status/priority/type/board/date valid) |
| AN-04 | API | Aggregate pagination | `page`+`page_size` per dim | `page_size` capped at 50 |
| AN-05 | API | Team workload | GET `/analytics/team/?days=14` | Per-member `{assigned, open, overdue, completed, points, days, total_due}`; only members with assigned tasks |
| AN-06 | API | days clamp | `days=9999` | Clamped to `_MAX_DAYS=365` |
| AN-07 | API | Task drilldown | GET `/analytics/tasks/?order=recent` | Cursor-paginated flat task list; no `count`; `next` link to load more |
| AN-08 | API | Filter consistency | Same filters on aggregate chart and drilldown | Chart counts and drill-down rows agree (shared `_apply_task_filters`) |
| AN-09 | API | Removed legacy routes | GET `/analytics/velocity/` (or burnup/cfd/overview) | 404 (AnalyticsMetricView removed) |
| AN-10 | UI | Shared filters across tabs | Change date/board/task filters in FilterBar | Board, Teams, Overdue all update simultaneously (`buildTaskParams`) |
| AN-11 | UI | Refresh button | Click Refresh | `invalidateQueries(["analytics"])`; spinner while refreshing; only refetch path (staleTime Infinity) |
| AN-12 | UI | BoardTab drill-down | Click stat pill / donut slice / bar / workload row | Opens TaskDrilldownModal filtered to that segment |
| AN-13 | UI | TeamsTab sort + paginate | Click column headers; Prev/Next | Sort asc/desc by name/assigned/open/overdue/completed/points; cursor pagination resets on filter change |
| AN-14 | UI | OverdueSection dimension switch | Change dimension `<Select>` (assignee/priority/board) | Re-queries `aggregate` with `group_by=<dim>&overdue=true`; bar click drills down; row click opens task detail |
| AN-15 | UI | Drilldown search | TaskDrilldownTable search box | Debounced 300ms server-side title match; "Load more" cursor paging |
| AN-16 | UI | Burndown is dead | Sprint burndown | `useSprintBurndown` hits non-existent `/analytics/sprint_burndown/`; chart commented out — assert it's not rendered / wire a real endpoint before using |

---

## 5. Shared `<Select>` component

| ID | Type | Scenario | Steps | Expected result |
|----|------|----------|-------|-----------------|
| SEL-01 | UI | Single select | Open, pick an option | `onChange(value)` with raw value; menu closes; trigger shows selected label |
| SEL-02 | UI | Multi select | `multiple`; pick several | `onChange(array)`; checkbox rows; menu stays open; trigger shows "N selected" |
| SEL-03 | UI | Search filter | `searchable`; type query | Filters by label + keywords; arrow-nav over filtered rows |
| SEL-04 | UI | Keyboard nav | Open, ↑/↓/Home/End/Enter/Esc | Highlight moves; Enter selects; Esc closes and refocuses trigger |
| SEL-05 | UI | Programmatic open | Increment `openSignal` (e.g. ⇧A in task panel) | Menu opens; drives task property shortcuts |
| SEL-06 | UI | Icons / avatars / color dots | Options with `icon`/`avatar`/`color` | Rendered in both trigger and list without custom render |
| SEL-07 | UI | Grouped / nested options | Pass `{label, options:[…]}` | Group header + indented children |
| SEL-08 | UI | Create-new affordance | `onCreate` + typed query with no exact match | "+ Create …" row; selecting fires `onCreate` |
| SEL-09 | UI | No clipping in modal | Open a Select inside a modal / scroll container | Menu portals to body at `z-[1100]` (above `z-[999]` modal); flips/shifts to stay on screen |
| SEL-10 | UI | Clearable | `clearable` single select with a value | ✕ resets to empty |
| SEL-11 | UI | Disabled | `disabled` | Trigger not interactive; no open |
| SEL-12 | UI | No native `<select>` remain | grep `<select` in `src/` | 0 results — every picker uses `<Select>` |
| SEL-13 | UI | stopPropagation safety | Select inside a clickable row (e.g. form submission status) | Opening the select does not trigger the row click |

---

## Appendix — High-value regression checks (from documented findings)

| ID | Type | Scenario | Expected result |
|----|------|----------|-----------------|
| REG-01 | API | Status delete guard | Omitting a non-empty status from `/statuses/bulk/` → 400, tasks not orphaned |
| REG-02 | API | Task PATCH/move permission gap | A viewer who can load a task PATCHing it currently **succeeds** (no explicit `edit`/`move` check on `PATCH /tasks/` & `/move/`) — assert intended behavior and tighten if needed |
| REG-03 | API | Version conflict | Stale `version` on PATCH → 409 with `current_version` |
| REG-04 | API | Move-to-done w/ pending approval | 403 `{approval_required:true}` |
| REG-05 | API | Form fields method | `/forms/{id}/fields/` is **PUT** (not POST) |
| REG-06 | API | Analytics legacy routes | Old per-metric routes 404 |
| REG-07 | UI | Members job-title save-on-change | Job title now saves on change (was uncontrolled blur) — confirm UX on profile edit |
| REG-08 | UI | Analytics staleTime | Analytics queries never auto-refetch; only Refresh button |
