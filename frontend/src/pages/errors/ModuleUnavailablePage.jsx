import { Lock, ArrowRight, Network, Users2, BarChart2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

const MODULE_INFO = {
  org_structure: {
    name: "Org Structure",
    description:
      "Visualize your company's departments, teams, and reporting lines. Build an org chart and manage your entire organizational hierarchy in one place.",
    tier: "Pro",
    icon: Network,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  hr_management: {
    name: "HR Management",
    description:
      "Manage leave requests, track attendance, and maintain employee records — all in one place. Requires Org Structure to be enabled first.",
    tier: "Enterprise",
    icon: Users2,
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    requires: "Org Structure must be enabled before HR Management.",
  },
  analytics_advanced: {
    name: "Advanced Analytics",
    description:
      "Unlock velocity charts, flow metrics, and team performance dashboards built on real project data.",
    tier: "Pro",
    icon: BarChart2,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
};

const TIER_BADGE = {
  Pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

export default function ModuleUnavailablePage({ moduleKey }) {
  const { workspaceId } = useParams();
  const info = MODULE_INFO[moduleKey] ?? {
    name: moduleKey,
    description: "This module is not enabled for your workspace.",
    tier: "Pro",
    icon: Lock,
    color: "text-muted-foreground",
    bg: "bg-muted",
  };

  const Icon = info.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[500px] px-6 py-16 text-center">
      <div
        className={`w-16 h-16 rounded-2xl ${info.bg} flex items-center justify-center mb-6`}
      >
        <Icon className={`w-8 h-8 ${info.color}`} />
      </div>

      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-4 ${TIER_BADGE[info.tier] ?? "bg-muted text-muted-foreground"}`}
      >
        <Lock className="w-3 h-3" />
        {info.tier} plan required
      </span>

      <h1 className="text-2xl font-bold text-foreground mb-2">{info.name}</h1>
      <p className="text-muted-foreground max-w-md leading-relaxed mb-2">
        {info.description}
      </p>
      {info.requires && (
        <p className="text-xs text-muted-foreground/60 mt-1 mb-2">
          ⚠ {info.requires}
        </p>
      )}

      <div className="flex items-center gap-3 mt-8">
        <Link
          to={`/w/${workspaceId}/settings`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Enable in Settings
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to={`/w/${workspaceId}/dashboards`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
