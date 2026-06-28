"""
Analytics endpoint tests — covers all 4 views:
  GET /api/workspaces/<id>/analytics/summary/
  GET /api/workspaces/<id>/analytics/aggregate/
  GET /api/workspaces/<id>/analytics/team/
  GET /api/workspaces/<id>/analytics/tasks/

Run with:
  python manage.py test analytics
"""

import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from core.constants import DEFAULT_TASK_STATUSES
from projects.models import Board, Task, TaskStatus
from workspaces.models import Workspace, WorkspaceMember


# ==============================================================================
# ── SHARED SETUP ──────────────────────────────────────────────────────────────
# ==============================================================================


class AnalyticsTestBase(TestCase):
    """
    Dataset:
      2 boards (A, B) in one workspace
      2 members (owner + other_user) + 1 outsider (no membership)
      Board A: 4 statuses (Backlog, In Progress, In Review, Done[is_done=True])
      6 tasks across both boards covering priority / type / assignee / due / done

    Task summary (Board A):
      t1 — open, HIGH / BUG,     assignee=owner,       due tomorrow
      t2 — open, MEDIUM / FEAT,  assignee=other_user,  no due date
      t3 — open, URGENT / TASK,  assignee=owner,       overdue (yesterday)
      t4 — done, LOW / TASK,     assignee=other_user,  due today
      t5 — open, NO_PRIORITY / BUG, unassigned,        no due date
    Board B:
      t6 — open, HIGH / TASK,    unassigned
    """

    BASE = "/api"

    def _url(self, endpoint):
        return f"{self.BASE}/workspaces/{self.workspace.id}/analytics/{endpoint}/"

    def setUp(self):
        self.client = APIClient()

        # Users
        self.user = User.objects.create_user(
            email="owner@test.com", password="pass", full_name="Owner"
        )
        self.other_user = User.objects.create_user(
            email="member@test.com", password="pass", full_name="Member"
        )
        self.outsider = User.objects.create_user(
            email="outsider@test.com", password="pass", full_name="Outsider"
        )

        # Workspace + memberships
        self.workspace = Workspace.objects.create(name="Test WS", owner=self.user)
        WorkspaceMember.objects.create(workspace=self.workspace, user=self.user)
        WorkspaceMember.objects.create(workspace=self.workspace, user=self.other_user)

        # Board A with standard statuses
        self.board = Board.objects.create(
            workspace=self.workspace, name="Board A", created_by=self.user
        )
        created = {}
        for s in DEFAULT_TASK_STATUSES:
            ts = TaskStatus.objects.create(board=self.board, **s)
            created[s["name"]] = ts

        self.s_backlog = created["Backlog"]
        self.s_progress = created["In Progress"]
        self.s_done = created["Done"]

        # Board B — minimal
        self.board2 = Board.objects.create(
            workspace=self.workspace, name="Board B", created_by=self.user
        )
        self.s_b2_open = TaskStatus.objects.create(
            board=self.board2, name="Open", color="#aaa", order=0, is_done=False
        )

        # Date helpers
        today = datetime.date.today()
        yesterday = today - datetime.timedelta(days=1)

        # Board A tasks
        self.t1 = Task.objects.create(
            board=self.board, title="T1 open high bug",
            status=self.s_backlog,
            priority=Task.Priority.HIGH,
            task_type=Task.TaskType.BUG,
            assignee=self.user,
            created_by=self.user,
            due_date=today + datetime.timedelta(days=1),
            estimate_points=3,
        )
        self.t2 = Task.objects.create(
            board=self.board, title="T2 open medium feature",
            status=self.s_progress,
            priority=Task.Priority.MEDIUM,
            task_type=Task.TaskType.FEATURE,
            assignee=self.other_user,
            created_by=self.user,
            estimate_points=5,
        )
        self.t3 = Task.objects.create(
            board=self.board, title="T3 overdue open",
            status=self.s_backlog,
            priority=Task.Priority.HIGHEST,
            task_type=Task.TaskType.TASK,
            assignee=self.user,
            created_by=self.user,
            due_date=yesterday,
        )
        self.t4 = Task.objects.create(
            board=self.board, title="T4 done",
            status=self.s_done,
            priority=Task.Priority.LOW,
            task_type=Task.TaskType.TASK,
            assignee=self.other_user,
            created_by=self.user,
            due_date=today,
        )
        self.t5 = Task.objects.create(
            board=self.board, title="T5 unassigned open",
            status=self.s_backlog,
            priority=Task.Priority.LOWEST,
            task_type=Task.TaskType.BUG,
            created_by=self.user,
        )

        # Board B task
        self.t6 = Task.objects.create(
            board=self.board2, title="T6 board2 open",
            status=self.s_b2_open,
            priority=Task.Priority.HIGH,
            task_type=Task.TaskType.TASK,
            created_by=self.user,
        )

        self.client.force_authenticate(user=self.user)


# ==============================================================================
# ── WorkspaceSummaryView ──────────────────────────────────────────────────────
# ==============================================================================


class WorkspaceSummaryViewTests(AnalyticsTestBase):
    """GET /analytics/summary/"""

    def _get(self, **params):
        return self.client.get(self._url("summary"), params)

    # ── auth ──────────────────────────────────────────────────────────────────

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self._get()
        self.assertEqual(resp.status_code, 401)

    def test_non_member_returns_404(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self._get()
        self.assertEqual(resp.status_code, 404)

    # ── response shape ────────────────────────────────────────────────────────

    def test_returns_200_and_expected_keys(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        for key in ("total", "open", "done", "overdue"):
            self.assertIn(key, resp.data)

    # ── correct counts (all boards) ───────────────────────────────────────────

    def test_total_is_all_workspace_tasks(self):
        resp = self._get()
        # 5 board-A tasks + 1 board-B task
        self.assertEqual(resp.data["total"], 6)

    def test_open_excludes_done_tasks(self):
        resp = self._get()
        # t4 is done; t1, t2, t3, t5, t6 are open
        self.assertEqual(resp.data["open"], 5)

    def test_done_count(self):
        resp = self._get()
        self.assertEqual(resp.data["done"], 1)

    def test_overdue_counts_only_open_past_due(self):
        resp = self._get()
        # only t3 is overdue (past due_date AND status not done)
        self.assertEqual(resp.data["overdue"], 1)

    # ── board filter ──────────────────────────────────────────────────────────

    def test_board_filter_scopes_to_single_board(self):
        resp = self._get(board=str(self.board.id))
        self.assertEqual(resp.data["total"], 5)  # board A only

    def test_board_filter_done_count(self):
        resp = self._get(board=str(self.board.id))
        self.assertEqual(resp.data["done"], 1)

    def test_board_filter_open_count(self):
        resp = self._get(board=str(self.board.id))
        self.assertEqual(resp.data["open"], 4)

    # ── assignee filter ───────────────────────────────────────────────────────

    def test_assignee_filter(self):
        resp = self._get(assignee=str(self.user.id))
        # t1, t3 assigned to owner (both open; t3 overdue)
        self.assertEqual(resp.data["total"], 2)
        self.assertEqual(resp.data["open"], 2)
        self.assertEqual(resp.data["overdue"], 1)

    # ── priority filter ───────────────────────────────────────────────────────

    def test_priority_filter(self):
        resp = self._get(priority="high")
        # t1 (board A) + t6 (board B) are HIGH
        self.assertEqual(resp.data["total"], 2)

    def test_priority_multi_value(self):
        resp = self._get(priority="high,medium")
        # t1 HIGH, t2 MEDIUM, t6 HIGH = 3
        self.assertEqual(resp.data["total"], 3)


# ==============================================================================
# ── AnalyticsAggregateView ────────────────────────────────────────────────────
# ==============================================================================


class AnalyticsAggregateViewTests(AnalyticsTestBase):
    """GET /analytics/aggregate/"""

    def _get(self, **params):
        return self.client.get(self._url("aggregate"), params)

    # ── auth ──────────────────────────────────────────────────────────────────

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self._get(group_by="status")
        self.assertEqual(resp.status_code, 401)

    def test_non_member_returns_404(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self._get(group_by="status")
        self.assertEqual(resp.status_code, 404)

    # ── response shape ────────────────────────────────────────────────────────

    def test_returns_200(self):
        resp = self._get(group_by="status")
        self.assertEqual(resp.status_code, 200)

    def test_top_level_keys_present(self):
        resp = self._get(group_by="status")
        for key in ("summary", "group_by", "metric", "groups"):
            self.assertIn(key, resp.data, f"Missing key: {key}")

    def test_summary_keys_present(self):
        resp = self._get(group_by="status")
        for key in ("total", "open", "done", "overdue", "stale", "blocked"):
            self.assertIn(key, resp.data["summary"], f"Missing summary key: {key}")

    def test_groups_contains_requested_dim(self):
        resp = self._get(group_by="priority")
        self.assertIn("priority", resp.data["groups"])

    def test_group_result_keys(self):
        resp = self._get(group_by="status")
        group = resp.data["groups"]["status"]
        for key in ("results", "total_groups", "page", "page_size", "has_more"):
            self.assertIn(key, group, f"Missing group key: {key}")

    def test_result_item_keys(self):
        resp = self._get(group_by="status")
        item = resp.data["groups"]["status"]["results"][0]
        for key in ("key", "label", "value"):
            self.assertIn(key, item)

    # ── summary counts ────────────────────────────────────────────────────────

    def test_summary_total(self):
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["total"], 6)

    def test_summary_open(self):
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["open"], 5)

    def test_summary_done(self):
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["done"], 1)

    def test_summary_overdue(self):
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["overdue"], 1)

    def test_summary_blocked_is_zero_without_deps(self):
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["blocked"], 0)

    def test_summary_stale_default_30_days(self):
        # All tasks were just created, so stale (open AND created > 30 days ago) = 0
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["stale"], 0)

    def test_summary_stale_with_old_task(self):
        # Back-date one open task to 31 days ago so it appears stale with default stale_days=30
        Task.objects.filter(id=self.t5.id).update(
            created_at=timezone.now() - datetime.timedelta(days=31)
        )
        resp = self._get(group_by="status")
        self.assertEqual(resp.data["summary"]["stale"], 1)

    # ── multi-group_by ────────────────────────────────────────────────────────

    def test_multi_group_by_returns_all_dims(self):
        resp = self._get(group_by="status,priority,type,assignee")
        self.assertEqual(resp.status_code, 200)
        for dim in ("status", "priority", "type", "assignee"):
            self.assertIn(dim, resp.data["groups"])

    def test_group_by_list_in_response_matches_request(self):
        resp = self._get(group_by="priority,type")
        self.assertEqual(sorted(resp.data["group_by"]), sorted(["priority", "type"]))

    def test_unknown_group_by_dim_silently_dropped(self):
        resp = self._get(group_by="status,nonexistent")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("status", resp.data["groups"])
        self.assertNotIn("nonexistent", resp.data["groups"])

    def test_all_unknown_dims_falls_back_to_status(self):
        resp = self._get(group_by="nonexistent")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("status", resp.data["groups"])

    def test_duplicate_dims_deduplicated(self):
        resp = self._get(group_by="status,status,priority")
        self.assertEqual(resp.data["group_by"].count("status"), 1)

    # ── group results correctness ─────────────────────────────────────────────

    def test_status_group_values_sum_to_total(self):
        resp = self._get(group_by="status", board=str(self.board.id))
        total = resp.data["summary"]["total"]
        result_sum = sum(r["value"] for r in resp.data["groups"]["status"]["results"])
        self.assertEqual(result_sum, total)

    def test_priority_group_high_count(self):
        resp = self._get(group_by="priority", board=str(self.board.id))
        results = {r["label"]: r["value"] for r in resp.data["groups"]["priority"]["results"]}
        self.assertEqual(results.get("High", 0), 1)  # only t1 (board A)

    def test_type_group_bug_count(self):
        resp = self._get(group_by="type", board=str(self.board.id))
        results = {r["label"]: r["value"] for r in resp.data["groups"]["type"]["results"]}
        self.assertEqual(results.get("Bug", 0), 2)  # t1 + t5

    def test_assignee_group_unassigned_tasks(self):
        resp = self._get(group_by="assignee", board=str(self.board.id))
        results = resp.data["groups"]["assignee"]["results"]
        unassigned = next((r for r in results if r["label"] == "Unassigned"), None)
        self.assertIsNotNone(unassigned)
        self.assertEqual(unassigned["value"], 1)  # t5

    def test_status_color_included_in_status_group(self):
        resp = self._get(group_by="status")
        item = resp.data["groups"]["status"]["results"][0]
        self.assertIn("color", item)

    # ── metric param ─────────────────────────────────────────────────────────

    def test_metric_count_is_default(self):
        resp = self._get(group_by="priority")
        self.assertEqual(resp.data["metric"], "count")

    def test_metric_story_points(self):
        resp = self._get(group_by="assignee", metric="story_points", board=str(self.board.id))
        self.assertEqual(resp.data["metric"], "story_points")
        results = {r["label"]: r["value"] for r in resp.data["groups"]["assignee"]["results"]}
        # Owner has t1 (3pts) + t3 (0pts) = 3, other_user has t2 (5pts) + t4 (0pts)
        self.assertEqual(results.get("Owner", 0), 3)

    def test_invalid_metric_falls_back_to_count(self):
        resp = self._get(group_by="status", metric="invalid")
        self.assertEqual(resp.data["metric"], "count")

    # ── filter: board ─────────────────────────────────────────────────────────

    def test_board_filter_scopes_summary(self):
        resp = self._get(group_by="status", board=str(self.board.id))
        self.assertEqual(resp.data["summary"]["total"], 5)

    def test_board_filter_scopes_groups(self):
        resp = self._get(group_by="board")
        boards = {r["label"]: r["value"] for r in resp.data["groups"]["board"]["results"]}
        self.assertIn("Board A", boards)
        self.assertIn("Board B", boards)

    # ── filter: open / done ───────────────────────────────────────────────────

    def test_open_true_filter(self):
        resp = self._get(group_by="status", open="true")
        self.assertEqual(resp.data["summary"]["total"], 5)

    def test_open_false_filter_returns_only_done(self):
        resp = self._get(group_by="status", open="false")
        self.assertEqual(resp.data["summary"]["total"], 1)

    # ── filter: overdue ───────────────────────────────────────────────────────

    def test_overdue_filter(self):
        resp = self._get(group_by="priority", overdue="true")
        self.assertEqual(resp.data["summary"]["total"], 1)
        results = {r["label"]: r["value"] for r in resp.data["groups"]["priority"]["results"]}
        self.assertEqual(results.get("Highest", 0), 1)

    # ── filter: priority ─────────────────────────────────────────────────────

    def test_priority_filter_single(self):
        resp = self._get(group_by="type", priority="high")
        self.assertEqual(resp.data["summary"]["total"], 2)  # t1 + t6

    def test_priority_filter_multi(self):
        resp = self._get(group_by="status", priority="high,medium")
        self.assertEqual(resp.data["summary"]["total"], 3)  # t1 + t2 + t6

    # ── filter: assignee ─────────────────────────────────────────────────────

    def test_assignee_filter_scopes_summary(self):
        resp = self._get(group_by="priority", assignee=str(self.user.id))
        self.assertEqual(resp.data["summary"]["total"], 2)  # t1 + t3

    # ── filter: type ─────────────────────────────────────────────────────────

    def test_type_filter(self):
        resp = self._get(group_by="status", type="bug")
        # t1 + t5 = 2 bugs on board A; board B has none
        self.assertEqual(resp.data["summary"]["total"], 2)

    # ── filter: search ────────────────────────────────────────────────────────

    def test_search_filter(self):
        resp = self._get(group_by="status", search="overdue")
        self.assertEqual(resp.data["summary"]["total"], 1)  # only t3

    def test_search_case_insensitive(self):
        resp = self._get(group_by="status", search="OVERDUE")
        self.assertEqual(resp.data["summary"]["total"], 1)

    # ── filter: created_before / created_after ────────────────────────────────

    def test_created_after_recent_returns_all(self):
        # created_after=1d → tasks created in the last 1 day; all setUp tasks qualify
        resp = self._get(group_by="status", created_after="1d")
        self.assertEqual(resp.data["summary"]["total"], 6)

    def test_created_before_old_cutoff_returns_zero(self):
        # created_before=1d → tasks created before yesterday; none qualify (just created)
        resp = self._get(group_by="status", created_before="1d")
        self.assertEqual(resp.data["summary"]["total"], 0)

    def test_created_after_far_future_returns_zero(self):
        # Cutoff in the future means no tasks qualify
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        resp = self._get(group_by="status", created_after=tomorrow)
        self.assertEqual(resp.data["summary"]["total"], 0)

    # ── pagination ────────────────────────────────────────────────────────────

    def test_page_size_caps_results(self):
        resp = self._get(group_by="status", board=str(self.board.id), page_size=1)
        group = resp.data["groups"]["status"]
        self.assertEqual(len(group["results"]), 1)
        self.assertTrue(group["has_more"])

    def test_page_2_returns_next_slice(self):
        resp1 = self._get(group_by="priority", board=str(self.board.id), page_size=2, page=1)
        resp2 = self._get(group_by="priority", board=str(self.board.id), page_size=2, page=2)
        keys1 = [r["key"] for r in resp1.data["groups"]["priority"]["results"]]
        keys2 = [r["key"] for r in resp2.data["groups"]["priority"]["results"]]
        self.assertEqual(len(set(keys1) & set(keys2)), 0, "Pages should not overlap")

    def test_page_size_max_capped_at_50(self):
        resp = self._get(group_by="status", page_size=999)
        self.assertEqual(resp.data["groups"]["status"]["page_size"], 50)


# ==============================================================================
# ── TeamWorkloadView ──────────────────────────────────────────────────────────
# ==============================================================================


class TeamWorkloadViewTests(AnalyticsTestBase):
    """GET /analytics/team/"""

    def _get(self, **params):
        return self.client.get(self._url("team"), params)

    # ── auth ──────────────────────────────────────────────────────────────────

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self._get()
        self.assertEqual(resp.status_code, 401)

    def test_non_member_returns_404(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self._get()
        self.assertEqual(resp.status_code, 404)

    # ── response shape ────────────────────────────────────────────────────────

    def test_returns_200(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)

    def test_returns_paginated_results(self):
        resp = self._get()
        self.assertIn("results", resp.data)

    def test_member_row_has_required_fields(self):
        resp = self._get()
        self.assertGreater(len(resp.data["results"]), 0)
        member = resp.data["results"][0]
        for field in ("assigned", "open", "overdue", "completed", "days"):
            self.assertIn(field, member, f"Missing top-level field: {field}")
        for field in ("id", "email", "full_name"):
            self.assertIn(field, member["user"], f"Missing user field: {field}")

    def test_days_map_has_correct_window_size(self):
        resp = self._get(days=7)
        member = resp.data["results"][0]
        self.assertEqual(len(member["days"]), 7)

    # ── correct member counts ─────────────────────────────────────────────────

    def test_only_members_with_assigned_tasks_appear(self):
        # t5, t6 are unassigned — only owner and other_user should appear
        resp = self._get()
        emails = {m["user"]["email"] for m in resp.data["results"]}
        self.assertIn("owner@test.com", emails)
        self.assertIn("member@test.com", emails)
        self.assertNotIn("outsider@test.com", emails)

    def test_owner_assigned_count(self):
        resp = self._get()
        owner_row = next(
            m for m in resp.data["results"] if m["user"]["email"] == "owner@test.com"
        )
        # t1 + t3 assigned to owner
        self.assertEqual(owner_row["assigned"], 2)

    def test_owner_open_count(self):
        resp = self._get()
        owner_row = next(
            m for m in resp.data["results"] if m["user"]["email"] == "owner@test.com"
        )
        self.assertEqual(owner_row["open"], 2)  # t1 + t3 both open

    def test_owner_overdue_count(self):
        resp = self._get()
        owner_row = next(
            m for m in resp.data["results"] if m["user"]["email"] == "owner@test.com"
        )
        self.assertEqual(owner_row["overdue"], 1)  # only t3

    def test_other_user_completed_count(self):
        resp = self._get()
        other_row = next(
            m for m in resp.data["results"] if m["user"]["email"] == "member@test.com"
        )
        self.assertEqual(other_row["completed"], 1)  # t4

    # ── board filter ──────────────────────────────────────────────────────────

    def test_board_filter_limits_rollup(self):
        # On board A, owner has t1+t3; other_user has t2+t4
        resp = self._get(board=str(self.board.id))
        self.assertEqual(resp.status_code, 200)
        emails = {m["user"]["email"] for m in resp.data["results"]}
        # Both assigned on board A
        self.assertIn("owner@test.com", emails)
        self.assertIn("member@test.com", emails)


# ==============================================================================
# ── TaskDrilldownView ─────────────────────────────────────────────────────────
# ==============================================================================


class TaskDrilldownViewTests(AnalyticsTestBase):
    """GET /analytics/tasks/"""

    def _get(self, **params):
        return self.client.get(self._url("tasks"), params)

    # ── auth ──────────────────────────────────────────────────────────────────

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self._get()
        self.assertEqual(resp.status_code, 401)

    def test_non_member_returns_404(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self._get()
        self.assertEqual(resp.status_code, 404)

    # ── response shape ────────────────────────────────────────────────────────

    def test_returns_200(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)

    def test_returns_all_workspace_tasks(self):
        resp = self._get()
        self.assertEqual(len(resp.data["results"]), 6)

    def test_task_row_has_required_fields(self):
        resp = self._get()
        task = resp.data["results"][0]
        for field in ("id", "title", "priority", "status", "assignee"):
            self.assertIn(field, task, f"Missing field: {field}")

    # ── ordering ──────────────────────────────────────────────────────────────

    def test_default_order_recent_newest_first(self):
        resp = self._get(order="recent")
        ids = [t["id"] for t in resp.data["results"]]
        # UUIDv7 is time-sortable; t6 was created last so it comes first
        self.assertEqual(ids[0], str(self.t6.id))

    def test_order_oldest_oldest_first(self):
        resp = self._get(order="oldest")
        ids = [t["id"] for t in resp.data["results"]]
        self.assertEqual(ids[0], str(self.t1.id))

    def test_order_due_only_returns_tasks_with_due_date(self):
        resp = self._get(order="due")
        # t2, t5, t6 have no due_date; only t1, t3, t4 should appear
        self.assertEqual(len(resp.data["results"]), 3)

    def test_order_due_most_overdue_first(self):
        resp = self._get(order="due")
        titles = [t["title"] for t in resp.data["results"]]
        # t3 is yesterday (most overdue), t4 today, t1 tomorrow
        self.assertEqual(titles[0], self.t3.title)

    # ── filter: board ─────────────────────────────────────────────────────────

    def test_board_filter(self):
        resp = self._get(board=str(self.board.id))
        self.assertEqual(len(resp.data["results"]), 5)

    def test_board_filter_excludes_other_board(self):
        resp = self._get(board=str(self.board2.id))
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["title"], self.t6.title)

    # ── filter: open / done ───────────────────────────────────────────────────

    def test_open_true_filter(self):
        resp = self._get(open="true")
        self.assertEqual(len(resp.data["results"]), 5)

    def test_open_false_filter(self):
        resp = self._get(open="false")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["title"], self.t4.title)

    # ── filter: overdue ───────────────────────────────────────────────────────

    def test_overdue_filter(self):
        resp = self._get(overdue="true")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["title"], self.t3.title)

    # ── filter: assignee ─────────────────────────────────────────────────────

    def test_assignee_filter(self):
        resp = self._get(assignee=str(self.user.id))
        self.assertEqual(len(resp.data["results"]), 2)
        titles = {t["title"] for t in resp.data["results"]}
        self.assertIn(self.t1.title, titles)
        self.assertIn(self.t3.title, titles)

    # ── filter: priority ─────────────────────────────────────────────────────

    def test_priority_filter(self):
        resp = self._get(priority="highest")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["title"], self.t3.title)

    # ── filter: type ─────────────────────────────────────────────────────────

    def test_type_filter(self):
        resp = self._get(type="bug")
        self.assertEqual(len(resp.data["results"]), 2)

    # ── filter: search ────────────────────────────────────────────────────────

    def test_search_filter(self):
        resp = self._get(search="done")
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["title"], self.t4.title)

    # ── pagination ────────────────────────────────────────────────────────────

    def test_page_size_limits_results(self):
        resp = self._get(page_size=2)
        self.assertEqual(len(resp.data["results"]), 2)
        self.assertIsNotNone(resp.data.get("next"))

    def test_next_cursor_navigates_to_next_page(self):
        resp1 = self._get(page_size=2)
        next_url = resp1.data["next"]
        self.assertIsNotNone(next_url)
        resp2 = self.client.get(next_url)
        self.assertEqual(resp2.status_code, 200)
        ids1 = {t["id"] for t in resp1.data["results"]}
        ids2 = {t["id"] for t in resp2.data["results"]}
        self.assertEqual(len(ids1 & ids2), 0, "Pages must not overlap")

    def test_combined_filters(self):
        # Open + HIGH priority across all boards
        resp = self._get(open="true", priority="high")
        self.assertEqual(len(resp.data["results"]), 2)  # t1 + t6
