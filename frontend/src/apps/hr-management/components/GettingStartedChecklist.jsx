import ModuleChecklist from "@/shared/components/onboarding/ModuleChecklist";

const ITEMS = [
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

export default function HRGettingStarted() {
  return <ModuleChecklist moduleKey="hr" items={ITEMS} />;
}
