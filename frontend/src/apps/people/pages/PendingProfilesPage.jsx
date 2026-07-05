import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, UserCheck, CheckSquare, Square, ChevronDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Avatar } from "@/shared/components/ui/avatar";
import { useToast } from "@/shared/components/ui/toast";
import { cn } from "@/shared/lib/utils";
import {
  usePendingProfiles,
  useApproveProfile,
  useBulkApproveProfiles,
} from "@/apps/people/hooks/useOrg";
import { getEmploymentLabel, formatDate } from "@/apps/people/constants";
import PendingProfileModal from "@/apps/people/components/PendingProfileModal";

function ProfileCard({ profile, isSelected, onToggle, onApprove, isApproving, onReview }) {
  const member = profile.member;
  const user = member?.user;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card flex flex-col shadow-sm transition-all duration-150",
        isSelected
          ? "border-primary/50 ring-1 ring-primary/30 shadow-primary/5"
          : "border-border hover:shadow-md",
      )}
    >
      {/* Card header */}
      <div className="p-4 flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(profile.id)}
          className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
          aria-label={isSelected ? "Deselect" : "Select"}
        >
          {isSelected ? (
            <CheckSquare className="w-4.5 h-4.5 text-primary" />
          ) : (
            <Square className="w-4.5 h-4.5" />
          )}
        </button>

        {/* Clickable avatar/name area opens the review modal */}
        <button onClick={onReview} className="flex items-start gap-3 flex-1 min-w-0 text-left group">
          <Avatar user={user} size="md" className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {user?.full_name || user?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-muted text-muted-foreground">
              {member?.role}
            </span>
          </div>
        </button>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-2 py-1 rounded-full font-medium">
            <Clock className="w-3 h-3" /> Pending
          </span>
          {profile.submitted_at && (
            <span className="text-[10px] text-muted-foreground">{formatDate(profile.submitted_at)}</span>
          )}
        </div>
      </div>

      {/* Collapsible details */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 px-4 pb-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Hide details" : "Show details"}
      </button>

      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-border/40 pt-3 mx-4">
          {profile.job_title && (
            <div>
              <p className="text-muted-foreground">Job Title</p>
              <p className="font-medium">{profile.job_title.name}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Employment</p>
            <p className="font-medium">{getEmploymentLabel(profile.employment_type)}</p>
          </div>
          {profile.location && (
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium">{profile.location}</p>
            </div>
          )}
          {profile.employee_id && (
            <div>
              <p className="text-muted-foreground">Employee ID</p>
              <p className="font-medium font-mono">{profile.employee_id}</p>
            </div>
          )}
          {profile.bio && (
            <div className="col-span-2 mt-1">
              <p className="text-muted-foreground">Bio</p>
              <p className="line-clamp-2">{profile.bio}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 pt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={onReview}
        >
          Review
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onApprove(profile.id)}
          disabled={isApproving}
        >
          {isApproving ? (
            <Loader size="sm" className="mr-2" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mr-2" />
          )}
          Approve
        </Button>
      </div>
    </div>
  );
}

export default function PendingProfilesPage() {
  const { workspaceId } = useParams();
  const { data: profiles = [], isLoading } = usePendingProfiles(workspaceId);
  const approveProfile = useApproveProfile(workspaceId);
  const bulkApprove = useBulkApproveProfiles(workspaceId);
  const { toast } = useToast();

  const [selected, setSelected] = useState(new Set());
  const [modalIndex, setModalIndex] = useState(null); // null = closed

  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === profiles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(profiles.map((p) => p.id)));
    }
  };

  const handleApproveOne = async (profileId) => {
    try {
      await approveProfile.mutateAsync(profileId);
      setSelected((prev) => { const next = new Set(prev); next.delete(profileId); return next; });
      toast.success("Profile approved");
    } catch {
      toast.error("Couldn't approve profile");
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    try {
      const result = await bulkApprove.mutateAsync(ids);
      setSelected(new Set());
      toast.success(`${result.approved} profile${result.approved !== 1 ? "s" : ""} approved`);
    } catch {
      toast.error("Bulk approve failed");
    }
  };

  const allSelected = profiles.length > 0 && selected.size === profiles.length;
  const someSelected = selected.size > 0;

  return (
    <>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 flex-shrink-0">
              <UserCheck className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Profile Review Queue</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Members waiting for HR approval before they can access the org app.
              </p>
            </div>
          </div>

          {/* Bulk action bar */}
          {someSelected && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
              <span className="text-sm font-medium">
                {selected.size} selected
              </span>
              <Button
                size="sm"
                onClick={handleBulkApprove}
                disabled={bulkApprove.isPending}
                className="ml-2"
              >
                {bulkApprove.isPending ? (
                  <Loader size="sm" className="mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Approve {selected.size}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={bulkApprove.isPending}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {isLoading && <Loader className="h-48" />}

        {!isLoading && profiles.length === 0 && (
          <EmptyState
            illustration="members"
            title="No pending profiles"
            description="All submitted profiles have been reviewed. New submissions will appear here."
          />
        )}

        {!isLoading && profiles.length > 0 && (
          <>
            {/* Select-all + count row */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {allSelected ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="text-muted-foreground/40 select-none">·</span>
              <span className="text-sm text-muted-foreground">
                {profiles.length} profile{profiles.length !== 1 ? "s" : ""} awaiting review
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {profiles.map((profile, i) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isSelected={selected.has(profile.id)}
                  onToggle={toggleOne}
                  onApprove={handleApproveOne}
                  isApproving={approveProfile.isPending && approveProfile.variables === profile.id}
                  onReview={() => setModalIndex(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Review modal */}
      {modalIndex !== null && profiles.length > 0 && (
        <PendingProfileModal
          profiles={profiles}
          index={Math.min(modalIndex, profiles.length - 1)}
          onClose={() => setModalIndex(null)}
          onNavigate={setModalIndex}
          onApprove={handleApproveOne}
          isApproving={approveProfile.isPending}
        />
      )}
    </>
  );
}
