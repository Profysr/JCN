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

// Returns the human-readable label for an employment type value.
// Falls back to the raw value so unknown types still render something.
export function getEmploymentLabel(value) {
  return EMPLOYMENT_TYPES.find((t) => t.value === value)?.label ?? value;
}

// Gender options — matches backend OrgProfile.Gender choices.
export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

// Marital status options — matches backend OrgProfile.MaritalStatus choices.
export const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "other", label: "Other" },
];

// Label lookups for the choice fields above; fall back to the raw value.
export function getGenderLabel(value) {
  return GENDERS.find((g) => g.value === value)?.label ?? value;
}

export function getMaritalLabel(value) {
  return MARITAL_STATUSES.find((m) => m.value === value)?.label ?? value;
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
