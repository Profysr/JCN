import { Building2, Users2, Network, Users, Briefcase, UserCheck } from "lucide-react";

export const ORG_NAV_ITEMS = [
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
    key: "hr-queue",
    icon: UserCheck,
    label: "HR Queue",
    desc: "Profiles pending approval",
    path: "org/pending",
  },
];

export const ORG_NAV_GROUPS = [
  { label: "Organization", items: ["departments", "teams", "org-chart", "people", "job-titles", "hr-queue"] },
];
