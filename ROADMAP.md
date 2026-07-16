
## vG.1 — Mobile PWA (Week 27)

> Status: Complete ✅
> **Scope:** The highest-value mobile flows only — not full feature parity. Full feature parity is a separate milestone.

**What ships**
- Full responsive redesign pass: every existing page usable at 375px without horizontal scroll
- Mobile navigation: bottom tab bar (Home / Projects / My Work / HR / + Create)
- Mobile Kanban: horizontal swipe-snap columns, full-width task cards
- Mobile HR: clock in/out from a single large button; approve/reject leave from a notification tap
- PWA manifest + service worker: installable on iOS/Android home screen, task lists readable offline (read-only cache)
- Web Push notifications (VAPID) for key events: task assigned, leave request, approval needed

---

## vG.2 — Billing & Plans (Week 28)

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

**Workspace Creation Enforcement (implement alongside billing)**

> Currently `can_create_workspace` defaults to `True` for all signups and is never flipped after workspace creation — meaning any registered user can create unlimited workspaces. This must be fixed before billing goes live.

Real-world model (how Jira / ClickUp enforce it):
- A **buyer** purchases a subscription → they get one workspace slot.
- A **member invited by the buyer** never gets a workspace slot — they join an existing workspace.
- If the buyer **deletes their workspace**, they get their slot back and can create a new one.
- No subscription = no workspace. The product is not usable without one (or a trial).

Backend changes required:

| File | Change |
|------|--------|
| `accounts/models.py` | `can_create_workspace = models.BooleanField(default=False)` + new migration — new signups are blocked by default |
| `workspaces/serializers.py` → `WorkspaceSerializer.create()` | After workspace is created, set `request.user.can_create_workspace = False` — consumes the slot |
| `workspaces/views.py` → `WorkspaceDetailView.delete()` | On deletion, `workspace.owner.can_create_workspace = True` — returns the slot to the owner |
| Stripe webhook handler (`customer.subscription.created`) | Set `can_create_workspace = True` for the subscribing user — this is the moment the slot is granted |
| Stripe webhook handler (`customer.subscription.deleted`) | Set `can_create_workspace = False` — revoke slot on cancellation/lapse |
| Trial flow | On free trial start (new signup CTA), set `can_create_workspace = True` for 14 days; revert on trial expiry if no subscription |

Onboarding gate:
- New signups land on a **"Start your trial"** page, not the workspace creation form.
- Trial activation sets `can_create_workspace = True` → they proceed to create their workspace.
- Users who sign up via an invite link skip this entirely — `can_create_workspace` stays `False`, they go straight to the workspace they were invited to.

**Frontend**

- **Billing page** `/w/:ws/settings/billing`: current plan card, usage bars, upgrade CTA, invoice history with PDF download
- Feature gate UX: locked features show "Upgrade to Pro" modal with 3 bullet reasons + CTA — never an error toast or redirect
- Trial countdown banner in the workspace header: "9 days left in your Pro trial"
- Plan badge in workspace switcher ("Free" / "Pro" / "Business" chip)

**Transfer Ownership (implement alongside billing)**

> Ownership transfer is a billing-time concern: the new owner inherits the subscription seat and workspace creation slot; the old owner loses theirs.

Backend:
- `POST /api/workspaces/:id/transfer-ownership/` — owner-only endpoint; body `{ "member_id": "<uuid>" }` 
- Validates the target is an existing workspace member
- Atomically: sets `workspace.owner = target_user`, re-assigns the Admin system role to the new owner, demotes the old owner to Member role
- Flips `can_create_workspace`: `True` → new owner, `False` → old owner (slot transfer)
- Emits a `workspace.ownership_transferred` audit log entry

Frontend — Settings page → Danger Zone (owner only):
- "Transfer Ownership" button opens a modal: member picker (searchable list of current members, excludes self) + confirmation input (type workspace name to confirm)
- On success: navigates old owner to `/onboarding` or their next workspace (they are no longer owner and lose admin access)
- New owner sees no disruption — workspace stays open, they now have the Admin role

---

## vG.3 — Public Landing Page (Week 29)

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

## vG.4 — Launch Prep (Week 30)

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

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## POST-LAUNCH — FUTURE RELEASE

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> These items are deferred until after the platform launch (Phase G). They are fully specced and ready to pick up — not needed for initial launch but natural next steps once the core ecosystem is live.

---

## vE.4 — App Setup Flows & Cross-App Roster Import

> Status: DEFERRED 🔜 — Step 1 (welcome screen) shipped in Phase E; steps 2–4 (roster import wizard) ship here post-launch.
> **Intent:** When an admin enables a new app, give them a guided setup flow that seeds the app with the right members in one action — not a manual re-invite process. This is the headline convenience feature of the ecosystem.

**Frontend — App Setup Wizard (shown on first visit to a newly-enabled app)**

- Step 1: Welcome screen — what this app does, what setup is needed ✅ (already shipped)
- Step 2: **"Import members from another app"** — admin picks a source app (e.g. "Projects") and a role mapping: "Projects Admin → HR Manager, Projects Member → HR Member, Projects Viewer → HR Viewer"; preview shows who will be added with which role
- Step 3: Confirm & apply — backend bulk-creates `RoleAssignment` records scoped to the target app's permission set
- Step 4: Done — links to the app's main page

**Backend**

- `POST /api/workspaces/{ws}/apps/{app_key}/setup/seed-from-app/` — payload: `{source_app, role_mapping: [{source_role_id, target_role_id}]}`; reads existing `RoleAssignment` records for the source app's permission scope; bulk-creates `RoleAssignment` rows scoped to the target app; returns `{seeded: N, skipped: N}`
- Idempotent: members who already have the target app's access are skipped, not duplicated

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE F — WORKSPACE FEDERATION (Post-Launch)

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Once a workspace is fully configured — members added, roles defined, app access assigned — an admin can carry that configuration into a new JCN workspace with a single action. "Set up once, deploy everywhere."
>
> **What this is NOT:** App-to-app live data sync. Projects tasks do not flow into HR records. HR leave data does not appear in project boards. This phase is purely about user identity and access configuration — not operational data integration between apps.
>
> **Depends on:** Phase G (billing & plans) being live — federation is most valuable to paying customers managing multiple workspaces.

---

## vF.1 — Cross-Workspace Member Seeding

> Status: PLANNED 📋
> **Intent:** An organization running multiple JCN workspaces (e.g. one per client account, one per subsidiary) can onboard a new workspace's member roster from an existing one in one click — no manual re-inviting of every person.

**Backend**

- `FederationLink` model: `source_workspace` FK, `target_workspace` FK, `created_by` FK, `role_mapping` JSONField (`[{source_role_id, target_role_id}]`), `created_at` — records which workspace was seeded from which
- `POST /api/workspaces/{ws}/federation/seed/` — payload: `{source_workspace_slug, role_mapping}`; reads `WorkspaceMember` roster from the source workspace (caller must be admin of both); bulk-creates `WorkspaceInvite` rows (or direct `WorkspaceMember` if user already has a JCN account) in the target; fires invite emails for new users; returns `{seeded: N, invited: N, skipped: N}`
- Permission gate: caller must be admin of both source and target workspace — a non-admin cannot pull a roster they don't manage

**Frontend — Workspace Settings → Members → Import from workspace**

- "Import members" button in the members page header
- Modal: workspace picker (lists workspaces the admin manages), role mapping table (source roles left, target role dropdowns right), preview of members to be added with their mapped role, confirm button
- Progress toast: "Seeding 47 members…" with live count update

---

## vF.2 — Federation Dashboard & Audit

> Status: PLANNED 📋
> **Intent:** Give admins visibility into which workspaces are federated, when the last seed happened, and what the role mapping looks like — so cross-workspace access is manageable and auditable.

**Backend**

- `GET /api/workspaces/{ws}/federation/` — returns `FederationLink` records where this workspace is source or target; includes `member_count`, `last_seeded_at`, `role_mapping`
- `DELETE /api/workspaces/{ws}/federation/{id}/` — removes the link record (does NOT remove already-added members; this is a record-keeping action, not a sync revocation)
- All seed operations logged to `AuditEvent` (already exists from v2.1.0) with action `federation.seed`

**Frontend — Workspace Settings → Federation tab**

- Federation card per linked workspace: name, direction (source / target), member count seeded, last seed date, role mapping summary, "Re-seed" button (adds any new members that joined the source since last seed), "Remove link" button
- Audit log: filter `AuditEvent` by `federation.*` to see full seeding history with actor + timestamp
- Empty state: "No federated workspaces yet" with explanation and "Import members from another workspace" CTA

---



---

# BEYOND 6 MONTHS — ECOSYSTEM DEPTH

> The phases below extend the ecosystem after the initial launch. They are sequenced — each one builds on what came before it.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## PHASE H — AUTOMATION ENGINE REBUILD

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** Replace the v1 signal-based, projects-only automation engine with a proper async workflow system that spans every app in the ecosystem.
>
> **Why a rebuild and not an extension:** The v1 engine (v2.7.0) has three hard limitations — it is synchronous (blocks the request thread), it is scoped to `projects` only, and it has no scheduled/time-based triggers. With HR and Org live, teams need cross-app workflows like "when a leave request is approved → post to Slack → update the team calendar → create a handover task." That flow touches three apps and requires async execution. Patching v1 to do this creates more tech debt than starting clean.
>
> **Depends on:** Phase C (HR) and Phase B (Org) being live — the new trigger surface is only valuable when there are multiple apps to wire together.

---

## vH.1 — Async Execution Engine (Backend)

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

## vH.2 — Visual Flow Builder (Frontend)

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

## PHASE I — RECRUITMENT & ATS

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **Goal:** End-to-end hiring pipeline — from job posting to signed offer — with a hired candidate automatically becoming a workspace member and employee record.
>
> **Why small businesses need this:** Most small teams manage hiring in a spreadsheet or Notion doc. An ATS that lives inside the same workspace as their projects and HR data means no context-switching and no duplicate data entry when someone gets hired.
>
> **Depends on:** Phase B (Org Structure — departments and job titles) and Phase C (HR — a hired candidate flows directly into `EmployeeProfile`).

---

## vI.1 — Job Postings & Candidate Pipeline (Backend)

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

## vI.2 — Recruitment Frontend

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

---

## Security — Rate Limiting & Brute-Force Protection

> Status: RESEARCH NEEDED 🔬
>
> **Context:** During auth flow fixes (invite + email verification bug) we identified a gap — no protection against brute-force login, inbox flooding (resend verification / password reset spam), or simultaneous duplicate requests. A partial implementation was started but paused because the right approach needs more thought before committing backend infrastructure.

### What needs solving

**1. Login brute-force**
Prevent an attacker from trying thousands of passwords against a single account. Current state: no limit — unlimited attempts allowed.

Candidate approach: per-user Redis counter with exponential backoff (`3^n` seconds: 3 → 9 → 27 → 81) and account blocking after 5 consecutive failures. Only a workspace admin can unblock. Needs research: how do we handle shared IPs (office NAT), VPNs, and the unblock UX for admins?

**2. Email flooding (password reset + resend verification)**
Prevent an attacker from hammering `POST /api/auth/password/reset/` or `POST /api/auth/registration/resend-email/` to flood a user's inbox. Current state: no limit.

Candidate approach: DRF `ScopedRateThrottle` backed by Redis cache (e.g. 3–5 requests/hour per IP). Needs research: right threshold so legitimate users (who may be behind a shared IP) aren't blocked.

**3. Duplicate / simultaneous request prevention**
Prevent a user double-clicking a button or a script from firing the same mutating request twice in rapid succession. Often called "idempotency". Current state: no deduplication — two simultaneous `POST /invites/` calls for the same email both go through.

Candidate approach: Redis-based per-user-per-endpoint lock (`SET NX EX`). Needs research: correct TTL, how to distinguish intentional retries from accidental duplicates, and whether this belongs in middleware vs per-view.

### Questions to resolve before implementing

- Which package to use for Redis-backed DRF throttling — `django-redis` + `DEFAULT_THROTTLE_CLASSES`, or a standalone solution?
- How granular should the lockout be — IP only, email only, or both?
- What is the admin unblock UX — a button on `MembersPage`, or a separate blocked-accounts list?
- Does idempotency belong at the middleware level or should individual views opt in?
- Frontend: should the cooldown timer be shown to the user during a backoff window, and how does that interact with the existing error state in `LoginPage`?

### Files that will be touched when this is implemented

**Backend:** `accounts/models.py` (`is_blocked` field), `accounts/throttles.py` (new), `accounts/views.py` (`CustomLoginView`), `core/settings.py` (`CACHES` + `REST_FRAMEWORK` throttle config), `core/urls.py` (prepend custom login URL), `workspaces/views.py` + `urls.py` (unblock endpoint)

**Frontend:** `LoginPage.jsx` (cooldown timer + blocked message), `MembersPage.jsx` (blocked badge + unblock button for admins)

---

## Beyond Phase G

| Phase | Name | App | Status |
|-------|------|-----|--------|
| H | Automation Engine Rebuild | `automations/` | 📋 Planned |
| I | Recruitment & ATS | `recruitment/` | 📋 Planned |


# JCN Backend — Changelog & Roadmap

---

## vD.2 — App-Level RBAC Permission Classes (Planned)

**Status:** Not started. Design agreed; deferred to future sprint.

### Problem

App access is currently enforced by a helper function called inside each view:

```python
# hr/views.py
def _require_module(request, workspace):
    require_app_access(request.user, workspace, "hr")

class LeaveRequestListView(APIView):
    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(request, workspace)   # ← every handler, manually
        ...
```

This is error-prone in two ways:
1. **Forgetting to call it** — a new view or a new HTTP method on an existing view can silently skip the check.
2. **No single place to look** — to verify that the "hr" app is gated, you have to read every view handler individually.

The same problem applies to fine-grained permission checks (`_require_admin`, etc.).

### Solution — DRF Permission Classes

Django REST Framework's `permission_classes` runs before any handler code, is declared at the class level (one place per view), and composes cleanly with `IsAuthenticated`.

**Design:**

```python
# workspaces/drf_permissions.py

from rest_framework.permissions import BasePermission
from .permissions import has_app_access, resolve_permission


class RequiresAppAccess(BasePermission):
    """
    Gate an entire view on app-level access.
    The view must expose get_workspace() returning a Workspace instance.

    Usage:
        class HRListView(APIView):
            permission_classes = [IsAuthenticated, RequiresAppAccess("hr")]
    """
    def __init__(self, app_key: str):
        self.app_key = app_key

    def has_permission(self, request, view):
        workspace = view.get_workspace()
        return has_app_access(request.user, workspace, self.app_key)

    def message(self):
        return f"You do not have access to this app."


class RequiresPermission(BasePermission):
    """
    Gate a view on a specific fine-grained permission key.
    Looks up the app from the registry — caller just passes the perm key.

    Usage:
        class LeaveApprovalView(APIView):
            permission_classes = [IsAuthenticated, RequiresPermission("hr.manage_leave")]
    """
    def __init__(self, perm_key: str):
        self.perm_key = perm_key

    def has_permission(self, request, view):
        workspace = view.get_workspace()
        return resolve_permission(request.user, workspace, self.perm_key)
```

**View pattern — every view exposes `get_workspace()`:**

```python
class LeaveRequestListView(APIView):
    permission_classes = [IsAuthenticated, RequiresAppAccess("hr")]

    def get_workspace(self):
        # Called once by the permission class before any handler runs.
        # Cache it on self so handler methods don't fetch it again.
        if not hasattr(self, "_workspace"):
            from workspaces.models import Workspace
            self._workspace = get_object_or_404(
                Workspace, id=self.kwargs["workspace_id"], members__user=self.request.user
            )
        return self._workspace

    def get(self, request, workspace_id):
        workspace = self.get_workspace()   # free — cached above
        requests = LeaveRequest.objects.filter(workspace=workspace)
        ...
```

**Why this achieves "one place to change":**
- Add a new app? Register it in `APP_REGISTRY` (constants.py) — permission classes resolve automatically.
- Change which app key a view belongs to? Update `permission_classes` on the view class — one line.
- Add a new view for an existing app? Declare `permission_classes = [IsAuthenticated, RequiresAppAccess("hr")]` — impossible to forget, because nothing works without it.

### Implementation Scope

1. Create `workspaces/drf_permissions.py` with `RequiresAppAccess` and `RequiresPermission`.
2. Add `get_workspace()` mixin (e.g. `WorkspaceScopedMixin`) that views inherit from — eliminates boilerplate.
3. Migrate `hr/views.py` — remove `_require_module`, declare `permission_classes` on each view class.
4. Migrate `organization/views.py` — same.
5. Migrate `projects/views/board.py` — replace `has_app_access()` inline calls.
6. Remove the `_require_module` helper from both `hr/views.py` and `organization/views.py`.

---

## vD.1 — Two-Level RBAC: App Access + Nested Permissions (Completed)

### What changed

Replaced the flat permission dict + module system with a two-level model:

| Level | Field | What it controls |
|-------|-------|-----------------|
| App access | `CustomRole.app_access` | Can the user enter this product area at all? |
| Internal | `CustomRole.permissions` | Fine-grained actions within an app |

**Before:**
```python
# Flat permissions + separate WorkspaceModule rows for app gating
role.permissions = {"task.create": True, "hr.view": True, "settings.manage": False}
require_module(workspace, "hr_management")  # separate gate
```

**After:**
```python
# Two JSONFields on CustomRole — no module rows needed
role.app_access   = {"projects": True, "hr": True, "org": False, "analytics": False}
role.permissions  = {
    "workspace": {"settings.manage": False, "member.invite": True, ...},
    "projects":  {"task.create": True, "project.delete": False, ...},
    "hr":        {"hr.manage_leave": True, "hr.manage_attendance": False},
    "org":       {"org.manage": False},
}
```

### Files changed

| File | Change |
|------|--------|
| `workspaces/constants.py` | `APP_REGISTRY` + `PERMISSIONS` (nested) + `SYSTEM_ROLE_PERMISSIONS` — single source of truth |
| `core/modules.py` | Stripped to thin shim; `MODULE_REGISTRY = APP_REGISTRY` for backwards compat |
| `workspaces/permissions.py` | New: `has_app_access`, `require_app_access`, `has_permission`, `resolve_permission`, `_PERM_TO_APP` reverse map |
| `workspaces/models.py` | Added `app_access = JSONField(default=dict)` to `CustomRole` |
| `workspaces/rbac.py` | `has_workspace_permission` delegates to `resolve_permission`; `create_system_roles` sets both `app_access` and `permissions` |
| `workspaces/serializers.py` | `CustomRoleSerializer`: removed `permission_definitions`, added `app_access`, validates nested structure |
| `workspaces/views.py` | Added `WorkspacePermissionsView` (`GET /permissions/`) |
| `workspaces/urls.py` | Registered `permissions/` endpoint |
| `projects/views/board.py` | Replaced `has_workspace_permission("projects.view")` with `has_app_access("projects")` |
| `hr/views.py` | Replaced `require_module(workspace, "hr_management")` with `require_app_access(user, workspace, "hr")` |
| `organization/views.py` | Replaced `require_module(workspace, "org_structure")` with `require_app_access(user, workspace, "org")` |

### How to add a new app in the future

1. Add entry to `APP_REGISTRY` in `workspaces/constants.py`
2. Add its `permissions` block in `PERMISSIONS`
3. Add its defaults to `SYSTEM_ROLE_PERMISSIONS` for all three system roles
4. Run `makemigrations` (no code change — JSONField expands automatically)
5. Frontend picks up the new app automatically from `GET /api/workspaces/{ws}/permissions/`

### How to add a new permission in the future

1. Add it under the correct app key in `PERMISSIONS` (constants.py)
2. Update `SYSTEM_ROLE_PERMISSIONS` for all three roles
3. Done — serializer validation, role editor UI, and the `/permissions/` endpoint all derive from this dict

---
