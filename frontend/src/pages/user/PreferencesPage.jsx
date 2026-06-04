import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { User, Lock, Keyboard, Check, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SHORTCUT_GROUPS } from "@/lib/shortcutsRegistry";
import api from "@/lib/api";

// ── Shared <kbd> key badge ────────────────────────────────────────────────────
function Key({ label }) {
  const wide = label === "Space" || label === "Enter" || label === "Esc";
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-muted",
        "text-[11px] font-semibold text-foreground leading-none shadow-sm",
        "min-w-[22px] h-[22px] px-1.5",
        wide && "px-2.5",
      )}
    >
      {label}
    </kbd>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "profile",   label: "Profile",   icon: User },
  { id: "security",  label: "Security",  icon: Lock },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user } = useAuthStore();
  const qc        = useQueryClient();

  const [form, setForm]       = useState({ full_name: "" });
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) setForm({ full_name: user.full_name || "" });
  }, [user]);

  const updateProfile = useMutation({
    mutationFn: (data) => api.patch("/api/users/me/", data).then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(["me"], updated);
      // Sync auth store
      useAuthStore.setState((s) => ({ ...s, user: { ...s.user, ...updated } }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateProfile.mutate(form);
  };

  const initial = (user?.display_name || user?.email || "?")[0].toUpperCase();

  return (
    <div className="space-y-8">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold flex-shrink-0">
          {initial}
        </div>
        <div>
          <p className="font-semibold">{user?.display_name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="full-name">Full name</Label>
          <Input
            id="full-name"
            placeholder="Your full name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Email address</Label>
          <Input value={user?.email || ""} disabled className="opacity-60 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground">Email cannot be changed from this page.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
          {updateProfile.isError && (
            <span className="text-sm text-destructive">Failed to save.</span>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────
function SecurityTab() {
  const [form, setForm]         = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [showPw, setShowPw]     = useState({ current: false, new: false, confirm: false });
  const [success, setSuccess]   = useState(false);
  const [serverError, setServerError] = useState("");

  const changePassword = useMutation({
    mutationFn: (data) => api.post("/api/users/me/change-password/", data).then((r) => r.data),
    onSuccess: () => {
      setForm({ current_password: "", new_password: "", confirm_password: "" });
      setServerError("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    },
    onError: (err) => {
      setServerError(err?.response?.data?.detail || "Failed to change password.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setServerError("");
    if (form.new_password !== form.confirm_password) {
      setServerError("New passwords do not match.");
      return;
    }
    if (form.new_password.length < 8) {
      setServerError("New password must be at least 8 characters.");
      return;
    }
    changePassword.mutate(form);
  };

  const PasswordField = ({ id, label, field }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPw[field] ? "text" : "password"}
          value={form[`${field}_password`]}
          onChange={(e) => setForm({ ...form, [`${field}_password`]: e.target.value })}
          className="pr-10"
          required
        />
        <button
          type="button"
          onClick={() => setShowPw((p) => ({ ...p, [field]: !p[field] }))}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {showPw[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-sm">
      <div>
        <h3 className="font-medium mb-0.5">Change password</h3>
        <p className="text-sm text-muted-foreground">Must be at least 8 characters.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField id="current-pw"  label="Current password"  field="current" />
        <PasswordField id="new-pw"      label="New password"       field="new"     />
        <PasswordField id="confirm-pw"  label="Confirm new password" field="confirm" />

        {serverError && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {serverError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? "Updating…" : "Update password"}
          </Button>
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <Check className="w-4 h-4" /> Password updated
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Shortcuts Tab ─────────────────────────────────────────────────────────────
function ShortcutsTab() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-medium mb-0.5">Keyboard shortcuts</h3>
        <p className="text-sm text-muted-foreground">
          All shortcuts are global unless noted. Press <Key label="?" /> anywhere to see this as an overlay.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.id}>
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
              {group.label}
            </h4>
            <div className="space-y-0">
              {group.shortcuts.map((shortcut, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0"
                >
                  <span className="text-sm text-foreground">{shortcut.description}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {shortcut.display.map((k, ki) => (
                      <Key key={ki} label={k} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Future: custom bindings note */}
      <p className="text-xs text-muted-foreground/70 border border-dashed border-border rounded-xl px-4 py-3">
        Custom keybindings are coming in a future update. Shortcuts are read-only for now.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PreferencesPage() {
  const [activeTab, setActiveTab] = useState("profile");

  // Support linking directly to a tab via ?tab=shortcuts etc.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab    = params.get("tab");
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab);
  }, []);

  const TAB_CONTENT = {
    profile:   <ProfileTab />,
    security:  <SecurityTab />,
    shortcuts: <ShortcutsTab />,
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — tab list */}
      <aside className="w-52 flex-shrink-0 border-r bg-muted/20 py-6 px-3 space-y-0.5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-3">
          Preferences
        </p>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left",
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-10 py-8">
        <div className="max-w-2xl">
          {/* Tab heading */}
          <div className="mb-8">
            <h1 className="text-xl font-bold">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeTab === "profile"   && "Update your personal information."}
              {activeTab === "security"  && "Manage your account password."}
              {activeTab === "shortcuts" && "View all available keyboard shortcuts."}
            </p>
          </div>

          {TAB_CONTENT[activeTab]}
        </div>
      </main>
    </div>
  );
}
