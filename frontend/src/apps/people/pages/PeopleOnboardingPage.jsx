import AppOnboarding from "@/shared/components/onboarding/AppOnboarding";

// Keys match workspaces/checklist.py::_compute_people so completion auto-ticks.
const ITEMS = [
  {
    key: "create_department",
    label: "Create a department",
    desc: "Group people into functional areas",
    action: (navigate, ws) => navigate(`/w/${ws}/departments`),
    cta: "Create department",
  },
  {
    key: "create_team",
    label: "Create a team",
    desc: "Form cross-functional working groups",
    action: (navigate, ws) => navigate(`/w/${ws}/teams`),
    cta: "Create team",
  },
  {
    key: "set_reporting_line",
    label: "Set up reporting lines",
    desc: "Define who reports to whom",
    action: (navigate, ws) => navigate(`/w/${ws}/people`),
    cta: "View org chart",
  },
  {
    key: "create_leave_policy",
    label: "Create a leave policy",
    desc: "Define annual, sick, and other entitlements",
    action: (navigate, ws) => navigate(`/w/${ws}/hr/leave`),
    cta: "Set up policies",
  },
  {
    key: "submit_leave_request",
    label: "Submit a leave request",
    desc: "Try the approval flow end-to-end",
    action: (navigate, ws) => navigate(`/w/${ws}/hr/leave`),
    cta: "Request leave",
  },
  {
    key: "record_attendance",
    label: "Record attendance",
    desc: "Clock in to start tracking hours",
    action: (navigate, ws) => navigate(`/w/${ws}/hr/attendance`),
    cta: "Go to attendance",
  },
];

export default function PeopleOnboardingPage() {
  return (
    <AppOnboarding
      appKey="people"
      items={ITEMS}
      subtitle="Build your org structure, then turn on leave and attendance."
    />
  );
}
