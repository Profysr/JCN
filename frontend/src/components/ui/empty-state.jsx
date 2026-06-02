import { cn } from "@/lib/utils";

/* Inline SVG illustrations — zero network requests */

function IllustrationTasks() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="10" width="56" height="60" rx="8" fill="currentColor" opacity="0.08" />
      <rect x="20" y="22" width="32" height="4" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="20" y="32" width="24" height="4" rx="2" fill="currentColor" opacity="0.18" />
      <rect x="20" y="42" width="28" height="4" rx="2" fill="currentColor" opacity="0.18" />
      <circle cx="56" cy="54" r="14" fill="currentColor" opacity="0.10" />
      <path d="M50 54l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    </svg>
  );
}

function IllustrationProjects() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="24" width="30" height="36" rx="6" fill="currentColor" opacity="0.10" />
      <rect x="42" y="24" width="30" height="36" rx="6" fill="currentColor" opacity="0.06" />
      <rect x="14" y="32" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.30" />
      <rect x="14" y="39" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.20" />
      <rect x="14" y="46" width="16" height="3" rx="1.5" fill="currentColor" opacity="0.20" />
      <rect x="48" y="32" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.20" />
      <rect x="48" y="39" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.14" />
    </svg>
  );
}

function IllustrationMembers() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="30" r="12" fill="currentColor" opacity="0.12" />
      <path d="M12 60c0-11 9-18 20-18s20 7 20 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.20" />
      <circle cx="58" cy="32" r="9" fill="currentColor" opacity="0.08" />
      <path d="M42 60c1-9 8-14 16-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
    </svg>
  );
}

function IllustrationNotifications() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 16c-13 0-22 9-22 22v12l-4 6h52l-4-6V38c0-13-9-22-22-22z" fill="currentColor" opacity="0.10" />
      <path d="M40 16c-13 0-22 9-22 22v12l-4 6h52l-4-6V38c0-13-9-22-22-22z" stroke="currentColor" strokeWidth="1.5" opacity="0.20" strokeLinejoin="round" />
      <path d="M35 56a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

function IllustrationSearch() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="36" cy="36" r="20" fill="currentColor" opacity="0.08" />
      <circle cx="36" cy="36" r="20" stroke="currentColor" strokeWidth="2" opacity="0.20" />
      <path d="M52 52l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.25" />
      <path d="M30 36h12M36 30v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.30" />
    </svg>
  );
}

function IllustrationGeneric() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="16" width="48" height="48" rx="10" fill="currentColor" opacity="0.08" />
      <rect x="28" y="30" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.25" />
      <rect x="28" y="38" width="18" height="3" rx="1.5" fill="currentColor" opacity="0.18" />
      <rect x="28" y="46" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.18" />
    </svg>
  );
}

const ILLUSTRATIONS = {
  tasks:         IllustrationTasks,
  projects:      IllustrationProjects,
  members:       IllustrationMembers,
  notifications: IllustrationNotifications,
  search:        IllustrationSearch,
  default:       IllustrationGeneric,
};

export function EmptyState({
  illustration = "default",
  title,
  description,
  action,
  className,
}) {
  const Illustration = ILLUSTRATIONS[illustration] || ILLUSTRATIONS.default;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in",
        className
      )}
    >
      <div className="mb-4 text-muted-foreground/50">
        <Illustration />
      </div>
      {title && (
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
