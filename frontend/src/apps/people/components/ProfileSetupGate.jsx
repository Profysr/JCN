import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Loader } from "@/shared/components/ui/Loader";
import Select from "@/shared/components/ui/Select";
import { usePermission } from "@/contexts/PermissionsContext";
import { useMyOrgProfile, useUpdateMyOrgProfile, useJobTitles } from "@/apps/people/hooks/useOrg";
import { usePeopleSocket } from "@/apps/people/hooks/usePeopleSocket";
import { usePeopleNavShortcuts } from "@/apps/people/hooks/usePeopleShortcuts";
import { EMPLOYMENT_TYPES } from "@/apps/people/constants";

function ProfileSetupForm({ workspaceId, profile }) {
  const jobTitles = useJobTitles(workspaceId);
  const updateProfile = useUpdateMyOrgProfile(workspaceId);

  const [form, setForm] = useState({
    job_title_id: profile?.job_title?.id ?? "",
    employment_type: profile?.employment_type ?? "full_time",
    location: profile?.location ?? "",
    bio: profile?.bio ?? "",
    start_date: profile?.start_date ?? "",
    employee_id: profile?.employee_id ?? "",
  });
  const [errors, setErrors] = useState({});

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    const newErrors = {};
    if (!form.job_title_id) newErrors.job_title_id = "Please select a job title.";
    if (!form.employment_type) newErrors.employment_type = "Required.";
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const payload = { ...form };
    if (!payload.start_date) delete payload.start_date;
    if (!payload.employee_id) delete payload.employee_id;

    // On success, profile.job_title is set, so ProfileSetupGate stops
    // rendering this wall on the next render — no separate submit step.
    updateProfile.mutate(payload);
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-16">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
            <Building2 className="h-7 w-7 text-blue-500" />
          </div>
          <h1 className="text-2xl font-semibold">Set up your profile</h1>
          <p className="text-sm text-muted-foreground">
            Before you can access the workspace, let HR know a bit about your role.
            This only takes a minute.
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <Label>
              Job Title <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.job_title_id}
              onChange={(v) => set("job_title_id", v)}
              disabled={jobTitles.isLoading}
              placeholder="Select your title…"
              triggerClassName={errors.job_title_id ? "border-destructive" : ""}
              options={(jobTitles.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            />
            {errors.job_title_id && (
              <p className="text-xs text-destructive">{errors.job_title_id}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Employment Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.employment_type}
              onChange={(v) => set("employment_type", v)}
              options={EMPLOYMENT_TYPES}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Employee ID</Label>
              <Input
                placeholder="e.g. EMP-001"
                value={form.employee_id}
                onChange={(e) => set("employee_id", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Location</Label>
            <Input
              placeholder="e.g. London, UK"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Short Bio</Label>
            <Textarea
              placeholder="A few words about what you do…"
              rows={3}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending && <Loader size="sm" className="mr-2" />}
            Save & Continue
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can update these details later — HR can also fill this in for you.
        </p>
      </div>
    </div>
  );
}

/**
 * Wraps every People/HR route (see App.jsx). Blocks access to the People/HR
 * app until the member has filled their job profile at least once — but
 * unlike the old approval-based gate, there's no waiting once they save: the
 * backend auto-locks the profile on save (read-only until HR unlocks it
 * again), and that lock never blocks navigation, only this initial
 * "not filled out yet" state does.
 *
 * Applies to everyone, including the workspace owner — no exemption.
 */
export default function ProfileSetupGate() {
  const { workspaceId } = useParams();
  usePeopleSocket();
  usePeopleNavShortcuts();
  const { isLoading: permsLoading } = usePermission();
  // const isExempt = isOwner || can("settings.manage");
  const isExempt = false;
  const { data: profile, isLoading: profileLoading } = useMyOrgProfile(workspaceId, {
    enabled: !isExempt,
  });

  if (permsLoading || (!isExempt && profileLoading)) {
    return <Loader className="min-h-screen" size="lg" />;
  }

  if (!isExempt && profile && !profile.job_title) {
    return <ProfileSetupForm workspaceId={workspaceId} profile={profile} />;
  }

  return <Outlet />;
}
