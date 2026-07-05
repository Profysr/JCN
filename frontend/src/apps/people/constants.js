// ── Org Structure — shared constants ─────────────────────────────────────────
// Single source of truth for all static values used across the org app.
// Change here → updates everywhere.

// Color palette used for department and team identifiers.
export const ORG_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

// Employment types — matches backend OrgProfile.EmploymentType choices.
export const EMPLOYMENT_TYPES = [
  { value: "full_time",   label: "Full-time" },
  { value: "part_time",   label: "Part-time" },
  { value: "contractor",  label: "Contractor" },
  { value: "intern",      label: "Intern" },
];

// Onboarding status values — mirrors backend OrgProfile.OnboardingStatus.
export const ONBOARDING_STATUS = {
  DRAFT:     "draft",
  SUBMITTED: "submitted",
  APPROVED:  "approved",
};

// Display config for each onboarding status.
// label      → human-readable text shown in badges / profile views.
// className  → Tailwind classes for the badge chip.
// Used by PeopleDirectoryPage, MemberDetailPage, and any future status badges.
export const PROFILE_STATUS_CONFIG = {
  [ONBOARDING_STATUS.APPROVED]: {
    label: "Active",
    className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 border border-green-200 dark:border-green-800",
  },
  [ONBOARDING_STATUS.SUBMITTED]: {
    label: "Pending review",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
  },
  [ONBOARDING_STATUS.DRAFT]: {
    label: "Incomplete",
    className: "bg-muted text-muted-foreground border border-border",
  },
};

// Returns the human-readable label for an employment type value.
// Falls back to the raw value so unknown types still render something.
export function getEmploymentLabel(value) {
  return EMPLOYMENT_TYPES.find((t) => t.value === value)?.label ?? value;
}

// Formats an ISO date string to a localised medium date (e.g. "Jul 1, 2026").
// Returns null for falsy input so callers can conditionally render.
export function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString(undefined, { dateStyle: "medium" });
}

// Generates a short identifier from a name.
// Single word → first 4 chars. Multi-word → initials (up to 6).
export function generateIdentifier(name) {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 6).toUpperCase();
}
