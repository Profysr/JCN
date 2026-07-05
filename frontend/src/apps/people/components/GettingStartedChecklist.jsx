import ModuleChecklist from "@/shared/components/onboarding/ModuleChecklist";

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
    action: (navigate, ws) => navigate(`/w/${ws}/org-chart`),
    cta: "Go to org chart",
  },
  {
    key: "create_leave_policy",
    label: "Create a leave policy",
    desc: "Define annual, sick, and other leave entitlements",
    action: (navigate, ws) => navigate(`/w/${ws}/hr/leave`),
    cta: "Set up policies",
  },
  {
    key: "submit_leave_request",
    label: "Submit a leave request",
    desc: "Test the approval flow end-to-end",
    action: (navigate, ws) => navigate(`/w/${ws}/hr/leave`),
    cta: "Request leave",
  },
  {
    key: "record_attendance",
    label: "Record attendance",
    desc: "Clock in to start tracking working hours",
    action: (navigate, ws) => navigate(`/w/${ws}/hr/attendance`),
    cta: "Go to attendance",
  },
];

export default function PeopleGettingStarted() {
  return <ModuleChecklist moduleKey="people" items={ITEMS} />;
}
