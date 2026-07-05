import {
  Building2,
  Users2,
  Network,
  Users,
  Briefcase,
  BarChart3,
  CalendarDays,
  Timer,
} from "lucide-react";

export const NAV_ITEMS = [
  {
    key: "departments",
    icon: Building2,
    label: "Departments",
    desc: "Company departments & structure",
    path: "departments",
  },
  {
    key: "teams",
    icon: Users2,
    label: "Teams",
    desc: "Teams & their members",
    path: "teams",
  },
  {
    key: "org-chart",
    icon: Network,
    label: "Org Chart",
    desc: "Visual company org chart",
    path: "org-chart",
  },
  {
    key: "people",
    icon: Users,
    label: "People",
    desc: "People directory",
    path: "people",
  },
  {
    key: "job-titles",
    icon: Briefcase,
    label: "Job Titles",
    desc: "Manage job titles & levels",
    path: "org/job-titles",
  },
  {
    key: "hr-dashboard",
    icon: BarChart3,
    label: "HR Overview",
    desc: "Headcount, leave & attendance summary",
    path: "hr",
    end: true,
  },
  {
    key: "hr-leave",
    icon: CalendarDays,
    label: "Leave",
    desc: "Leave requests & balances",
    path: "hr/leave",
  },
  {
    key: "hr-attendance",
    icon: Timer,
    label: "Attendance",
    desc: "Clock-in/out & team hours",
    path: "hr/attendance",
  },
];

export const NAV_GROUPS = [
  {
    label: "Organization",
    items: ["departments", "teams", "org-chart", "people", "job-titles"],
  },
  { label: "HR", items: ["hr-dashboard", "hr-leave", "hr-attendance"] },
];
