# JCN Backend — How Everything Flows

> **Who this is for.** Anyone who needs to find "where does this happen in the
> code?" fast — especially during a hotfix. It explains the backend as a set of
> **flows** (a request comes in → these files run → this comes out). If you can
> follow a recipe, you can follow this. Pair it with:
> - `BACKEND.md` — the exhaustive list of every URL, model, and task.
> - `ACCESS.md` — who is allowed to do what (permissions).

---

## 1. The pieces (what each server does)

Think of the backend as a restaurant:

| Piece | Real name | Job (in plain words) | Where it's configured |
|-------|-----------|----------------------|------------------------|
| 🧑‍🍳 The kitchen | **Django + DRF** | Handles normal web requests (login, load tasks, create a board) | `core/settings.py`, each app's `views.py` |
| 🗄️ The pantry | **PostgreSQL** | Stores all the data permanently | `DATABASES` in `core/settings.py` |
| 📣 The waiter shouting orders | **Django Channels** | Pushes live updates to open browser tabs (WebSockets) | `core/asgi.py`, `workspaces/consumers.py` |
| 📮 The order queue | **RabbitMQ** | Holds "do this later" jobs and live-update messages | `RABBITMQ_URL` in `core/settings.py` |
| 👷 The prep cook | **Celery worker** | Picks jobs off the queue and does slow work (emails, imports) | `core/celery.py`, each app's `tasks.py` |
| 🧊 The sticky-note board | **Redis** | Fast temporary memory: caching + rate-limit counters (NOT a message queue) | `REDIS_URL`, `CACHES` in `core/settings.py` |

> **One rule to remember:** **RabbitMQ moves messages** (Celery jobs + WebSocket
> broadcasts). **Redis only remembers things briefly** (cache + rate limits). They
> never do each other's job.

---

## 2. Flow A — A normal API request (the 90% case)

Example: the browser loads the list of departments.

```
Browser (React)
  │  GET /api/workspaces/<ws>/org/departments/   (Authorization: Bearer <jwt>)
  ▼
frontend/src/shared/lib/api.js         ← attaches the token, sends the request
  ▼
core/urls.py                            ← routes /api/... to the right app
  ▼
organization/urls.py                    ← matches the path → DepartmentListCreateView
  ▼
organization/views.py  (the view)       ← the code that runs
  │   1. access.authorize(request, ws, perm="org.view", scope="read")
  │        └─ workspaces/access.py checks: member? allowed? (see Flow C)
  │   2. Department.objects.filter(...)         ← reads the pantry (Postgres)
  │   3. DepartmentSerializer(...).data         ← turns rows into JSON
  ▼
Response (JSON) ───────────────────────► back to the browser
```

**To change what this endpoint returns:** edit the **view** (`organization/views.py`)
and/or the **serializer** (`organization/serializers.py`).
**To change who can call it:** change the `authorize(...)` line (see `ACCESS.md`).
**To change the URL:** edit the app's `urls.py`.

Every app follows this same shape:

| App | URLs file | Views file | Serializers file |
|-----|-----------|-----------|------------------|
| Workspaces / members / roles / API keys | `workspaces/urls.py` | `workspaces/views.py` | `workspaces/serializers.py` |
| Projects (boards, tasks, sprints, wiki…) | `projects/urls.py` | `projects/views/*.py` | `projects/serializers.py` |
| Org structure | `organization/urls.py` | `organization/views.py` | `organization/serializers.py` |
| HR | `hr/urls.py` | `hr/views.py` | `hr/serializers.py` |
| Analytics | `analytics/urls.py` | `analytics/views.py` | `analytics/serializers.py` |
| Integrations | `integrations/urls.py` | `integrations/views.py` | `integrations/serializers.py` |

---

## 3. Flow B — Logging in / who am I

```
POST /api/auth/login/  → dj-rest-auth + SimpleJWT → returns { access, refresh } (JWTs)
POST /api/auth/registration/ → allauth → (optionally) sends a verification email
GET  /api/users/me/    → accounts/views → the current user + profile
```
- Auth wiring lives in `core/settings.py` (`REST_FRAMEWORK`, `SIMPLE_JWT`, `REST_AUTH`).
- Custom email templates + Google login: `accounts/adapter.py`, `accounts/social_views.py`.
- The browser stores the JWT and `api.js` attaches it to every request. If it
  expires (401), `api.js` silently refreshes it once.

---

## 4. Flow C — "Are you allowed to do this?" (access control)

**Every** protected view calls one function: `access.authorize(...)` in
`workspaces/access.py`. That is the single front door. Full detail is in
`ACCESS.md`; the short version:

```
access.authorize(request, workspace_id, app=?, perm=?, admin=?, scope=?)
  │
  1. Find the workspace and check you're a MEMBER   (else 404)
  2. If the request used an API key: check its SCOPE (read/write/admin)
  3. If admin=True:  are you owner or do you have settings.manage?
  4. If app="people": does your role have People & HR access turned on?
  5. If perm="...":  does your role grant that exact permission?
  → returns the workspace if all checks pass, else raises 403
```

- **The workspace owner always passes** (short-circuit).
- A member's role comes from `WorkspaceMember → RoleAssignment → CustomRole`.
  There is **no** `role` column on `WorkspaceMember` — always resolve through
  `access.py`, never query a role field directly.
- The list of apps and permissions lives in **`workspaces/constants.py`**. Add a
  permission there, then reference it with `perm="..."`. Nothing else to wire.

**Hotfix tip:** if someone "can't do X but should" (or vice-versa), the answer is
almost always one `authorize(...)` line in that app's view, plus the defaults in
`workspaces/constants.py`.

---

## 5. Flow D — Live updates (WebSockets / real-time)

Used for: a task moves on one screen and everyone else's board updates instantly,
notification bell, presence.

**Part 1 — the browser connects (once):**
```
Browser opens ws://.../ws/workspaces/<uuid>/
  ▼
core/asgi.py                     ← the WebSocket entry point
  ▼
workspaces/middleware.py         ← reads the JWT from the Sec-WebSocket-Protocol
                                   subprotocol ["jwt", <token>] (or Authorization
                                   header for non-browser clients) and finds the user
  ▼
workspaces/routing.py            ← matches the URL → WorkspaceConsumer
  ▼
workspaces/consumers.py          ← WorkspaceConsumer.connect()
       └─ checks membership, then joins two groups:
            "workspace_<id>"  (everyone in the workspace)
            "user_<id>"       (just this person)
```

**Part 2 — the server pushes an update (many times):**
```
Something happens in a view or task, e.g. a department is created
  ▼
core/events.py  →  broadcast(workspace_id, event, data)   ← EVERY app uses this
       └─ also fans out to webhooks and Teams/Google Chat if the event is
          registered for those surfaces in core.events.EVENTS
  ▼
channel_layer.group_send("workspace_<id>", {...})
  ▼
RabbitMQ  ← fans the message out to every connected consumer
  ▼
workspaces/consumers.py  →  workspace_event()  →  sends JSON down each socket
  ▼
Browser receives it live (no refresh)
```

**To add a new live event:** add it to `core.events.EVENTS` (only needed if it
should reach webhooks/chat — WS-only events don't need registering), call
`broadcast(...)` right after your change succeeds, and make sure the frontend
socket handler knows the event name. Files: `core/events.py` and the consumer.

---

## 6. Flow E — Background jobs (Celery + RabbitMQ)

Used for: sending emails, running imports, webhook delivery — anything slow that
shouldn't make the user wait.

```
A view finishes its main work, then calls:
    notify_member_profile_approved.delay(profile_id)   ← ".delay()" = do this later
  ▼
RabbitMQ  ← the job sits in the "celery" queue
  ▼
Celery worker (the `celery` container)  ← picks the job up
  ▼
organization/tasks.py  →  the @shared_task function runs
       (writes InboxItem rows + WS pushes via core.events.push_inbox_items;
        emails go through core.emails.send_email)
```

- Task functions live in each app's **`tasks.py`** and are decorated `@shared_task`.
- Tasks never hand-roll fan-out or email plumbing — they call `core.events.*`
  and `core.emails.send_email` (templates stay in each app's `emails/` folder).
- The worker is started by `core/celery.py` (`celery -A core worker`).
- The view returns to the user **immediately** — the job runs in the background.
- Common tasks: `send_invite_email`, `run_import`, `deliver_webhook`
  (`workspaces/tasks.py`); `send_comment_notifications` (`projects/tasks.py`);
  `notify_hr_profile_submitted`, `notify_member_profile_approved`
  (`organization/tasks.py`).

**To add a background job:** write a `@shared_task` in the app's `tasks.py`, call
it with `.delay(args)` from your view. That's it — RabbitMQ + the worker handle
the rest.

---

## 7. Flow F — API keys & rate limiting (for scripts/integrations)

```
Request arrives with header:  Authorization: Bearer jcn_<key>
  ▼
workspaces/authentication.py  ← APIKeyAuthentication
       └─ looks the key up, sets request.user = key.created_by, request.api_key = key
  ▼
workspaces/throttling.py      ← APIKeyRateThrottle
       └─ counts requests per key in Redis; too many → 429 Too Many Requests
  ▼
the view runs → access.authorize(..., scope="read"/"write")
       └─ an API key must have the matching scope (read ⊆ write ⊆ admin)
```

- A **real user (JWT)** has no scope ceiling and no API-key rate limit.
- Rate limit value: `API_KEY_THROTTLE_RATE` env var (default `120/min`), wired in
  `core/settings.py`.
- Keys are created/revoked at `workspaces/views.py` (the API-keys endpoints).

---

## 8. "Where is the code for…?" (quick lookup)

| I want to change… | Look here |
|-------------------|-----------|
| What a URL does | that app's `views.py` (+ `urls.py` for the path) |
| The shape of a JSON response | that app's `serializers.py` |
| A database table / field | that app's `models.py` (then `makemigrations` + `migrate`) |
| Who is allowed to do something | the `authorize(...)` call in the view + `workspaces/constants.py` (see `ACCESS.md`) |
| A live/real-time update, webhook, or chat card | `core/events.py` (`broadcast()` + the `EVENTS` registry) + `workspaces/consumers.py` |
| A notification verb / inbox bell | `core/events.py` (`NOTIFICATION_VERBS`, `notify()`, `push_inbox_items()`) |
| An outgoing email | `core/emails.py` (`send_email`) + the app's `emails/*.html` templates |
| A background job (email, import) | the app's `tasks.py` + `core/celery.py` |
| Login / signup / password / Google | `accounts/` (`views`, `serializers`, `adapter.py`) + `core/settings.py` |
| Message broker / queues | RabbitMQ — `RABBITMQ_URL`, `CELERY_*`, `CHANNEL_LAYERS` in `core/settings.py` |
| Caching / rate-limit config | Redis — `REDIS_URL`, `CACHES` in `core/settings.py`; `projects/cache.py`; `workspaces/throttling.py` |
| Global config, installed apps | `core/settings.py`; routes in `core/urls.py`; ASGI in `core/asgi.py` |

---

## 9. Making a hotfix — the 4 questions

1. **What kind of thing is broken?** Use the table in §8 to jump to the right file.
2. **Is it a permission problem?** → `ACCESS.md`, then the view's `authorize(...)` line.
3. **Is it slow / async (email, import, live update)?** → the app's `tasks.py`
   (Celery) or `events.py` (WebSocket), not the view's main path.

> After any change that adds/removes a model, view, URL, task, or permission,
> update `BACKEND.md` (and `ACCESS.md` if permissions changed) in the same commit,
> so these maps never go stale.
