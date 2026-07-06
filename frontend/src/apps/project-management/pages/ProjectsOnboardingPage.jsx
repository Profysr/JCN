import { useParams } from "react-router-dom";
import { Check } from "lucide-react";
import {
  useOnboarding,
  useUpdateOnboarding,
} from "@/shared/hooks/useOnboarding";
import AppOnboarding from "@/shared/components/onboarding/AppOnboarding";
import { cn } from "@/shared/lib/utils";

// Keys match workspaces/checklist.py::_compute_projects so completion auto-ticks.
const ITEMS = [
  {
    key: "create_board",
    label: "Create your first board",
    desc: "Boards organise your work into projects",
    action: (navigate, ws) => navigate(`/w/${ws}/boards`),
    cta: "Create board",
  },
  {
    key: "add_task",
    label: "Add a task",
    desc: "Break work into trackable pieces",
    action: (navigate, ws) => navigate(`/w/${ws}/boards`),
    cta: "Go to boards",
  },
  {
    key: "invite_teammate",
    label: "Invite a teammate",
    desc: "Collaboration is better together",
    action: (navigate, ws) => navigate(`/w/${ws}/members`),
    cta: "Invite members",
  },
];

// Moved here from the old SetupWizard — configures workspace defaults by team type.
const TEAM_TYPES = [
  { key: "software", label: "Software", emoji: "💻" },
  { key: "design", label: "Design", emoji: "🎨" },
  { key: "marketing", label: "Marketing", emoji: "📢" },
  { key: "operations", label: "Operations", emoji: "⚙️" },
  { key: "education", label: "Education", emoji: "🎓" },
  { key: "other", label: "Other", emoji: "✨" },
];

function TeamTypeStep() {
  const { workspaceId } = useParams();
  const { data: onboarding } = useOnboarding(workspaceId);
  const updateOnboarding = useUpdateOnboarding(workspaceId);
  const selected = onboarding?.team_type || "";

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold mb-1">What kind of team are you?</p>
      <p className="text-xs text-muted-foreground mb-4">
        We&apos;ll tune your board defaults to match.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {TEAM_TYPES.map((t) => {
          const active = selected === t.key;
          return (
            <button
              key={t.key}
              onClick={() => updateOnboarding.mutate({ team_type: t.key })}
              className={cn(
                "relative flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="text-xs font-medium">{t.label}</span>
              {active && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectsOnboardingPage() {
  return (
    <AppOnboarding
      appKey="projects"
      items={ITEMS}
      subtitle="Set up your first board, add work, and bring your team in."
    >
      <TeamTypeStep />
    </AppOnboarding>
  );
}
