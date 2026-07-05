import { useEffect } from "react";
import { registerSocketHandler } from "@/shared/hooks/useWorkspaceSocket";
import {
  deptsKey,
  deptMemKey,
  teamsKey,
  teamMemKey,
  jobsKey,
  chartKey,
  profileKey,
  myProfileKey,
  pendingProfilesKey,
} from "./useOrg";

// ════════════════════════════════════════════════════════════════════════════
// People & HR events — org structure (departments, teams, job titles,
// reporting lines, onboarding profiles). Registered on the shared workspace
// socket (see useWorkspaceSocket.js) only while a people/HR page is mounted —
// same pattern as useBoardSocket for project-management.
//
// Payloads for department/team/job-title events carry the full serialized
// object (see organization/views.py broadcast() calls), so they're spliced
// into the list cache directly here — this is what keeps *other* tabs/users in
// sync; the echo on the acting client is a harmless no-op since useOrg.js's own
// mutation onSuccess already wrote the identical object.
//
// Reporting-line and profile events only carry ids, not full objects, so
// there's nothing to splice — those invalidate narrow, targeted keys instead.
// ════════════════════════════════════════════════════════════════════════════
function handlePeopleEvent(type, payload, qc, workspaceId) {
  if (type === "org.department.created") {
    qc.setQueryData(deptsKey(workspaceId), (old) =>
      old && !old.some((d) => d.id === payload.id) ? [...old, payload] : old,
    );
  }

  if (type === "org.department.updated") {
    const prev = qc
      .getQueryData(deptsKey(workspaceId))
      ?.find((d) => d.id === payload.id);
    qc.setQueryData(deptsKey(workspaceId), (old) =>
      old?.map((d) => (d.id === payload.id ? payload : d)),
    );
    // Headship isn't part of this diff — a stale membership list would still
    // show the old head's is_head flag, so refetch it when head changes.
    if (prev && prev.head?.id !== payload.head?.id) {
      qc.invalidateQueries({ queryKey: deptMemKey(workspaceId, payload.id) });
    }
  }

  if (type === "org.department.deleted") {
    qc.setQueryData(deptsKey(workspaceId), (old) =>
      old?.filter((d) => d.id !== payload.id),
    );
    qc.removeQueries({ queryKey: deptMemKey(workspaceId, payload.id) });
  }

  if (type === "org.department_member.added") {
    qc.setQueryData(deptMemKey(workspaceId, payload.department_id), (old) =>
      old && !old.some((m) => m.id === payload.id)
        ? [...old, { id: payload.id, member: payload.member, is_head: payload.is_head, joined_at: payload.joined_at }]
        : old,
    );
    qc.setQueryData(deptsKey(workspaceId), (old) =>
      old?.map((d) =>
        d.id === payload.department_id
          ? { ...d, member_count: (d.member_count || 0) + 1 }
          : d,
      ),
    );
  }

  if (type === "org.department_member.removed") {
    qc.setQueryData(deptMemKey(workspaceId, payload.department_id), (old) =>
      old?.filter((m) => m.id !== payload.id),
    );
    qc.setQueryData(deptsKey(workspaceId), (old) =>
      old?.map((d) =>
        d.id === payload.department_id
          ? { ...d, member_count: Math.max(0, (d.member_count || 1) - 1) }
          : d,
      ),
    );
  }

  if (type === "org.team.created") {
    qc.setQueryData(teamsKey(workspaceId), (old) =>
      old && !old.some((t) => t.id === payload.id) ? [...old, payload] : old,
    );
  }

  if (type === "org.team.updated") {
    const prev = qc
      .getQueryData(teamsKey(workspaceId))
      ?.find((t) => t.id === payload.id);
    qc.setQueryData(teamsKey(workspaceId), (old) =>
      old?.map((t) => (t.id === payload.id ? payload : t)),
    );
    if (prev && prev.lead?.id !== payload.lead?.id) {
      qc.invalidateQueries({ queryKey: teamMemKey(workspaceId, payload.id) });
    }
  }

  if (type === "org.team.deleted") {
    qc.setQueryData(teamsKey(workspaceId), (old) =>
      old?.filter((t) => t.id !== payload.id),
    );
    qc.removeQueries({ queryKey: teamMemKey(workspaceId, payload.id) });
  }

  if (type === "org.team_member.added") {
    qc.setQueryData(teamMemKey(workspaceId, payload.team_id), (old) =>
      old && !old.some((m) => m.id === payload.id)
        ? [...old, { id: payload.id, member: payload.member, is_lead: payload.is_lead, joined_at: payload.joined_at }]
        : old,
    );
    qc.setQueryData(teamsKey(workspaceId), (old) =>
      old?.map((t) =>
        t.id === payload.team_id
          ? { ...t, member_count: (t.member_count || 0) + 1 }
          : t,
      ),
    );
  }

  if (type === "org.team_member.removed") {
    qc.setQueryData(teamMemKey(workspaceId, payload.team_id), (old) =>
      old?.filter((m) => m.id !== payload.id),
    );
    qc.setQueryData(teamsKey(workspaceId), (old) =>
      old?.map((t) =>
        t.id === payload.team_id
          ? { ...t, member_count: Math.max(0, (t.member_count || 1) - 1) }
          : t,
      ),
    );
  }

  if (type === "org.job_title.created") {
    qc.setQueryData(jobsKey(workspaceId), (old) =>
      old && !old.some((j) => j.id === payload.id) ? [...old, payload] : old,
    );
  }

  if (type === "org.job_title.updated") {
    qc.setQueryData(jobsKey(workspaceId), (old) =>
      old?.map((j) => (j.id === payload.id ? payload : j)),
    );
  }

  if (type === "org.job_title.deleted") {
    qc.setQueryData(jobsKey(workspaceId), (old) =>
      old?.filter((j) => j.id !== payload.id),
    );
  }

  // Chart invalidate covers the root query and any already-fetched
  // "reports"/"department"/"unassigned" sub-queries (shared key prefix), but
  // NOT OrgChartPage's local expand state (childrenByNode/expanded are plain
  // component state, not query cache) — an already-expanded branch in another
  // open tab can go stale until that node is collapsed/re-expanded or the page
  // remounts. Full real-time sync of deep chart branches isn't worth the
  // state-management rewrite for how rarely org structure changes concurrently.
  if (type === "org.reporting_line.created" || type === "org.reporting_line.deleted") {
    qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
  }

  if (
    type === "org.profile.updated" ||
    type === "org.profile.submitted" ||
    type === "org.profile.approved"
  ) {
    if (payload.member_id) {
      qc.invalidateQueries({ queryKey: profileKey(workspaceId, payload.member_id) });
    }
    qc.invalidateQueries({ queryKey: myProfileKey(workspaceId) });
    qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
    if (type === "org.profile.submitted" || type === "org.profile.approved") {
      qc.invalidateQueries({ queryKey: pendingProfilesKey(workspaceId) });
    }
  }
}

/**
 * Registers people/HR event handling while a people/HR page is open. Does NOT
 * open a new socket — reuses the single connection opened by
 * useWorkspaceSocket in AppLayout.
 *
 * Mount once at the top of the people route subtree (OrgOnboardingGate,
 * which wraps every people route) — same pattern as useBoardSocket in
 * KanbanPage.
 */
export function usePeopleSocket() {
  useEffect(() => registerSocketHandler(handlePeopleEvent), []);
}
