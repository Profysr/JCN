import { useState, useEffect } from "react";
import {
  useUpdateProfile,
  useChangePassword,
  useRequestPasswordReset,
} from "@/shared/hooks/useAccount";
import {
  User,
  Lock,
  SlidersHorizontal,
  Palette,
  Keyboard,
  Check,
  Eye,
  EyeOff,
  AlertCircle,
  Mail,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import Modal from "@/shared/components/ui/Modal";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";
import { SHORTCUT_GROUPS } from "@/shared/lib/shortcutsRegistry";
import {
  THEMES,
  ACCENT_COLORS,
  DENSITIES,
  FOCUS_DURATIONS,
} from "@/shared/lib/constants";

// ── Shared <kbd> badge ────────────────────────────────────────────────────────
function Key({ label }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded border border-border/80 bg-muted/80",
        "text-[10px] font-semibold text-muted-foreground leading-none",
        "shadow-[0_1px_0_0_hsl(var(--border))]",
        "min-w-[20px] h-[20px] px-1.5",
        (label === "Space" || label === "Enter" || label === "Esc") && "px-2",
      )}
    >
      {label}
    </kbd>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">
      {children}
    </p>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: "me", label: "Me", icon: User },
  { id: "password", label: "Password", icon: Lock },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

// ── Avatar picker ─────────────────────────────────────────────────────────────
const AVATAR_ICONS = [
  "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🦄", "🐸",
  "🦋", "🐬", "🦜", "🐺", "🌟", "🚀", "⚡", "🔥",
  "🌊", "🌈", "🍀", "🎯", "🎸", "🎭", "🌺", "🐝",
];

function AvatarPicker({ user }) {
  const [mode, setMode] = useState(user?.avatar_type || "initials");
  const updateProfile = useUpdateProfile();
  const saving = updateProfile.isPending;

  const hasGoogle = Boolean(user?.avatar);

  const applyAvatar = (payload) =>
    updateProfile.mutate(payload, {
      onSuccess: (data) => setMode(data.avatar_type),
    });

  const selectMode = (m) => {
    if (m === mode) return;
    if (m === "initials") applyAvatar({ avatar_type: "initials" });
    if (m === "google") applyAvatar({ avatar_type: "google" });
    if (m === "icon") setMode("icon");
  };

  const selectIcon = (emoji) => {
    applyAvatar({ avatar_type: "icon", avatar_icon: emoji });
  };

  const previewUser = { ...user, avatar_type: mode };

  const optionCls = (active) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer",
      active
        ? "border-primary bg-primary/8 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
        : "border-border/60 text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
        <Avatar user={previewUser} name={user?.full_name || user?.email} size="2xl" />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{user?.full_name || user?.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{user?.email}</p>
          {saving && (
            <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Saving…
            </p>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Profile picture</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <button className={optionCls(mode === "initials")} onClick={() => selectMode("initials")}>
            <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold flex-shrink-0">
              {(user?.full_name || user?.email || "?")[0].toUpperCase()}
            </span>
            Initials
          </button>

          {hasGoogle && (
            <button className={optionCls(mode === "google")} onClick={() => selectMode("google")}>
              <img src={user.avatar} className="w-5 h-5 rounded-full object-cover flex-shrink-0" alt="" />
              Google Profile
            </button>
          )}

          <button className={optionCls(mode === "icon")} onClick={() => selectMode("icon")}>
            <span className="text-base leading-none">
              {user?.avatar_type === "icon" ? user.avatar_icon : "🎨"}
            </span>
            Choose Icon
          </button>
        </div>
      </div>

      {mode === "icon" && (
        <div>
          <SectionLabel>Pick an icon</SectionLabel>
          <div className="grid grid-cols-8 gap-1 p-3 rounded-xl bg-muted/20 border border-border/50">
            {AVATAR_ICONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => selectIcon(emoji)}
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all hover:scale-110",
                  user?.avatar_type === "icon" && user?.avatar_icon === emoji
                    ? "bg-primary/15 ring-2 ring-primary shadow-sm"
                    : "hover:bg-accent",
                )}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Me tab ────────────────────────────────────────────────────────────────────
function MeTab() {
  const { user } = useAuthStore();
  const [form, setForm] = useState({ full_name: "" });
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || "" });
  }, [user?.id]);

  const save = useUpdateProfile();

  const handleProfileSave = (e) => {
    e.preventDefault();
    save.mutate(form, {
      onSuccess: () => {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      },
    });
  };

  return (
    <div className="space-y-6">
      <AvatarPicker user={user} />

      <div className="border-t border-border/60" />

      <form onSubmit={handleProfileSave} className="space-y-4">
        <SectionLabel>Profile details</SectionLabel>

        <div className="space-y-4 p-4 rounded-xl bg-muted/20 border border-border/50">
          <div className="space-y-1.5">
            <Label htmlFor="full-name" className="text-xs font-medium">Full name</Label>
            <Input
              id="full-name"
              placeholder="Your full name"
              value={form.full_name}
              onChange={(e) => setForm({ full_name: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <Input
                value={user?.email || ""}
                disabled
                className="pl-8 h-9 opacity-50 cursor-not-allowed bg-muted/40"
              />
            </div>
            <p className="text-[11px] text-muted-foreground/70">Email cannot be changed here.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending} className="h-8 px-4">
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15">
                <Check className="w-2.5 h-2.5" />
              </span>
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Password field ────────────────────────────────────────────────────────────
function PwField({ id, label, value, onChange }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10 h-9"
          required
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsVisible((prev) => !prev)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Password tab ──────────────────────────────────────────────────────────────
function PasswordTab() {
  const { user } = useAuthStore();
  const [form, setForm] = useState({ new_password1: "", new_password2: "" });
  const [success, setSuccess] = useState(false);
  const [serverError, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const change = useChangePassword();
  const reset = useRequestPasswordReset();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (form.new_password1 !== form.new_password2) {
      setError("New passwords do not match.");
      return;
    }
    change.mutate(form, {
      onSuccess: () => {
        setForm({ new_password1: "", new_password2: "" });
        setError("");
        setSuccess(true);
        setTimeout(() => setSuccess(false), 4000);
      },
      onError: (err) => {
        const data = err?.response?.data || {};
        const msg =
          data.new_password1?.[0] ||
          data.new_password2?.[0] ||
          data.detail ||
          data.non_field_errors?.[0] ||
          "Failed to change password.";
        setError(msg);
      },
    });
  };

  const PASSWORD_FIELDS = [
    { id: "new_password1", label: "New password", name: "new_password1" },
    { id: "new_password2", label: "Confirm new password", name: "new_password2" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Change password</SectionLabel>
        <p className="text-xs text-muted-foreground -mt-1 mb-4">
          Choose a strong password you don't use elsewhere.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-3 p-4 rounded-xl bg-muted/20 border border-border/50">
            {PASSWORD_FIELDS.map((field) => (
              <PwField
                key={field.id}
                id={field.id}
                label={field.label}
                value={form[field.name]}
                onChange={(val) => setForm((prev) => ({ ...prev, [field.name]: val }))}
              />
            ))}
          </div>

          {serverError && (
            <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/6 border border-destructive/15 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="text-xs leading-relaxed">{serverError}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={change.isPending} className="h-8 px-4">
              {change.isPending ? "Updating…" : "Update password"}
            </Button>
            {success && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15">
                  <Check className="w-2.5 h-2.5" />
                </span>
                Password updated
              </span>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-0.5">
            Forgot your current password?
          </p>
          <p className="text-xs text-muted-foreground">
            We'll send a reset link to{" "}
            <span className="font-medium text-foreground">{user?.email}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reset.isPending || resetSent}
            className="h-8 px-4 border-amber-500/30 hover:bg-amber-500/10 hover:border-amber-500/50 text-amber-700 dark:text-amber-400"
            onClick={() =>
              reset.mutate(user?.email, {
                onSuccess: () => {
                  setResetSent(true);
                  setTimeout(() => setResetSent(false), 6000);
                },
              })
            }
          >
            {reset.isPending ? "Sending…" : "Send reset link"}
          </Button>
          {resetSent && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15">
                <Check className="w-2.5 h-2.5" />
              </span>
              Check your inbox
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Preferences tab ───────────────────────────────────────────────────────────
function PreferencesTab() {
  const [focusModeUntil, setFocusModeUntil] = useState(() => {
    const v = localStorage.getItem("jcn_focus_until");
    return v ? parseInt(v, 10) : null;
  });
  const isFocusMode = focusModeUntil && Date.now() < focusModeUntil;

  const enableFocus = (hours) => {
    const until = Date.now() + hours * 3_600_000;
    setFocusModeUntil(until);
    localStorage.setItem("jcn_focus_until", String(until));
  };
  const disableFocus = () => {
    setFocusModeUntil(null);
    localStorage.removeItem("jcn_focus_until");
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Focus Mode (DND)</SectionLabel>
        <p className="text-xs text-muted-foreground -mt-1 mb-4">
          Mute in-app notifications for a set period.
        </p>

        {isFocusMode ? (
          <div className="flex items-center justify-between p-4 rounded-xl bg-violet-500/8 border border-violet-500/20">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                Focus Mode active
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={disableFocus} className="h-8 border-violet-500/30 hover:bg-violet-500/10">
              Turn off
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {FOCUS_DURATIONS.map((d) => (
              <Button
                key={d.key}
                size="sm"
                variant="outline"
                onClick={() => enableFocus(d.hours)}
                className="h-8 text-xs"
              >
                Mute for {d.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-border/60 px-4 py-3.5 text-xs text-muted-foreground/60 text-center">
        More preferences (notification digest, quiet hours, etc.) coming soon.
      </div>
    </div>
  );
}

// ── Appearance tab ────────────────────────────────────────────────────────────
const ACCENTS = Object.entries(ACCENT_COLORS).map(([value, { hex }]) => ({
  value,
  hex,
}));

function AppearanceTab() {
  const { theme, accent, density, setTheme, setAccent, setDensity } = useThemeStore();

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Theme</SectionLabel>
        <div className="flex gap-3">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className={cn(
                  "w-[72px] h-[50px] rounded-md border-2 transition-all overflow-hidden",
                  t.preview,
                  theme === t.value
                    ? "border-primary ring-2 ring-primary/25 shadow-sm"
                    : "border-border/60 hover:border-primary/40",
                )}
              >
                <div className="flex gap-1 p-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", theme === t.value ? "bg-primary/80" : "bg-muted-foreground/30")} />
                  <div className={cn("h-1.5 rounded-sm flex-1", theme === t.value ? "bg-primary/40" : "bg-muted-foreground/20")} />
                </div>
                <div className="px-1.5 space-y-1">
                  <div className={cn("h-1.5 w-full rounded-sm", theme === t.value ? "bg-primary/25" : "bg-muted-foreground/15")} />
                  <div className={cn("h-1.5 w-3/4 rounded-sm", theme === t.value ? "bg-primary/15" : "bg-muted-foreground/10")} />
                </div>
              </div>
              <span className={cn("text-xs font-medium transition-colors", theme === t.value ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Accent colour</SectionLabel>
        <div className="flex flex-wrap gap-2.5 p-3.5 rounded-md bg-muted/20 border border-border/50">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              onClick={() => setAccent(a.value)}
              title={a.value}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-all hover:scale-110",
                accent === a.value
                  ? "border-foreground scale-110 shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_4px_hsl(var(--foreground)/0.3)]"
                  : "border-transparent hover:border-foreground/30",
              )}
              style={{ backgroundColor: a.hex }}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Layout density</SectionLabel>
        <div className="flex gap-2">
          {DENSITIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDensity(d.value)}
              className={cn(
                "px-4 py-2 rounded-md border text-sm font-medium transition-all",
                density === d.value
                  ? "border-primary bg-primary/8 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                  : "border-border/60 text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shortcuts tab ─────────────────────────────────────────────────────────────
function ShortcutsTab() {
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Shortcuts are active globally when you're not typing in an input.
        Press <Key label="?" /> anywhere to see this as an overlay.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.id} className="space-y-0">
            <h4 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2">
              {group.label}
            </h4>
            <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
              {group.shortcuts.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 px-3 py-2 bg-muted/10 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs text-foreground/80">{s.description}</span>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {s.display.map((k, ki) => (
                      <Key key={ki} label={k} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/50 text-center py-2">
        Custom keybindings coming in a future update.
      </p>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
export default function UserSettingsModal({ onClose, defaultTab = "me" }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const CONTENT = {
    me: <MeTab />,
    password: <PasswordTab />,
    preferences: <PreferencesTab />,
    appearance: <AppearanceTab />,
    shortcuts: <ShortcutsTab />,
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={TABS.find((t) => t.id === activeTab)?.label ?? "Settings"}
      showFooter={false}
      maxWidth="900px"
      padding="p-0"
    >
      <div className="flex" style={{ height: "min(580px, 82vh)" }}>
        {/* Left sidebar */}
        <aside className="w-48 flex-shrink-0 border-r border-border/60 flex flex-col py-3 px-2 gap-0.5 bg-muted/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 pt-1 pb-2">
            Settings
          </p>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all text-left",
                activeTab === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  activeTab === id ? "text-primary" : "text-muted-foreground/60",
                )}
              />
              {label}
              {activeTab === id && (
                <span className="ml-auto w-1 h-4 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </aside>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-7 py-6 min-w-0">
          {CONTENT[activeTab]}
        </div>
      </div>
    </Modal>
  );
}
