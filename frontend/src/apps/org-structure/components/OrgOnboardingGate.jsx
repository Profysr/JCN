import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Building2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Loader } from "@/shared/components/ui/Loader";
import Select from "@/shared/components/ui/Select";
import { usePermission } from "@/contexts/PermissionsContext";
import {
  useMyOrgProfile,
  useUpdateMyOrgProfile,
  useSubmitMyOrgProfile,
  useJobTitles,
} from "../hooks/useOrg";
import { usePeopleSocket } from "../hooks/usePeopleSocket";
import { EMPLOYMENT_TYPES, ONBOARDING_STATUS } from "../constants";

function OnboardingWall({ workspaceId, profile }) {
  const jobTitles = useJobTitles(workspaceId);
  const updateProfile = useUpdateMyOrgProfile(workspaceId);
  const submitProfile = useSubmitMyOrgProfile(workspaceId);

  const [form, setForm] = useState({
    job_title_id: profile?.job_title?.id ?? "",
    employment_type: profile?.employment_type ?? "full_time",
    location: profile?.location ?? "",
    bio: profile?.bio ?? "",
    start_date: profile?.start_date ?? "",
    employee_id: profile?.employee_id ?? "",
  });
  const [step, setStep] = useState("form"); // "form" | "submitted"
  const [errors, setErrors] = useState({});

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSaveAndSubmit = async () => {
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

    await updateProfile.mutateAsync(payload);
    await submitProfile.mutateAsync();
    setStep("submitted");
  };

  if (step === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold">Profile submitted!</h2>
          <p className="text-sm text-muted-foreground">
            Your profile is pending review by HR. You'll be notified once it's approved.
            In the meantime you can start exploring the org.
          </p>
          <Button onClick={() => window.location.reload()}>Continue to Org</Button>
        </div>
      </div>
    );
  }

  const isSaving = updateProfile.isPending || submitProfile.isPending;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-16">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
            <Building2 className="h-7 w-7 text-blue-500" />
          </div>
          <h1 className="text-2xl font-semibold">Set up your profile</h1>
          <p className="text-sm text-muted-foreground">
            Before you can access the org app, let HR know a bit about your role.
            This only takes a minute.
          </p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm">
          {/* Job Title */}
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

          {/* Employment Type */}
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

          {/* Start Date + Employee ID side by side */}
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

          {/* Location */}
          <div className="flex flex-col gap-1.5">
            <Label>Location</Label>
            <Input
              placeholder="e.g. London, UK"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>

          {/* Bio */}
          <div className="flex flex-col gap-1.5">
            <Label>Short Bio</Label>
            <Textarea
              placeholder="A few words about what you do…"
              rows={3}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSaveAndSubmit}
            disabled={isSaving}
          >
            {isSaving && <Loader size="sm" className="mr-2" />}
            Submit Profile
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          HR will review your profile. You can update it anytime after submission.
        </p>
      </div>
    </div>
  );
}

function SubmittedBanner() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
      <Clock className="w-4 h-4 flex-shrink-0" />
      <span>
        <strong className="font-semibold">Profile pending review.</strong>{" "}
        HR will approve your profile shortly. You'll receive an email when it's done.
      </span>
    </div>
  );
}

export default function OrgOnboardingGate() {
  const { workspaceId } = useParams();
  usePeopleSocket();
  const { isOwner, can, isLoading: permsLoading } = usePermission();
  const isAdmin = isOwner || can("settings.manage");
  const { data: profile, isLoading: profileLoading } = useMyOrgProfile(workspaceId, {
    enabled: !isAdmin,
  });

  if (permsLoading || (!isAdmin && profileLoading)) {
    return <Loader className="min-h-screen" size="lg" />;
  }

  // Admins created their workspace before there was anyone in HR to approve them — the onboarding wall (which exists to gate non-admins, matching backend `_require_onboarded`) never applies to them.
  if (isAdmin) {
    return <Outlet />;
  }

  if (!profile || profile.status === ONBOARDING_STATUS.DRAFT) {
    return <OnboardingWall workspaceId={workspaceId} profile={profile} />;
  }

  return (
    <div className="flex flex-col h-full">
      {profile.status === ONBOARDING_STATUS.SUBMITTED && <SubmittedBanner />}
      <Outlet />
    </div>
  );
}
