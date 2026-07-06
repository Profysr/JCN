import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import {
  Check,
  X,
  ChevronRight,
  ArrowLeft,
  Send,
  Users,
  Eye,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useCreateWorkspace, useUpdateWorkspace } from "@/shared/hooks/useWorkspace";
import { useInviteMember } from "@/shared/hooks/useMembers";
import { useRoles } from "@/shared/hooks/useRoles";
import { useUpdateOnboarding } from "@/shared/hooks/useOnboarding";
import { useToast } from "@/shared/components/ui/toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import Select from "@/shared/components/ui/Select";
import ImageUpload from "@/shared/components/ui/ImageUpload";
import { cn } from "@/shared/lib/utils";
import {
  COUNTRIES,
  CURRENCIES,
  TIMEZONES,
  flagComponent,
  detectLocaleDefaults,
} from "@/shared/lib/locale";

const STEPS = ["Details", "Invite", "Ready!"];

function roleIcon(name = "") {
  return name.toLowerCase().includes("viewer") ? Eye : Users;
}

/* ── Progress header ──────────────────────────────────────────────────────── */
function WizardHeader({ step, onSkip }) {
  return (
    <div className="flex items-center justify-between px-8 py-4 border-b">
      <div className="flex items-center gap-1">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
          J
        </div>
        <span className="font-semibold text-sm">CN</span>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
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
                i === step ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn("w-8 h-px", i < step ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {onSkip ? (
        <button
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      ) : (
        <span className="w-16" />
      )}
    </div>
  );
}

/* ── Email chip input (moved out of the old SetupWizard) ──────────────────── */
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

  return (
    <div
      className="flex flex-wrap gap-1 p-2 border border-border rounded-md bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/8 cursor-text transition-all"
      onClick={() => document.getElementById("email-chip-input")?.focus()}
    >
      {emails.map((em) => (
        <span
          key={em}
          className="flex items-center gap-1 text-xs bg-muted text-foreground px-2 py-0.5 rounded-sm"
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
        onPaste={(e) => {
          e.preventDefault();
          add(e.clipboardData.getData("text"));
        }}
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

/* ── Step 1 · Workspace details ───────────────────────────────────────────── */
function DetailsStep({ form, setForm, onSubmit, isPending, error }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Choosing a country auto-fills currency (until the user overrides it).
  const onCountryChange = (code) => {
    const c = COUNTRIES.find((x) => x.code === code);
    setForm((f) => ({
      ...f,
      country: code,
      currency: f.currencyTouched ? f.currency : c?.currency || f.currency,
    }));
  };

  const countryOptions = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const Flag = flagComponent(c.code);
        return {
          value: c.code,
          label: c.name,
          iconNode: Flag ? <Flag className="w-5 h-auto rounded-[2px]" /> : undefined,
        };
      }),
    [],
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-center mb-1">Create your workspace</h1>
      <p className="text-muted-foreground text-center text-sm mb-8">
        A few details so it feels like home. We&apos;ve guessed some from your browser.
      </p>

      {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}

      <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex justify-center">
          <ImageUpload
            onChange={(file) => set("logoFile", file)}
            aspectRatio="1/1"
            displayWidth={80}
            shape="rounded"
            uploadLabel="Upload logo"
            hint="Optional · JPEG, PNG, GIF or WebP · max 2 MB"
            accept="image/jpeg,image/png,image/gif,image/webp"
            allowedTypes={["image/jpeg", "image/png", "image/gif", "image/webp"]}
            maxSizeMB={2}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            placeholder="Acme Inc."
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Country</Label>
            <Select
              value={form.country}
              onChange={onCountryChange}
              options={countryOptions}
              searchable
              placeholder="Select country…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <Select
              value={form.currency}
              onChange={(v) => setForm((f) => ({ ...f, currency: v, currencyTouched: true }))}
              options={CURRENCIES}
              searchable
              placeholder="Select currency…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Time zone</Label>
          <Select
            value={form.timezone}
            onChange={(v) => set("timezone", v)}
            options={TIMEZONES}
            searchable
            placeholder="Select time zone…"
          />
        </div>
      </div>

      <div className="flex justify-end mt-8">
        <Button onClick={onSubmit} disabled={isPending || !form.name.trim()}>
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : null}
          {isPending ? "Creating…" : "Continue"}
          {!isPending && <ChevronRight className="w-4 h-4 ml-1" />}
        </Button>
      </div>
    </div>
  );
}

/* ── Step 2 · Invite teammates ────────────────────────────────────────────── */
function InviteStep({ emails, setEmails, inviteRole, setInviteRole, roles, onBack, onFinish, isPending }) {
  const systemRoles = roles.filter((r) => r.is_system);

  return (
    <div>
      <h1 className="text-2xl font-bold text-center mb-1">Invite your team</h1>
      <p className="text-muted-foreground text-center text-sm mb-8">
        Add teammates now, or skip and do it later.
      </p>

      <EmailChipInput emails={emails} onChange={setEmails} />

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Invite as
        </p>
        <div className="grid grid-cols-2 gap-2">
          {systemRoles.map((r) => {
            const Icon = roleIcon(r.name);
            const selected = inviteRole === r.name;
            return (
              <button
                key={r.id}
                onClick={() => setInviteRole(r.name)}
                className={cn(
                  "relative flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>
                    {r.name}
                  </p>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                  )}
                </div>
                {selected && (
                  <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onFinish(true)} disabled={isPending}>
            Skip for now
          </Button>
          <Button onClick={() => onFinish(false)} disabled={isPending || emails.length === 0}>
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 mr-1.5" />
            )}
            {isPending
              ? "Sending…"
              : emails.length > 0
                ? `Send ${emails.length} invite${emails.length !== 1 ? "s" : ""}`
                : "Send invites"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Step 3 · Ready ───────────────────────────────────────────────────────── */
function ReadyStep({ onComplete, sentCount }) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl animate-bounce">🎉</div>
      <div>
        <h1 className="text-2xl font-bold mb-2">Your workspace is ready!</h1>
        <p className="text-muted-foreground text-sm">
          Everything is set up. Let&apos;s get to work.
        </p>
      </div>
      {sentCount > 0 && (
        <div className="flex items-center justify-center gap-2 py-3 px-6 bg-muted/50 border rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="font-medium">
            {sentCount} teammate{sentCount !== 1 ? "s" : ""} invited
          </span>
        </div>
      )}
      <Button size="lg" onClick={onComplete}>
        Go to workspace <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

/* ── Container ────────────────────────────────────────────────────────────── */
export default function CreateWorkspacePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [workspace, setWorkspace] = useState(null);
  const [sentCount, setSentCount] = useState(0);
  const [emails, setEmails] = useState([]);
  const [inviteRole, setInviteRole] = useState("Member");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(() => {
    const d = detectLocaleDefaults();
    return {
      name: "",
      logoFile: null,
      country: d.country,
      timezone: d.timezone,
      currency: d.currency,
      currencyTouched: false,
    };
  });

  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspace?.id);
  const inviteMutation = useInviteMember(workspace?.id);
  const updateOnboarding = useUpdateOnboarding(workspace?.id);
  const { data: roles = [] } = useRoles(workspace?.id);

  // Default the invite role to the first system role once roles load.
  useEffect(() => {
    const first = roles.find((r) => r.is_system);
    if (first) setInviteRole((prev) => prev || first.name);
  }, [roles]);

  const fireConfetti = useCallback(() => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  }, []);

  const handleCreate = async () => {
    setError("");
    const fd = new FormData();
    fd.append("name", form.name);
    if (form.logoFile) fd.append("logo", form.logoFile);
    if (form.country) fd.append("country", form.country);
    if (form.timezone) fd.append("timezone", form.timezone);
    if (form.currency) fd.append("currency", form.currency);
    try {
      // Idempotent: create once, then update on re-submit (e.g. after Back) so
      // navigating back from Invite never spawns a duplicate workspace.
      const ws = workspace
        ? await updateWorkspace.mutateAsync(fd)
        : await createWorkspace.mutateAsync(fd);
      setWorkspace(ws);
      setStep(1);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Couldn't create workspace.");
    }
  };

  const handleFinish = async (skip) => {
    setIsSending(true);
    try {
      if (!skip && emails.length > 0) {
        const results = await Promise.allSettled(
          emails.map((email) => inviteMutation.mutateAsync({ email, role: inviteRole })),
        );
        const failed = results.filter((r) => r.status === "rejected");
        const succeeded = results.length - failed.length;
        if (failed.length === results.length) {
          toast.error(
            "Invites could not be sent",
            failed[0]?.reason?.message ?? "Something went wrong. Please try again.",
          );
          return;
        }
        setSentCount(succeeded);
        if (failed.length > 0) {
          toast.error(
            `${failed.length} invite${failed.length !== 1 ? "s" : ""} failed`,
            `${succeeded} sent, ${failed.length} failed.`,
          );
        }
      }
      await updateOnboarding.mutateAsync({ wizard_completed: true }).catch(() => {});
      fireConfetti();
      setTimeout(() => setStep(2), 400);
    } finally {
      setIsSending(false);
    }
  };

  const goToWorkspace = () => navigate(`/w/${workspace.id}`);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WizardHeader step={step} onSkip={step === 1 ? () => handleFinish(true) : null} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl animate-fade-in">
          {step === 0 && (
            <DetailsStep
              form={form}
              setForm={setForm}
              onSubmit={handleCreate}
              isPending={createWorkspace.isPending || updateWorkspace.isPending}
              error={error}
            />
          )}
          {step === 1 && (
            <InviteStep
              emails={emails}
              setEmails={setEmails}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              roles={roles}
              onBack={() => setStep(0)}
              onFinish={handleFinish}
              isPending={isSending}
            />
          )}
          {step === 2 && <ReadyStep onComplete={goToWorkspace} sentCount={sentCount} />}
        </div>
      </div>
    </div>
  );
}
