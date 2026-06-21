import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import api from "@/shared/lib/api";

// ── Shared <kbd> badge ────────────────────────────────────────────────────────
function Key({ label }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-muted",
        "text-[11px] font-semibold text-foreground leading-none shadow-sm",
        "min-w-[22px] h-[22px] px-1.5",
        (label === "Space" || label === "Enter" || label === "Esc") && "px-2.5",
      )}
    >
      {label}
    </kbd>
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
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🦄",
  "🐸",
  "🦋",
  "🐬",
  "🦜",
  "🐺",
  "🌟",
  "🚀",
  "⚡",
  "🔥",
  "🌊",
  "🌈",
  "🍀",
  "🎯",
  "🎸",
  "🎭",
  "🌺",
  "🐝",
];

function AvatarPicker({ user }) {
  const [mode, setMode] = useState(user?.avatar_type || "initials");
  const [saving, setSaving] = useState(false);

  const hasGoogle = Boolean(user?.avatar);

  const applyAvatar = async (payload) => {
    setSaving(true);
    try {
      const { data } = await api.patch("/api/users/me/", payload);
      useAuthStore.setState((s) => ({ ...s, user: { ...s.user, ...data } }));
      setMode(data.avatar_type);
    } finally {
      setSaving(false);
    }
  };

  const selectMode = (m) => {
    if (m === mode) return;
    if (m === "initials") applyAvatar({ avatar_type: "initials" });
    if (m === "google") applyAvatar({ avatar_type: "google" });
    if (m === "icon") setMode("icon");
  };

  const selectIcon = (emoji) => {
    applyAvatar({ avatar_type: "icon", avatar_icon: emoji });
  };

  // Build a preview user merging in live selections before save
  const previewUser = { ...user, avatar_type: mode };

  const optionCls = (active) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
    );

  return (
    <div className="space-y-4">
      {/* Live preview */}
      <div className="flex items-center gap-4">
        <Avatar
          user={previewUser}
          name={user?.full_name || user?.email}
          size="2xl"
        />
        <div>
          <p className="font-semibold text-sm">
            {user?.full_name || user?.email}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          {saving && (
            <p className="text-xs text-muted-foreground mt-1">Saving…</p>
          )}
        </div>
      </div>

      {/* Mode selector */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Profile picture
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={optionCls(mode === "initials")}
            onClick={() => selectMode("initials")}
          >
            <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
              {(user?.full_name || user?.email || "?")[0].toUpperCase()}
            </span>
            Initials
          </button>

          {hasGoogle && (
            <button
              className={optionCls(mode === "google")}
              onClick={() => selectMode("google")}
            >
              <img
                src={user.avatar}
                className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                alt=""
              />
              Google Profile
            </button>
          )}

          <button
            className={optionCls(mode === "icon")}
            onClick={() => selectMode("icon")}
          >
            <span className="text-base leading-none">
              {user?.avatar_type === "icon" ? user.avatar_icon : "🎨"}
            </span>
            Choose Icon
          </button>
        </div>
      </div>

      {/* Icon grid */}
      {mode === "icon" && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Pick an icon</p>
          <div className="grid grid-cols-8 gap-1">
            {AVATAR_ICONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => selectIcon(emoji)}
                className={cn(
                  "w-9 h-9 rounded flex items-center justify-center text-lg transition-colors hover:bg-accent",
                  user?.avatar_type === "icon" && user?.avatar_icon === emoji
                    ? "bg-primary/15 ring-2 ring-primary"
                    : "bg-muted/40",
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
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "" });
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || "" });
  }, [user?.id]);

  const save = useMutation({
    mutationFn: (data) => api.patch("/api/users/me/", data).then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(["me"], updated);
      useAuthStore.setState((s) => ({ ...s, user: { ...s.user, ...updated } }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  return (
    <div className="space-y-6">
      {/* Avatar picker */}
      <AvatarPicker user={user} />

      <div className="border-t border-border" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="full-name">Full name</Label>
          <Input
            id="full-name"
            placeholder="Your full name"
            value={form.full_name}
            onChange={(e) => setForm({ full_name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email address</Label>
          <Input
            value={user?.email || ""}
            disabled
            className="opacity-60 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Stable password field
function PwField({ id, label, value, onChange }) {
  // Move the show/hide visibility state right here where it belongs!
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <Input
          id={id}
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
          required
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsVisible((prev) => !prev)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {isVisible ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Password tab ──────────────────────────────────────────────────────────────
function PasswordTab() {
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    old_password: "",
    new_password1: "",
    new_password2: "",
  });
  const [success, setSuccess] = useState(false);
  const [serverError, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Uses dj_rest_auth's built-in endpoint: POST /api/auth/password/change/
  const change = useMutation({
    mutationFn: (data) =>
      api.post("/api/auth/password/change/", data).then((r) => r.data),
    onSuccess: () => {
      setForm({ old_password: "", new_password1: "", new_password2: "" });
      setError("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    },
    onError: (err) => {
      const data = err?.response?.data || {};
      const msg =
        data.old_password?.[0] ||
        data.new_password1?.[0] ||
        data.new_password2?.[0] ||
        data.detail ||
        data.non_field_errors?.[0] ||
        "Failed to change password.";
      setError(msg);
    },
  });

  const reset = useMutation({
    mutationFn: () =>
      api.post("/api/auth/password/reset/", { email: user?.email }).then((r) => r.data),
    onSuccess: () => {
      setResetSent(true);
      setTimeout(() => setResetSent(false), 6000);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (form.new_password1 !== form.new_password2) {
      setError("New passwords do not match.");
      return;
    }
    change.mutate(form);
  };

  const PASSWORD_FIELDS = [
    { id: "old_password", label: "Current password", name: "old_password" },
    { id: "new_password1", label: "New password", name: "new_password1" },
    {
      id: "new_password2",
      label: "Confirm new password",
      name: "new_password2",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-0.5">Change password</p>
        <p className="text-xs text-muted-foreground">
          Use the form below to update your account password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {PASSWORD_FIELDS.map((field) => (
          <PwField
            key={field.id}
            id={field.id}
            label={field.label}
            value={form[field.name]}
            onChange={(val) =>
              setForm((prev) => ({ ...prev, [field.name]: val }))
            }
          />
        ))}

        {serverError && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {serverError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={change.isPending}>
            {change.isPending ? "Updating…" : "Update password"}
          </Button>
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" /> Password updated
            </span>
          )}
        </div>
      </form>

      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium mb-0.5">Forgot your current password?</p>
        <p className="text-xs text-muted-foreground mb-3">
          We'll send a reset link to{" "}
          <span className="font-medium text-foreground">{user?.email}</span>.
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reset.isPending || resetSent}
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? "Sending…" : "Send reset link"}
          </Button>
          {resetSent && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" /> Check your inbox
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Preferences tab ───────────────────────────────────────────────────────────
function PreferencesTab() {
  // Focus Mode DND and future toggles live here
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
      {/* Focus Mode */}
      <div>
        <p className="text-sm font-medium mb-0.5">Focus Mode (DND)</p>
        <p className="text-xs text-muted-foreground mb-3">
          Mute in-app notifications for a set period.
        </p>
        {isFocusMode ? (
          <div className="flex items-center justify-between p-3 rounded-md bg-violet-500/10 border border-violet-500/20">
            <span className="text-sm font-medium text-violet-700">
              Focus Mode is on
            </span>
            <Button size="sm" variant="outline" onClick={disableFocus}>
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
              >
                Mute for {d.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Placeholder for future prefs */}
      <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-4 py-3">
        More preferences (notification digest time, quiet hours, etc.) coming
        soon.
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
  const { theme, accent, density, setTheme, setAccent, setDensity } =
    useThemeStore();

  return (
    <div className="space-y-7">
      {/* Theme */}
      <div>
        <p className="text-sm font-medium mb-2">Theme</p>
        <div className="flex gap-3">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn("flex flex-col items-center gap-1.5 group")}
            >
              <div
                className={cn(
                  "w-16 h-10 rounded border-2 transition-all",
                  t.preview,
                  theme === t.value
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div
                  className={cn(
                    "m-1.5 h-2 w-6 rounded-sm",
                    theme === t.value
                      ? "bg-primary/70"
                      : "bg-muted-foreground/30",
                  )}
                />
                <div
                  className={cn(
                    "m-1.5 mt-0.5 h-1.5 w-8 rounded-sm",
                    theme === t.value
                      ? "bg-primary/40"
                      : "bg-muted-foreground/20",
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  theme === t.value ? "text-primary" : "text-muted-foreground",
                )}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent colour */}
      <div>
        <p className="text-sm font-medium mb-2">Accent colour</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              onClick={() => setAccent(a.value)}
              title={a.value}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                accent === a.value
                  ? "border-foreground scale-110 shadow-md"
                  : "border-transparent",
              )}
              style={{ backgroundColor: a.hex }}
            />
          ))}
        </div>
      </div>

      {/* Density */}
      <div>
        <p className="text-sm font-medium mb-2">Layout density</p>
        <div className="flex gap-2">
          {DENSITIES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDensity(d.value)}
              className={cn(
                "px-3 py-1.5 rounded border text-sm font-medium transition-colors",
                density === d.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
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
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          All shortcuts are active globally when you're not typing in an input.
          Press <Key label="?" /> anywhere to see this as an overlay.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.id}>
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              {group.label}
            </h4>
            <div className="space-y-0">
              {group.shortcuts.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 py-1.5 border-b border-border/40 last:border-0"
                >
                  <span className="text-xs text-foreground">
                    {s.description}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
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

      <p className="text-xs text-muted-foreground/60 border border-dashed border-border rounded-md px-4 py-3">
        Custom keybindings are coming in a future updates.
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
      <div className="flex" style={{ height: "min(540px, 80vh)" }}>
        {/* Left tab sidebar */}
        <aside className="w-44 flex-shrink-0 bg-muted/20 border-r border-border flex flex-col py-4 px-2 gap-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors text-left",
                activeTab === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </aside>

        {/* Scrollable content pane */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
          {CONTENT[activeTab]}
        </div>
      </div>
    </Modal>
  );
}
