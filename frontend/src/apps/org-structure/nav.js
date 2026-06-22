import { Building2, Users2, Network } from "lucide-react";

export const ORG_NAV_ITEMS = [
  {
    key: "departments",
    icon: Building2,
    label: "Departments",
    desc: "Company departments & structure",
    path: "departments",
    permission: "org.view",
    moduleKey: "org_structure",
  },
  {
    key: "teams",
    icon: Users2,
    label: "Teams",
    desc: "Teams & their members",
    path: "teams",
    permission: "org.view",
    moduleKey: "org_structure",
  },
  {
    key: "org-chart",
    icon: Network,
    label: "Org Chart",
    desc: "Visual company org chart",
    path: "org-chart",
    permission: "org.view",
    moduleKey: "org_structure",
  },
];

export const ORG_NAV_GROUPS = [
  { label: "People", items: ["departments", "teams", "org-chart"] },
];
