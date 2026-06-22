import {
  LayoutDashboard,
  FolderKanban,
  Inbox,
  Target,
  BarChart2,
  Upload,
} from "lucide-react";

export const PM_NAV_ITEMS = [
  {
    key: "dashboards",
    icon: LayoutDashboard,
    label: "Dashboards",
    desc: "Overview & analytics",
    path: "dashboards",
  },
  {
    key: "boards",
    icon: FolderKanban,
    label: "Boards",
    desc: "All boards",
    path: "boards",
    collapsible: true,
  },
  {
    key: "my-work",
    icon: Inbox,
    label: "My Work",
    desc: "Tasks assigned to you",
    path: "my-work",
  },
  {
    key: "goals",
    icon: Target,
    label: "Goals",
    desc: "OKRs & objectives",
    path: "goals",
  },
  {
    key: "analytics",
    icon: BarChart2,
    label: "Analytics",
    desc: "Velocity, flow & team metrics",
    path: "analytics",
    permission: "report.view",
  },
  {
    key: "import",
    icon: Upload,
    label: "Import",
    desc: "Migrate from Jira, Trello, ClickUp…",
    path: "settings/import",
  },
];

export const PM_NAV_GROUPS = [
  { label: null,       items: ["dashboards", "boards"] },
  { label: "Work",     items: ["my-work", "goals"] },
  { label: "Insights", items: ["analytics"] },
  { label: "Tools",    items: ["import"] },
];
