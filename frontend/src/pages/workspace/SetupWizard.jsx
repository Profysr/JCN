import { useState, useCallback } from "react";
import confetti from "canvas-confetti";
import { useParams, useNavigate } from "react-router-dom";
import {
  Check,
  X,
  ChevronRight,
  ArrowLeft,
  Send,
  Users,
  Eye,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useUpdateOnboarding } from "@/hooks/useOnboarding";
import { useMutation } from "@tanstack/react-query";
import { usePendingInvites } from "@/hooks/useMembers";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Configuration Constants ──────────────────────────────────────────────── */
const TEAM_TYPES = [
  {
    key: "software",
    label: "Software",
    emoji: "💻",
    desc: "Agile sprints, bug tracking, releases",
  },
  {
    key: "design",
    label: "Design",
    emoji: "🎨",
    desc: "Briefs, feedback loops, deliverables",
  },
  {
    key: "marketing",
    label: "Marketing",
    emoji: "📢",
    desc: "Campaigns, content, launches",
  },
  {
    key: "operations",
    label: "Operations",
    emoji: "⚙️",
    desc: "Processes, SOPs, coordination",
  },
  {
    key: "education",
    label: "Education",
    emoji: "🎓",
    desc: "Curriculum, projects, assignments",
  },
  {
    key: "other",
    label: "Other",
    emoji: "✨",
    desc: "General purpose workspace",
  },
];

const ROLES = [
  {
    key: "member",
    icon: Users,
    label: "Member",
    desc: "Can create and edit tasks",
  },
  { key: "viewer", icon: Eye, label: "Viewer", desc: "Read-only access" },
];

const STEPS = ["Team type", "Invite", "Ready!"];

/* ── Custom Hook: Confetti ────────────────────────────────────────────────── */
function useConfetti() {
  return useCallback(() => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  }, []);
}

/* ── Component: EmailChipInput ────────────────────────────────────────────── */
function EmailChipInput({ emails, onChange }) {
  const [input, setInput] = useState("");

  const add = (raw) => {
    const next = raw
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@") && !emails.includes(e));
    if (next.length) onChange([...emails, ...next]);
  };

  const handleKey = (e) => {
    if (["Enter", ",", " ", "Tab"].includes(e.key)) {
      e.preventDefault();
      add(input);
      setInput("");
    }
    if (e.key === "Backspace" && !input && emails.length) {
      onChange(emails.slice(0, -1));
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    add(e.clipboardData.getData("text"));
  };

  return (
    <div
      className="flex flex-wrap gap-1 p-2 border border-border rounded-md bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/8 cursor-text transition-all"
      onClick={() => document.getElementById("email-chip-input")?.focus()}
    >
      {emails.map((em) => (
        <span
          key={em}
          className="flex items-center gap-1 text-xs bg-muted text-foreground px-2 py-0.5 rounded-sm font-normal"
        >
          {em}
          <button
            onClick={() => onChange(emails.filter((e) => e !== em))}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        id="email-chip-input"
        className="flex-1 min-w-[180px] text-sm bg-transparent outline-none py-1 px-1 placeholder:text-muted-foreground/60"
        placeholder={emails.length === 0 ? "Add emails…" : ""}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onPaste={handlePaste}
        onBlur={() => {
          if (input) {
            add(input);
            setInput("");
          }
        }}
      />
    </div>
  );
}

/* ── Component: WizardHeader ──────────────────────────────────────────────── */
function WizardHeader({ step, onSkip }) {
  return (
    <div className="flex items-center justify-between px-8 py-4 border-b">
      {/* Brand logo context */}
      <div className="flex items-center gap-1">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
          J
        </div>
        <span className="font-semibold text-sm">CN</span>
      </div>

      {/* Dynamic progress track visualizers */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-primary/10 text-primary ring-1 ring-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs hidden sm:block",
                i === step
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-px",
                  i < step ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onSkip}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip setup
      </button>
    </div>
  );
}

/* ── Component: TeamTypeStep ──────────────────────────────────────────────── */
function TeamTypeStep({ teamType, onSelectTeam, onNext }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-center mb-1">
        What kind of team are you?
      </h1>
      <p className="text-muted-foreground text-center text-sm mb-8">
        We'll configure your workspace with the right defaults.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TEAM_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => onSelectTeam(t.key)}
            className={cn(
              "relative p-5 rounded-md border text-left transition-all hover:shadow-card",
              teamType === t.key
                ? "border-primary bg-primary/5 shadow-card"
                : "border-border bg-card hover:border-primary/40",
            )}
          >
            <div className="text-3xl mb-2">{t.emoji}</div>
            <p className="font-semibold text-sm">{t.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {t.desc}
            </p>

            {teamType === t.key && (
              <div className="absolute top-4 right-3 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-end mt-8">
        <Button disabled={!teamType} onClick={onNext}>
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* ── Component: InviteStep ────────────────────────────────────────────────── */
function InviteStep({
  emails,
  onEmailsChange,
  inviteRole,
  onRoleChange,
  onBack,
  onFinish,
  isPending,
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-center mb-1">Invite your team</h1>
      <p className="text-muted-foreground text-center text-sm mb-8">
        Add teammates now, or skip and do it later.
      </p>

      <EmailChipInput emails={emails} onChange={onEmailsChange} />

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Invite as
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map(({ key: r, icon: Icon, label, desc }) => (
            <button
              key={r}
              onClick={() => onRoleChange(r)}
              className={cn(
                "relative flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                inviteRole === r
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  inviteRole === r
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    inviteRole === r ? "text-primary" : "text-foreground",
                  )}
                >
                  {label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              {inviteRole === r && (
                <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onFinish} disabled={isPending}>
            Skip for now
          </Button>
          <Button onClick={onFinish} disabled={isPending}>
            {emails.length > 0 ? (
              <>
                <Send className="w-3.5 h-3.5 mr-1.5" /> Send {emails.length}{" "}
                invite{emails.length > 1 ? "s" : ""}
              </>
            ) : (
              "Finish setup"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Component: ReadyStep ─────────────────────────────────────────────────── */
function ReadyStep({ onComplete, workspaceId, sentCount }) {
  const { data: pending = [] } = usePendingInvites(
    sentCount > 0 ? workspaceId : null,
    { refetchInterval: 5000 }
  );
  const accepted = Math.max(0, sentCount - pending.length);

  return (
    <div className="text-center space-y-6">
      <div className="text-6xl animate-bounce">🎉</div>
      <div>
        <h1 className="text-2xl font-bold mb-2">Your workspace is ready!</h1>
        <p className="text-muted-foreground text-sm">
          Everything is set up. Start building something great.
        </p>
      </div>

      {sentCount > 0 && (
        <div className="flex items-center justify-center gap-6 py-3 px-6 bg-muted/50 border rounded-lg text-sm">
          <span className="flex items-center gap-1.5 text-green-600 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {accepted} accepted
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-4 h-4" />
            {pending.length} pending
          </span>
        </div>
      )}

      <Button size="lg" onClick={onComplete}>
        Go to workspace <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

/* ── Main Container: SetupWizard ─────────────────────────────────────────── */
export default function SetupWizard() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [teamType, setTeamType] = useState(null);
  const [emails, setEmails] = useState([]);
  const [inviteRole, setInviteRole] = useState("member");
  const [sentCount, setSentCount] = useState(0);

  const fireConfetti = useConfetti();
  const updateOnboarding = useUpdateOnboarding(workspaceId);

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }) =>
      api.post(`/api/workspaces/${workspaceId}/invites/`, { email, role }),
  });

  const handleFinish = async () => {
    setSentCount(emails.length);
    await Promise.allSettled(
      emails.map((email) =>
        inviteMutation.mutateAsync({ email, role: inviteRole }),
      ),
    );
    await updateOnboarding.mutateAsync({
      wizard_completed: true,
      team_type: teamType,
    });
    fireConfetti();
    setTimeout(() => setStep(2), 400);
  };

  const handleGoToWorkspace = () => navigate(`/w/${workspaceId}`);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WizardHeader step={step} onSkip={handleGoToWorkspace} />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl animate-fade-in">
          {step === 0 && (
            <TeamTypeStep
              teamType={teamType}
              onSelectTeam={setTeamType}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <InviteStep
              emails={emails}
              onEmailsChange={setEmails}
              inviteRole={inviteRole}
              onRoleChange={setInviteRole}
              onBack={() => setStep(0)}
              onFinish={handleFinish}
              isPending={updateOnboarding.isPending}
            />
          )}

          {step === 2 && (
            <ReadyStep
              onComplete={handleGoToWorkspace}
              workspaceId={workspaceId}
              sentCount={sentCount}
            />
          )}
        </div>
      </div>
    </div>
  );
}
