import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  SlidersHorizontal,
  Keyboard,
  UserCircle,
  ChevronsUpDown,
  ChevronDown,
  Sun,
  Moon,
  MoonStar,
  BellOff,
  BellRing,
  Check,
  Plus,
  Building2,
} from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { Avatar } from "@/shared/components/ui/avatar";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import { cn } from "@/shared/lib/utils";
import NotificationBell from "@/shared/components/layout/NotificationBell";
import { FOCUS_DURATIONS } from "@/shared/lib/constants";
import { useWorkspaces } from "@/shared/hooks/useWorkspace";
import { ShortcutTooltip } from "../ui/ShortcutTooltip";

const THEMES = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "midnight", label: "Midnight", icon: MoonStar },
];

const DropdownItem = ({
  icon: Icon,
  label,
  onClick,
  shortcut,
  variant = "default",
  description,
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left rounded-md",
      variant === "destructive" && "text-destructive hover:text-destructive",
    )}
  >
    <Icon
      className={cn(
        "w-4 h-4 flex-shrink-0",
        variant !== "destructive" && "text-muted-foreground",
      )}
    />
    <span className="flex-1">{label}</span>
    {description && (
      <span className="text-[10px] text-muted-foreground">{description}</span>
    )}
    {shortcut && (
      <kbd className="text-[10px] font-semibold bg-muted border border-border rounded px-1 py-0.5 leading-none">
        {shortcut}
      </kbd>
    )}
  </button>
);

function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();
  return (
    <div className="px-3 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-0.5">
        Theme
      </p>
      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
        {THEMES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTheme(key)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-1.5 rounded-md text-[10px] font-medium transition-colors",
              theme === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FocusModeSection({ isFocusMode, onEnable, onDisable, onClose }) {
  const [expanded, setExpanded] = useState(false);

  if (isFocusMode) {
    return (
      <button
        onClick={() => {
          onDisable();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left rounded-md bg-violet-500/10 text-violet-600 hover:bg-violet-500/15 transition-colors"
      >
        <BellOff className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">Focus Mode on</span>
        <span className="text-[10px] text-violet-500/70">tap to disable</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left rounded-md"
      >
        <BellRing className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1">Focus Mode</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-150",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="mt-0.5 mb-0.5">
          <p className="px-3 pt-0.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
            Mute notifications for
          </p>
          {FOCUS_DURATIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => {
                onEnable(d.hours);
                onClose();
              }}
              className="w-full text-left pl-9 pr-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors rounded-md"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const VISIBLE_LIMIT = 2;

function WorkspaceSwitcherSection({ workspaceId, canCreate, onClose }) {
  const navigate = useNavigate();
  const { data: allWorkspaces = [] } = useWorkspaces();
  const [expanded, setExpanded] = useState(false);

  const visible = allWorkspaces.slice(0, VISIBLE_LIMIT);
  const hidden = allWorkspaces.slice(VISIBLE_LIMIT);
  const hasMore = hidden.length > 0;

  const goTo = (id) => {
    navigate(`/w/${id}`);
    onClose();
  };

  const WsRow = ({ ws }) => (
    <button
      key={ws.id}
      onClick={() => goTo(ws.id)}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
    >
      <div className="w-6 h-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">
        {ws.name?.[0]?.toUpperCase()}
      </div>
      <span className="text-sm flex-1 truncate">{ws.name}</span>
      {ws.id === workspaceId && (
        <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
      )}
    </button>
  );

  return (
    <div className="px-1 pt-1 pb-0.5">
      <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
        <Building2 className="w-3 h-3 text-muted-foreground/60" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Workspaces
        </p>
      </div>

      {visible.map((ws) => (
        <WsRow key={ws.id} ws={ws} />
      ))}

      {hasMore && (
        <>
          {expanded && hidden.map((ws) => <WsRow key={ws.id} ws={ws} />)}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left text-muted-foreground hover:text-foreground"
          >
            <div className="w-6 h-6 rounded-md border border-border/60 flex items-center justify-center flex-shrink-0">
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-150",
                  expanded && "rotate-180",
                )}
              />
            </div>
            <span className="text-sm">
              {expanded
                ? "Show less"
                : `${hidden.length} more workspace${hidden.length > 1 ? "s" : ""}`}
            </span>
          </button>
        </>
      )}

      {canCreate && (
        <button
          onClick={() => {
            navigate("/onboarding");
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left text-muted-foreground hover:text-foreground"
        >
          <div className="w-6 h-6 rounded-md border border-dashed border-border flex items-center justify-center flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm">New workspace</span>
        </button>
      )}
    </div>
  );
}

export default function UserPanel({
  user,
  workspace,
  workspaceId,
  isFocusMode,
  collapsed = false,
  onEnableFocus,
  onDisableFocus,
  onOpenSettings,
  onOpenShortcuts,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const ref = useRef(null);

  const name = user?.full_name || "User";

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Open the profile menu from the global "u" shortcut.
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jcn:open-profile", handler);
    return () => window.removeEventListener("jcn:open-profile", handler);
  }, []);

  const action = (fn) => () => {
    fn();
    setOpen(false);
  };

  const menuItems = [
    {
      icon: UserCircle,
      label: "Account settings",
      onClick: () => onOpenSettings("me"),
      shortcut: ",",
    },
    {
      icon: SlidersHorizontal,
      label: "Preferences",
      onClick: () => onOpenSettings("preferences"),
    },
    {
      icon: Keyboard,
      label: "Keyboard shortcuts",
      onClick: onOpenShortcuts,
      shortcut: "?",
    },
  ];

  // Shared dropdown body used in both expanded and collapsed layouts
  const dropdownContent = (
    <>
      {/* Profile header */}
      <div className="flex items-center gap-3 px-3 py-2.5 mx-1 mt-1 mb-1 rounded-md bg-muted/40">
        <div className="relative flex-shrink-0">
          <Avatar user={user} name={name} size="lg" />
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-popover" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{name}</p>
          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
            {user?.email}
          </p>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Online
          </span>
        </div>
      </div>

      {/* Account / settings items */}
      <div className="px-1">
        {menuItems.map((item) => (
          <DropdownItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            onClick={action(item.onClick)}
            shortcut={item.shortcut ?? undefined}
          />
        ))}
      </div>

      <div className="border-t border-border my-1" />

      <WorkspaceSwitcherSection
        workspaceId={workspaceId}
        canCreate={user?.can_create_workspace ?? false}
        onClose={() => setOpen(false)}
      />

      <div className="border-t border-border my-1" />
      <div className="px-1">
        <FocusModeSection
          isFocusMode={isFocusMode}
          onEnable={onEnableFocus}
          onDisable={onDisableFocus}
          onClose={() => setOpen(false)}
        />
      </div>
      <div className="border-t border-border my-1" />
      <ThemeSwitcher />
      <div className="border-t border-border my-1" />

      <div className="px-1">
        <DropdownItem
          icon={LogOut}
          label="Sign out"
          onClick={action(() => setConfirmLogout(true))}
          variant="destructive"
        />
      </div>
    </>
  );

  const confirmModal = confirmLogout && (
    <ConfirmModal
      title="Sign out?"
      message="Are you sure you want to log out? You'll be returned to the login screen."
      confirmLabel="Sign out"
      onConfirm={() => {
        setConfirmLogout(false);
        onLogout();
      }}
      onCancel={() => setConfirmLogout(false)}
    />
  );

  // ── Collapsed: just the avatar, dropdown flies out to the right ──────────────
  if (collapsed) {
    return (
      <div
        ref={ref}
        className="border-t border-border/60 py-3 flex justify-center relative"
      >
        <ShortcutTooltip
          label={name}
          shortcut="u"
          side="right"
          delayDuration={200}
        >
          <button
            data-tour="shortcuts_prompt"
            onClick={() => setOpen((v) => !v)}
            className="relative"
            // title={name}
            aria-label="Account menu"
          >
            <Avatar user={user} name={name} size="md" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[hsl(var(--sidebar-bg))]" />
          </button>
        </ShortcutTooltip>

        {open && (
          <div className="absolute left-full bottom-0 ml-2 z-50 w-64 bg-popover border border-border rounded-md shadow-popover py-1 animate-scale-in origin-bottom-left">
            {dropdownContent}
          </div>
        )}

        {confirmModal}
      </div>
    );
  }

  // ── Expanded: full trigger row, dropdown opens upward ────────────────────────
  return (
    <div
      ref={ref}
      className="px-3 pb-3 pt-2 border-t border-border/60 relative"
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5 rounded-lg hover:bg-accent transition-colors group">
        <button
          data-tour="shortcuts_prompt"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
        >
          <div className="relative flex-shrink-0">
            <Avatar user={user} name={name} size="md" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[hsl(var(--sidebar-bg))]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight text-foreground">
              {name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
              {workspace?.name ?? user?.email}
            </p>
          </div>
        </button>

        <NotificationBell />
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Account menu"
        >
          <ChevronsUpDown className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="absolute left-3 right-3 bottom-full mb-1 z-50 bg-popover border border-border rounded-md shadow-popover py-1 animate-scale-in origin-bottom">
          {dropdownContent}
        </div>
      )}

      {confirmModal}
    </div>
  );
}
