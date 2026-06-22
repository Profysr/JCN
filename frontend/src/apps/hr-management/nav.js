import { BarChart3, CalendarDays, Timer } from "lucide-react";

export const HR_NAV_ITEMS = [
  {
    key: "hr-dashboard",
    icon: BarChart3,
    label: "HR Overview",
    desc: "Headcount, leave & attendance summary",
    path: "hr",
    permission: "hr.view",
    moduleKey: "hr_management",
    end: true,
  },
  {
    key: "hr-leave",
    icon: CalendarDays,
    label: "Leave",
    desc: "Leave requests & balances",
    path: "hr/leave",
    permission: "hr.view",
    moduleKey: "hr_management",
  },
  {
    key: "hr-attendance",
    icon: Timer,
    label: "Attendance",
    desc: "Clock-in/out & team hours",
    path: "hr/attendance",
    permission: "hr.view",
    moduleKey: "hr_management",
  },
];

export const HR_NAV_GROUPS = [
  { label: "HR", items: ["hr-dashboard", "hr-leave", "hr-attendance"] },
];
