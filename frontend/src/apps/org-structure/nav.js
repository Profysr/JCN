import { Building2, Users2, Network } from "lucide-react";

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
];

export const ORG_NAV_GROUPS = [
  { label: "People", items: ["departments", "teams", "org-chart"] },
];
