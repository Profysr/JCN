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
];

export default function OrgGettingStarted() {
  return <ModuleChecklist moduleKey="org_structure" items={ITEMS} />;
}
