# Organization App — Reference

Org structure module: departments, teams, job titles, reporting lines, org profiles
(onboarding), and the org chart. Every endpoint here is gated by `org` app access
(`workspaces/constants.py`) and, for regular members, by a completed `OrgProfile`
(see `_require_onboarded` in `views.py`). Admins always pass both checks.

For URL paths and request/response shapes, see the "Organization" section that
should be added to `backend/BACKEND.md`. This file explains **what each piece is
for** and gives a real frontend usage example for each.

---

## Models (`models.py`)

**`JobTitle`** — a named rank/level within a workspace (e.g. "Senior Engineer", level 3).
Used to populate the job title dropdown when an admin edits a member's `OrgProfile`, and
shown as a label under a person's name on the org chart and people directory.

**`Department`** — a top-level org unit (e.g. "Engineering"). Has a `head`
(`WorkspaceMember`), an optional `parent` for sub-departments, and a color/identifier for
UI chips. Frontend: [DepartmentsPage.jsx](../frontend/src/apps/org-structure/pages/DepartmentsPage.jsx)
renders one card per department with its head's avatar and member count.

**`DepartmentMember`** — join row linking a `WorkspaceMember` to a `Department`.
`is_head` isn't a stored flag — it's computed from `Department.head` at serialization
time, so promoting a new head never requires updating membership rows.

**`Team`** — a smaller working group, optionally nested under a `Department`, with its
own `lead`. Frontend: [TeamsPage.jsx](../frontend/src/apps/org-structure/pages/TeamsPage.jsx)
groups teams by department and lets an admin drag members in.

**`TeamMember`** — join row linking a `WorkspaceMember` to a `Team`, mirroring
`DepartmentMember` (`is_lead` is likewise derived from `Team.lead`).

**`OrgProfile`** — extends `WorkspaceMember` with org-specific fields (job title,
employment type, start date, bio) and an onboarding `status`
(`draft → submitted → approved`). Every non-admin member is blocked from the rest of
the org app until their profile is `approved`. Frontend:
[OrgOnboardingGate.jsx](../frontend/src/apps/org-structure/components/OrgOnboardingGate.jsx)
shows the "complete your profile" wall while `status != approved`, and
[MemberProfilePage.jsx](../frontend/src/apps/org-structure/pages/MemberProfilePage.jsx)
renders the approved profile.

**`ReportingLine`** — a manager → report edge. `unique_together = ["workspace", "report"]`
enforces one manager per person. Frontend: [OrgChartPage.jsx](../frontend/src/apps/org-structure/pages/OrgChartPage.jsx)
draws these edges as the tree connectors between nodes.

---

## Serializers (`serializers.py`)

Mini serializers exist specifically so nested reads (a department's `head`, a team's
`lead`, a profile's `manager`) don't pull in fields the nested context doesn't need —
full serializers are reserved for the resource a request is actually about.

**`MiniUserSerializer`** (from `accounts`), **`MiniMemberSerializer`**,
**`MiniDepartmentSerializer`**, **`MiniTeamSerializer`**, **`MiniJobTitleSerializer`** —
id + display fields only (name/color/identifier, or user+role for members). Used as
the *nested* representation wherever a full object would be overkill, e.g. the `head`
field on `DepartmentSerializer` is a `MiniMemberSerializer`, not a full member serializer.

**`DepartmentSerializer` / `TeamSerializer`** — the writable, full representations used
by the list/detail views. Both expose a computed `member_count` and accept `*_id`
write-only fields (`head_id`, `parent_id`, `lead_id`, `department_id`) so the frontend
can send a plain UUID on create/update instead of a nested object. Example: the
"Assign head" dropdown in `DepartmentsPage.jsx` PATCHes `{ head_id: "<uuid>" }`.

**`DepartmentMemberSerializer` / `TeamMemberSerializer`** — membership rows; take
`member_id` on create, return `is_head`/`is_lead` on read.

**`OrgProfileSerializer`** — the read/write shape for a member's org profile. Adds
computed `departments`, `teams`, `manager`, and `direct_reports_count` so
`MemberProfilePage.jsx` can render a full profile card from one request instead of
four. Only `job_title_id` and the freeform fields (`employee_id`, `bio`, etc.) are
writable; `status`/`approved_by`/timestamps are server-controlled.

**`ReportingLineSerializer`** — validates on write that the manager/report are both
workspace members, aren't the same person, and that adding the edge wouldn't create a
cycle (walks the existing chain up from `manager`).

---

## Views (`views.py`)

Shared helpers at the top of the file remove the two patterns repeated across nearly
every view:

- `_get_workspace_with_org_access(workspace_id, user)` — fetch the workspace, require
  `org` app access **and** an approved profile. Used by every read (list/detail) view.
- `_get_workspace_as_admin(workspace_id, user)` — fetch the workspace, require the
  caller to be a workspace admin. Used by every create/update/delete view.
- `_get_scoped_object(workspace_id, Model, obj_id, user)` — fetch the workspace, then
  a row of `Model` scoped to it (`Department`, `Team`, `JobTitle` all have a
  `workspace` FK). Callers add their own permission check after.
- `_finalize_profile_approval(profile)` — fires the approval Celery task + workspace
  broadcast; shared by the single-approve and bulk-approve views.

**Departments** — `DepartmentListCreateView` / `DepartmentDetailView` /
`DepartmentMemberListCreateView` / `DepartmentMemberDetailView`. Standard CRUD +
membership management; every mutation calls `broadcast_org_event` so other connected
clients see the change without polling. Frontend: `useOrg.js`'s department hooks back
`DepartmentsPage.jsx`.

**Teams** — same shape as Departments, scoped by workspace and optionally by
`department`.

> **`GET .../org/departments/{id}/` and `GET .../org/teams/{id}/` are currently unused
> by the frontend.** `DepartmentsPage.jsx`/`TeamsPage.jsx` load the full list
> (`useDepartments`/`useTeams`) and read a single row out of that cache rather than
> fetching it individually — only the list `GET`, `PATCH`, and `DELETE` on the detail
> route are called. Kept for API completeness / direct-link use cases (e.g. a future
> "open this department" deep link).

**Job Titles** — `JobTitleListCreateView` / `JobTitleDetailView`. Simple admin-managed
lookup list; listing itself has no onboarding gate (a member needs to see job titles
to understand the org chart before their own profile is approved). Frontend:
[JobTitlesPage.jsx](../frontend/src/apps/org-structure/pages/JobTitlesPage.jsx).

**Org Profiles** — `OrgProfileView` (admin/self view of one member's profile),
`MyOrgProfileView` (the logged-in user's own profile: GET/PATCH for editing,
POST to submit for review), `PendingProfilesView` (admin queue of submitted
profiles), `ApproveProfileView` / `BulkApproveProfilesView` (approve one or many).
Frontend: [PendingProfileModal.jsx](../frontend/src/apps/org-structure/components/PendingProfileModal.jsx)
and [PendingProfilesPage.jsx](../frontend/src/apps/org-structure/pages/PendingProfilesPage.jsx)
drive the HR review queue; `OrgOnboardingGate.jsx` drives self-service submission.

> **`OrgProfileView.get` is gated by `_require_profile_view_access`**, not
> `_require_org_access`. Viewing your own profile is always allowed; viewing someone
> else's requires the workspace-level `member.view_profile` permission
> (`workspaces/constants.py` — off by default for the system `Viewer` role). This is
> deliberately *not* tied to `org` app access, because this endpoint is also consumed
> workspace-wide by `MemberProfilePanel.jsx` (member directory) and
> `MemberDetailPage.jsx` (HR management), not just the org app.

**Reporting Lines** — `ReportingLineListCreateView` / `ReportingLineDetailView`.
Creates/deletes manager↔report edges; validation (self-report, cycles, cross-workspace)
lives in `ReportingLineSerializer.validate`.

> **`GET .../org/reporting-lines/` is currently unused by the frontend.** `OrgChartPage.jsx`
> gets everything it needs (`manager_id`, `reporting_line_id` per node) from `OrgChartView`
> instead, and only calls `POST .../reporting-lines/` (create, on drag-to-reparent) and
> `DELETE .../reporting-lines/{id}/` (via `useDeleteReportingLine`). The list endpoint is
> kept for API completeness / future consumers — if you're touching this view, know that
> removing it wouldn't currently break anything in `frontend/src`.

**Org Chart** — `OrgChartView`. Read-only, denormalized tree: one query set with
`prefetch_related` builds every node (name, avatar, job title, manager, departments,
teams) in a single request. Frontend: `OrgChartPage.jsx` renders this directly with no
further per-node fetching. Kept as a hand-built dict rather than a serializer because
the shape doesn't map to any single model.

---

## Real-time & background work

**`events.py`** — `broadcast_org_event(workspace_id, event_type, data)` pushes to the
workspace's WebSocket group and fans out to any active `Webhook` subscribed to that
event. Call this from a view immediately after a mutation succeeds; never let a
fan-out failure fail the request (it's caught and logged internally). Every mutation
in `views.py` fires one of these — the current key set in `_ORG_EVENT_MAP`:

`org.department.created/updated/deleted`, `org.department_member.added/removed`,
`org.team.created/updated/deleted`, `org.team_member.added/removed`,
`org.job_title.created/updated/deleted`, `org.reporting_line.created/deleted`,
`org.profile.submitted/approved/updated`.

If you add a new mutation, add its event key to `_ORG_EVENT_MAP` in the same commit —
an event not in that map still updates connected browser tabs over WebSocket but is
silently dropped for webhook subscribers.

**`tasks.py`** — Celery tasks fired by the profile lifecycle:
`notify_hr_profile_submitted` (inbox + email to admins when a member submits) and
`notify_member_profile_approved` (inbox + email to the member when approved). Both are
`.delay()`-ed from views, never called synchronously.
