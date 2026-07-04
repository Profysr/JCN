# JCN Access Control — Reference

> **What this file is.** The single explanation of how *every* endpoint in the
> backend decides "are you allowed to do this?". It defines the access
> primitives, the order they resolve in, the one module that implements them
> (`workspaces/access.py`), and then walks **every view, app by app**, saying what
> the view is for, which access check it uses, and *why*.
>
> **Maintenance rule:** when you add or change a view, add/update its row here in
> the same commit. When you add an app, permission, or scope, follow the recipes
> at the bottom. This file is the contract; `workspaces/access.py` is the
> implementation.

---

## 1. The access primitives

Every request is authenticated as a **user** (via JWT `Bearer <jwt>`) or as an
**API key** (via `Bearer jcn_<key>`, which resolves to `key.created_by`). On top
of *who you are*, five checks decide *what you may do*. They compose — a request
usually passes through several.

| # | Primitive | Question it answers | Backing data |
|---|-----------|---------------------|--------------|
| 1 | **Membership** | Are you in this workspace at all? | `WorkspaceMember(workspace, user)` |
| 2 | **Ownership** | Are you the workspace owner? | `Workspace.owner` |
| 3 | **Workspace admin** | Can you manage the workspace? | owner **OR** `settings.manage` permission |
| 4 | **App access** | May you enter this product area (Projects / Org / HR / Analytics)? | `CustomRole.app_access[app_key]` |
| 5 | **Fine-grained permission** | May you do this specific action? | `CustomRole.permissions[app_key][perm_key]` |
| + | **API-key scope** | (only when auth is an API key) Is this key allowed to read / write / admin? | `WorkspaceAPIKey.scopes` |

A member's role is **not** a column on `WorkspaceMember`. It is resolved through
`WorkspaceMember → RoleAssignment → CustomRole`. `CustomRole` carries two JSON
maps: `app_access` (coarse, primitive #4) and `permissions` (fine-grained,
primitive #5). System roles (`Admin`, `Member`, `Viewer`) are seeded per
workspace by `create_system_roles()`.

> **Historical note.** `WorkspaceMember.role` (a CharField) was removed when RBAC
> moved to `CustomRole`. Any code still doing
> `WorkspaceMember.objects.filter(role="admin")` is querying a field that no
> longer exists and will raise `FieldError`. The centralized layer exists partly
> to make that class of bug impossible.

---

## 2. Resolution order

For a user-authenticated request:

```
1. Owner?                → owner short-circuits to ALLOW on every check below.
2. Member?               → if not a member, 404 the workspace (don't leak existence).
3. App access (if req'd) → CustomRole.app_access[app] must be true, else 403.
4. Permission (if req'd) → CustomRole.permissions[app][perm] must be true, else 403.
   (a permission check implicitly requires app access for that app first.)
```

For an API-key request, one more ceiling applies **before** the action runs:

```
0. Scope ceiling → the key's scopes must include the scope the endpoint needs.
                   read  ⊆ write ⊆ admin  (admin implies write implies read).
                   A JWT (real user) request has NO ceiling — full user rights.
```

"Workspace admin" (primitive #3) is just a convenience name for *owner OR holds
`settings.manage`*. It is the correct gate for workspace-wide management
(settings, members, API keys, webhooks). Product-area management uses that
area's fine-grained permission instead (`org.manage`, `hr.manage_*`,
`project.admin`), so a custom role can grant it without making someone a
workspace admin.

---

## 3. The canonical module — `workspaces/access.py`

Every app imports from here. Do not hand-roll membership or admin checks.

```python
# ── Resolution ──
get_workspace_or_404(workspace_id, user)   # membership-gated fetch, RAISES Http404 (for HTTP views)
member_workspace(user, workspace_id)       # membership-gated fetch, returns None (for non-HTTP callers, e.g. WS consumer)
get_membership(user, workspace)            # WorkspaceMember | None
is_member(user, workspace) -> bool
workspace_admins(workspace)                # queryset/list of admin members + owner (for notifications)

# ── Identity tiers ──
is_owner(user, workspace) -> bool
is_workspace_admin(user, workspace) -> bool          # owner OR settings.manage
require_workspace_admin(user, workspace)

# ── App access (primitive #4) ──
has_app_access(user, workspace, app_key) -> bool
require_app_access(user, workspace, app_key)

# ── Fine-grained permission (primitive #5; app inferred from the key) ──
has_perm(user, workspace, perm_key) -> bool
require_perm(user, workspace, perm_key)

# ── API-key scope ──
request_scopes(request) -> set | None                # None => JWT user (unbounded)
has_scope(request, scope) -> bool
require_scope(request, scope)

# ── One-call view guard (use this at the top of a view) ──
authorize(request, workspace_id, *, app=None, perm=None, admin=False, scope=None) -> workspace
    # 1) resolves the workspace (membership or 404)
    # 2) enforces scope ceiling if the request is an API key
    # 3) enforces app access / permission / admin as requested
    # returns the Workspace so the view can use it
```

`authorize()` is the everyday entry point. `_require_onboarded` (org's "finish
your profile" wall) stays in the org app — it's business logic, not access
control — and is composed after `authorize()`.

`workspaces/permissions.py` and `workspaces/rbac.py` have been **removed** — there
is no compatibility shim. Everything (resolution, checks, scopes, and
`create_system_roles`) lives in `access.py`; every app imports from it directly.

**`APIKeyScopePermission`** — a DRF permission class in `access.py`, wired into
`REST_FRAMEWORK.DEFAULT_PERMISSION_CLASSES` in `core/settings.py`. It is the
**global floor** for scope #6 above: every view in every app gets
`permission_classes = [IsAuthenticated, APIKeyScopePermission]`, which maps
GET/HEAD/OPTIONS → `scope:read` and POST/PUT/PATCH/DELETE → `scope:write`
automatically — no per-view `authorize(..., scope=)` call required to get the
baseline. A view still calls `authorize(..., admin=True, scope="admin")` itself
when one specific action needs a stricter ceiling than the method default (e.g.
deleting a webhook). This exists because `permission_classes` set on a view
**replaces** the DRF default list rather than extending it — every `APIView`
across the backend explicitly lists `APIKeyScopePermission` for this reason; a
new view that copies an existing class picks it up automatically, but a view
written from scratch must still include it explicitly.

---

## 4. Endpoint-by-endpoint

> Legend for "Access check": **member** = must be a workspace member;
> **app:X** = `require_app_access(X)`; **perm:X** = `require_perm(X)`;
> **admin** = `require_workspace_admin`; **scope:X** = API-key scope ceiling;
> **self** = actor-identity check; **public** = `AllowAny`.
> Every non-public row also implies **member** (resolved by `authorize`).

### Auth & Users (`accounts`)

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| POST `/api/auth/login` `/registration` `/token/refresh` `/password/reset` `/google` | Sign in / register / refresh / reset / OAuth | **public** | Pre-auth — no workspace context exists yet. |
| GET/PATCH `/api/users/me/` | Read/update own profile & prefs | authenticated user | Operates on the caller's own record only; no workspace scope. |

### Workspaces, Members, Roles (`workspaces`)

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET `/api/workspaces/` | List my workspaces | authenticated user | Filtered to memberships; no per-workspace gate. |
| POST `/api/workspaces/` | Create workspace | authenticated user | Caller becomes owner + Admin. |
| GET `/api/workspaces/{ws}/` | Workspace detail | member | Any member may view basic workspace info. |
| PATCH `/api/workspaces/{ws}/` | Rename / set logo | admin + scope:admin | Workspace-wide setting. |
| DELETE `/api/workspaces/{ws}/` | Delete workspace | owner only | Irreversible, owner-exclusive. |
| GET `/api/workspaces/{ws}/members/` | List members | member | Directory is visible to all members. |
| PATCH/DELETE `/members/{id}/` | Change role / remove member | perm:`member.remove` (+ admin for role) + scope:admin | Membership management is privileged. |
| POST `/invites/` | Invite a member | perm:`member.invite` + scope:write | Adds people to the workspace. |
| GET `/invites/pending/`, DELETE `/invites/{token}/` | Manage pending invites | perm:`member.invite` | Same authority as issuing invites. |
| GET/POST `/invites/{token}/`, `/accept/` | View / accept an invite | **public** | Invitee isn't a member yet; token is the credential. |
| GET `/permissions/` | Permission schema (registry) | member | Static reference the UI caches; safe for any member. |
| GET `/roles/` | List roles (scoped) | member | Admins see all roles; non-admins see only their own (handled in-view). |
| POST/PATCH/DELETE `/roles/{id}/` | Create/edit/delete custom role | admin + scope:admin | Editing the permission model itself. |
| POST `/members/{id}/assign-role/`, `/bulk-assign-role/` | Assign role(s) | admin + scope:admin | Changes what members can do. |
| GET `/onboarding/` , PATCH | Wizard/checklist state | admin | Workspace-level setup state. |
| GET/POST/DELETE `/api-keys/` | Manage API keys | perm:`api_keys.manage` + scope:admin | Keys grant programmatic access; admin-tier. |
| GET/POST/PATCH/DELETE `/webhooks/…` | Manage outbound webhooks | perm:`api_keys.manage` + scope:admin | Same trust level as API keys. |
| `/import/…` (jobs, run, rollback) | Import external data | app:`projects` + perm:`pm.import_jobs` + scope:write | Bulk-creates project data. |
| GET `/inbox/…`, PATCH, bulk | Personal notifications | authenticated user | Scoped to the caller's own inbox rows. |

### Projects (`projects`)

Projects has a **two-tier** model: workspace `CustomRole` permissions first, then
a per-board `BoardMember` override that can only *add* access. All of it resolves
through `has_project_permission(user, board, action)` → which calls the central
engine and falls back to the `BoardMember` table. Board reads are also filtered
by visibility (`Board.objects.for_user` hides private boards).

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET/POST `/boards/` | List / create boards | app:`projects` + perm:`board.create` (create) + scope:write | Entering project area; creating is privileged. |
| GET/PATCH `/boards/{pid}/` | Board detail / update | board `view` / `admin` | Per-board role governs board settings. |
| DELETE `/boards/{pid}/` | Delete board | workspace admin | Destructive; workspace-admin gated. |
| `/boards/{pid}/members/…` | Manage board members | board `admin` | Board-scoped membership. |
| GET `/tasks/` … POST/PATCH | List / create / edit tasks | board `view` / `edit` + scope:write | Core board work; per-board role. |
| DELETE `/tasks/{tid}/`, bulk-delete | Delete tasks | board `delete` | Destructive board action. |
| POST `/tasks/{tid}/move/` | Move task | board `move` | Drag-and-drop reorder. |
| `/comments/…` | Comment / react | board `comment`; **self** for edit/delete | Authorship is enforced for edits. |
| `/statuses/bulk/`, `/labels/`, `/fields/`, `/saved-views/`, `/sprints/`, `/wiki/`, `/forms/` | Board configuration & content | board `edit` / `admin` per action | Board-scoped configuration. |
| `/approvals/…/admin-override/` | Force approval decision | workspace admin | Bypasses reviewers — admin-only. |
| GET/POST `/forms/{token}/`, `/submit/` | Public intake form | **public** | Anonymous submitters by design; task created with `created_by=NULL`. |
| `/objectives/…` (OKRs) | Objectives & key results | app:`projects` + board/workspace perms | Part of the projects product area. |

### Organization (`organization`)

All org endpoints require **app:`org`**. Reads additionally require the member to
be **onboarded** (`_require_onboarded` — non-admins with a draft/missing
`OrgProfile` are walled off). Mutations require **perm:`org.manage`** (owner/Admin
hold it automatically; a custom role can grant it without full admin).

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET `/org/departments/`, `/teams/`, `/chart/`, `/reporting-lines/` | Read org structure & chart | app:`org` + onboarded | Viewing the org requires being past the onboarding wall. |
| POST/PATCH/DELETE `/org/departments/…`, `/teams/…` | Manage departments & teams | app:`org` + perm:`org.manage` + scope:write | Structural edits are privileged. |
| GET/POST/DELETE `/org/departments/{id}/members/…`, `/teams/{id}/members/…` | Manage unit membership | read: app:`org`+onboarded / write: perm:`org.manage` + scope:write | Assigning people to units. |
| GET/POST/PATCH/DELETE `/org/job-titles/…` | Manage job-title lookup | list: app:`org` (no onboarding wall) / write: perm:`org.manage` + scope:write | Titles must be visible pre-onboarding to read the chart; edits are privileged. |
| GET/PATCH `/org/members/{id}/profile/` | View / edit a member's profile | GET: **self** or perm:`member.view_profile`; PATCH: **self** or perm:`org.manage` (approved ⇒ admin/manager only) | Consumed workspace-wide (directory, HR), so gated on the workspace-level view permission, not app:`org`. |
| GET/PATCH/POST `/org/me/profile/` | Own profile: view / edit / submit | authenticated member (GET always allowed) | Needed to render the onboarding wall itself; submit lifts the gate. |
| GET `/org/profiles/pending/` | Review queue | perm:`org.manage` | HR/admin review of submissions. |
| POST `/org/profiles/{id}/approve/`, `/bulk-approve/` | Approve profile(s) | perm:`org.manage` + scope:write | Approval lifts a member's onboarding gate. |

### HR (`hr`)

`hr` depends on `org` (`APP_REGISTRY`). All endpoints require **app:`hr`**.
Employee-facing actions (clock in/out, own leave/attendance) need only app access;
management actions gate on **perm:`hr.manage_leave`** or **perm:`hr.manage_attendance`**.

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET `/hr/leave-policies/` | List leave policies | app:`hr` | Employees need to see policies to request leave. |
| POST/PATCH/DELETE `/hr/leave-policies/…` | Manage policies | perm:`hr.manage_leave` + scope:write | Policy config is a management action. |
| GET `/hr/leave-requests/` | List requests | app:`hr` (employee sees own, admin sees all — in-view) | Everyone sees their own leave. |
| POST `/hr/leave-requests/` | Submit leave request | app:`hr` + scope:write | Any employee may request. |
| POST `/hr/leave-requests/{id}/review/` | Approve / reject | perm:`hr.manage_leave` + scope:write | Approval is a management action. |
| GET `/hr/leave-balances/`, `/whos-off/` | Balances / who's away | app:`hr` | Team-visible info. |
| GET/PATCH `/hr/attendance-policy/` | Attendance policy | GET: app:`hr` / PATCH: perm:`hr.manage_attendance` + scope:write | Config edit is management. |
| POST `/hr/attendance/clock-in/`, `/clock-out/` | Clock self in/out | app:`hr` + scope:write | Self-service attendance. |
| GET `/hr/attendance/`, `/summary/` | All-employee records / summary | perm:`hr.manage_attendance` | Viewing everyone's attendance is management. |
| GET `/hr/attendance/my/` | Own records | app:`hr` | Self-scoped. |
| GET `/hr/dashboard/` | HR dashboard stats | perm:`hr.manage_leave` (or admin) | Aggregate workforce data — management view. |
| GET/POST/DELETE `/hr/members/{id}/documents/…` | Employee documents | perm:`hr.manage_attendance` (HR admin) + scope:write | Sensitive HR files; never employee-self. |
| GET/POST/PATCH/DELETE `/hr/members/{id}/notes/…` | Private manager notes | perm:`hr.manage_leave` (HR admin) | Private notes — never served to the employee. |

### Analytics (`analytics`)

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET `/analytics/summary/`, `/aggregate/`, `/team/`, `/tasks/` | Workspace/board metrics & drill-down | app:`projects` + perm:`pm.view_analytics` | Analytics reads project data; gate matches the project-analytics permission. **(Currently ungated — membership only. Fixed in this change.)** |

### Integrations (`integrations`)

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET `/integrations/` | Integration status | member | Read-only status. |
| GET/PUT/DELETE `/integrations/teams/`, `/google-chat/`, `/test/` | Configure outbound chat webhooks | admin + scope:admin | Outbound delivery config is workspace-admin trust. **(Currently membership-only. Fixed in this change.)** |
| GET/POST/PATCH/DELETE `/integrations/mappings/…` | Per-board routing rules | perm:`api_keys.manage` (or admin) + scope:write | Same trust tier as webhooks. |

### Misc

| Method + Path | Purpose | Access check | Why |
|---|---|---|---|
| GET `/api/search/`, `/my-work/` | Global search / my tasks | authenticated user | Results filtered to the caller's memberships. |
| GET `/portfolio/` | Board health metrics | member + app:`projects` | Aggregates project data. |
| POST `/presence/` | Update presence | member | Scoped to caller. |
| GET `/api/schema/`, `/docs/` | OpenAPI schema / Swagger | authenticated user | Documentation surface. |

---

## 5. Recipes

### Gate a new view
```python
from workspaces.access import authorize

class MyView(APIView):
    def post(self, request, workspace_id):
        ws = authorize(request, workspace_id, app="hr",
                       perm="hr.manage_leave", scope="write")
        ...  # ws is the resolved Workspace
```
Pick the least privilege that fits: `app=` for "may enter this area", `perm=` for
a specific action, `admin=True` for workspace-wide management, `scope=` for the
API-key ceiling (`read` for GET, `write` for mutations, `admin` for key/role/
settings management).

### Add a new app
1. Add it to `APP_REGISTRY` + `PERMISSIONS` + `SYSTEM_ROLE_PERMISSIONS` in
   `workspaces/constants.py`.
2. Gate its views with `authorize(request, ws, app="<key>")`.
   Frontend picks the app up automatically from `GET /permissions/`.

### Add a new permission
1. Add it under the right app key in `PERMISSIONS` and set defaults in
   `SYSTEM_ROLE_PERMISSIONS`.
2. Reference it with `authorize(..., perm="<key>")` or `require_perm`.
   The reverse map (`perm → app`) is built automatically; no other file changes.

### Add a new API-key scope
1. Add it to `WorkspaceAPIKey.Scope`.
2. Extend the `read ⊆ write ⊆ admin` implication table in `access.py` if the new
   scope participates in the hierarchy.

---

## 6. Known gaps this centralization fixes

1. **Runtime crash:** `organization` and `hr` (views + `organization/tasks.py`)
   query the removed `WorkspaceMember.role` field → `FieldError` 500 on every
   admin-gated endpoint. Fixed by routing all admin checks through
   `access.is_workspace_admin` / `require_perm`.
2. **Dead permissions:** `org.manage`, `hr.manage_leave`, `hr.manage_attendance`
   were defined but never checked. Now enforced on mutations.
3. **Unenforced API-key scopes:** any key had full user rights. `hr`, `org`,
   `analytics`, and `integrations` picked up per-endpoint `scope=` checks in
   the first pass of this centralization, but `projects` and `workspaces`
   (the two largest apps — boards, tasks, comments, members, invites,
   API keys, webhooks) were missed: their view helpers (`get_workspace_for_user`,
   `has_app_access`, `has_perm`, `_get_workspace`) never called `authorize()` or
   `require_scope()`, so an API key could hit those endpoints with **no scope
   ceiling at all**, regardless of its granted scopes. Closed by adding
   `APIKeyScopePermission` (section 3) as a global `DEFAULT_PERMISSION_CLASSES`
   floor, applied to every view across all six apps — plus rate limiting keyed
   on the API-key hash.
4. **Ungated areas:** `analytics` (membership-only) and `integrations`
   (membership-only) now require app access / admin as appropriate.
5. **Reporting-line 500:** a duplicate manager for a report raised
   `IntegrityError`; now returns a clean 400.
6. **Cross-workspace FK leaks:** write-only `*_id` fields in org serializers
   (`head_id`, `parent_id`, `department_id`, `job_title_id`, `member_id`) now
   validate the referenced row belongs to the same workspace.

---

## 7. Roadmap & open decisions  ⚠️ TEMPORARY — delete after sign-off

> This section exists only so we agree on scope before the code refactor. Once
> you've confirmed the points below, delete section 7 — it is not part of the
> permanent reference.

### What we're going to build (the plan this doc is the contract for)

1. **`workspaces/access.py`** — the one canonical module (section 3). It absorbs
   the existing engine (`has_app_access` / `has_permission` / `resolve_permission`)
   and adds the missing primitives (`get_workspace_or_404`, `is_workspace_admin`,
   `require_perm`, scope helpers, and the `authorize()` one-call guard).
2. **`permissions.py` / `rbac.py` → thin shims** that re-export from `access.py`,
   so nothing that imports them breaks. New code imports from `access.py` only.
3. **Migrate every app** off hand-rolled checks onto `authorize()`:
   organization, hr, analytics, integrations, and re-point projects' helpers.
   This kills the `WorkspaceMember.role` crash (gap #1) and activates the dead
   fine-grained permissions (gap #2).
4. **API-key scopes enforced** (`read ⊆ write ⊆ admin`) + **rate limiting** keyed
   on the API-key hash (Redis-backed throttle), wired through `authorize()`.
5. **Bundled correctness fixes** — gaps #4–6 above.
6. **Docs updated** — `BACKEND.md` + `ORGANIZATION.md` point at the centralized
   layer instead of describing per-app checks.

### What I need you to confirm

- [ ] **A. Analytics gate.** Doc currently specs analytics as
  `app:projects + perm:pm.view_analytics` (that permission already exists).
  Alternative: gate on the separate `analytics` app-access key. **Keep as-is, or
  switch to `analytics`?**
- [ ] **B. HR permission granularity.** Doc maps documents →
  `hr.manage_attendance` and notes/dashboard/leave-review → `hr.manage_leave`.
  That spreads two permissions across more feature areas than they cleanly name.
  **Keep the 2-permission split, or add a dedicated `hr.manage_employees`
  (and/or a read-tier `hr.view`) permission before migrating?**
- [ ] **C. Scope ceiling for reads.** Should GET endpoints require `scope:read`
  (strict — a key with no `read` scope can't even list), or should any valid key
  read and only writes be gated? Doc assumes **strict** (`read` required on GETs).
- [ ] **D. "Workspace admin" definition.** Confirmed as *owner OR `settings.manage`*.
  Any place you'd want a stricter *owner-only* gate beyond `DELETE /workspaces/`?
