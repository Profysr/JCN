import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, X, ChevronRight, ArrowLeft, Send, Loader2 } from "lucide-react";
import {
  useUpdateOnboarding,
  useWorkspaceTemplates,
  useApplyWorkspaceTemplate,
} from "@/hooks/useOnboarding";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Team type cards ─────────────────────────────────────────────────────── */
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

/* ── Confetti ─────────────────────────────────────────────────────────────── */
function Confetti() {
  const colors = [
    "#6366f1",
    "#ec4899",
    "#f59e0b",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {Array.from({ length: 60 }).map((_, i) => {
        const color = colors[i % colors.length];
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 1.5}s`;
        const size = 6 + Math.random() * 8;
        return (
          <div
            key={i}
            className="absolute top-0 animate-slide-up"
            style={{
              left,
              animationDelay: delay,
              animationDuration: `${1.5 + Math.random()}s`,
              animationFillMode: "both",
            }}
          >
            <div
              style={{
                width: size,
                height: size,
                backgroundColor: color,
                borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ── Email chip input ─────────────────────────────────────────────────────── */
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
      className="min-h-[80px] flex flex-wrap gap-1.5 p-3 border rounded-md bg-background focus-within:ring-1 focus-within:ring-ring cursor-text"
      onClick={() => document.getElementById("email-chip-input")?.focus()}
    >
      {emails.map((em) => (
        <span
          key={em}
          className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full"
        >
          {em}
          <button
            onClick={() => onChange(emails.filter((e) => e !== em))}
            className="hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        id="email-chip-input"
        className="flex-1 min-w-[160px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        placeholder={
          emails.length === 0 ? "Enter emails, comma or space separated…" : ""
        }
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

/* ── SetupWizard ──────────────────────────────────────────────────────────── */
export default function SetupWizard() {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [teamType, setTeamType] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emails, setEmails] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [inviteRole, setInviteRole] = useState("member");

  const updateOnboarding = useUpdateOnboarding(workspaceSlug);
  const applyTemplate = useApplyWorkspaceTemplate(workspaceSlug);
  const { data: templates = [] } = useWorkspaceTemplates(workspaceSlug);

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }) =>
      api.post(`/api/workspaces/${workspaceSlug}/invites/`, { email, role }),
  });

  const STEPS = ["Team type", "Template", "Invite", "Ready!"];

  const handleFinish = async () => {
    // Send invites
    await Promise.allSettled(
      emails.map((email) =>
        inviteMutation.mutateAsync({ email, role: inviteRole }),
      ),
    );
    // Mark wizard complete
    await updateOnboarding.mutateAsync({
      wizard_completed: true,
      team_type: teamType,
    });
    setShowConfetti(true);
    setTimeout(() => setStep(3), 400);
  };

  const handleGoToWorkspace = () => navigate(`/w/${workspaceSlug}`);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showConfetti && <Confetti />}

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            J
          </div>
          <span className="font-semibold text-sm">CN</span>
        </div>

        {/* Step indicators */}
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
          onClick={handleGoToWorkspace}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip setup
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl animate-fade-in">
          {/* ── Step 0: Team type ── */}
          {step === 0 && (
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
                    onClick={() => setTeamType(t.key)}
                    className={cn(
                      "p-5 rounded-md border text-left transition-all hover:shadow-card",
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
                      <div className="mt-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex justify-end mt-8">
                <Button disabled={!teamType} onClick={() => setStep(1)}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 1: Template ── */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-center mb-1">
                Start from a template
              </h1>
              <p className="text-muted-foreground text-center text-sm mb-8">
                Pre-configured projects and boards — edit anything afterwards.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {/* Blank */}
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className={cn(
                    "p-4 rounded-md border text-left transition-all",
                    selectedTemplate === null
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <p className="text-2xl mb-2">✨</p>
                  <p className="font-semibold text-sm">Blank workspace</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Set up everything yourself
                  </p>
                </button>

                {templates.map((tmpl) => (
                  <button
                    key={tmpl.key}
                    onClick={() => setSelectedTemplate(tmpl.key)}
                    className={cn(
                      "p-4 rounded-md border text-left transition-all",
                      selectedTemplate === tmpl.key
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <p className="text-2xl mb-2">{tmpl.icon}</p>
                    <p className="font-semibold text-sm">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {tmpl.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Includes: {tmpl.projects.map((p) => p.name).join(" · ")}
                    </p>
                  </button>
                ))}
              </div>

              {/* Import hint */}
              <p className="text-xs text-center text-muted-foreground">
                Migrating from another tool?{" "}
                <button
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    navigate(`/w/${workspaceSlug}/settings/import`)
                  }
                >
                  Import from Jira, ClickUp, or Trello →
                </button>
              </p>

              <div className="flex items-center justify-between mt-8">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  disabled={applyTemplate.isPending}
                  onClick={async () => {
                    if (selectedTemplate) {
                      await applyTemplate.mutateAsync(selectedTemplate);
                    }
                    setStep(2);
                  }}
                >
                  {applyTemplate.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{" "}
                      Applying…
                    </>
                  ) : (
                    <>
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Invite ── */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-center mb-1">
                Invite your team
              </h1>
              <p className="text-muted-foreground text-center text-sm mb-8">
                Add teammates now, or skip and do it later.
              </p>
              <EmailChipInput emails={emails} onChange={setEmails} />
              <div className="flex items-center gap-2 mt-3">
                <span className="text-sm text-muted-foreground">Role:</span>
                {["member", "viewer"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border capitalize transition-colors",
                      inviteRole === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-8">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleFinish}
                    disabled={updateOnboarding.isPending}
                  >
                    Skip for now
                  </Button>
                  <Button
                    onClick={handleFinish}
                    disabled={updateOnboarding.isPending}
                  >
                    {emails.length > 0 ? (
                      <>
                        <Send className="w-3.5 h-3.5 mr-1.5" /> Send{" "}
                        {emails.length} invite{emails.length > 1 ? "s" : ""}
                      </>
                    ) : (
                      "Finish setup"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Ready ── */}
          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="text-6xl">🎉</div>
              <div>
                <h1 className="text-2xl font-bold mb-2">
                  Your workspace is ready!
                </h1>
                <p className="text-muted-foreground text-sm">
                  Everything is set up. Start building something great.
                </p>
              </div>
              <Button size="lg" onClick={handleGoToWorkspace}>
                Go to workspace <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
