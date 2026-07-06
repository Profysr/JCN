import {
  Building2,
  Users2,
  Users,
  Briefcase,
  Home,
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
    key: "people",
    icon: Users,
    label: "Employee Hub",
    desc: "Browse teams and the org chart",
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
    icon: Home,
    label: "Home",
    desc: "Your overview & what's happening",
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
  { label: "Home", items: ["hr-dashboard"] },
  { label: "HR", items: ["hr-leave", "hr-attendance"] },
  {
    label: "Organization",
    items: ["departments", "teams", "people", "job-titles"],
  },
];
