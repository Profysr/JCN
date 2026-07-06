import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  User,
  FileText,
  CalendarDays,
  MessageSquare,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  Building2,
  MapPin,
  Calendar,
  ChevronRight,
  Users,
  Phone,
  Home,
  ShieldAlert,
  Landmark,
} from "lucide-react";

import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import Select from "@/shared/components/ui/Select";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard, DetailRow, Chip } from "@/shared/components/ui/SectionCard";
import { Tabs, TabsUnderlineList, TabsUnderlineTrigger, TabsContent } from "@/shared/components/ui/Tabs";
import { cn } from "@/shared/lib/utils";
import { COUNTRIES, flagComponent } from "@/shared/lib/locale";
import { useMembers } from "@/shared/hooks/useMembers";
import { usePermission } from "@/contexts/PermissionsContext";
import { useLeaveRequests } from "@/apps/people/hooks/useLeave";
import { useEmployeeNotes, useCreateEmployeeNote, useUpdateEmployeeNote, useDeleteEmployeeNote } from "@/apps/people/hooks/useEmployeeNotes";
import { useOrgProfile, useUpdateOrgProfile, useJobTitles } from "@/apps/people/hooks/useOrg";
import DocumentsPanel from "@/apps/people/components/DocumentsPanel";
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  getEmploymentLabel,
  getGenderLabel,
  getMaritalLabel,
  formatDate,
} from "@/apps/people/constants";

const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
const emptyContact = () => ({ name: "", relationship: "", phone: "", email: "" });

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "leave", label: "Leave history", icon: CalendarDays },
  { key: "notes", label: "Notes", icon: MessageSquare },
];

const LIST_CONTAINER_CLASS = "divide-y border rounded-lg";

// ── Shared Shared/UI Helpers ──────────────────────────────────────────────────
function FormField({ label, children, hint }) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground block mt-1">{hint}</span>}
    </label>
  );
}

function BaseInput({ className, ...props }) {
  return (
    <input
      className={cn("mt-1 w-full border rounded px-3 py-2 text-sm bg-background", className)}
      {...props}
    />
  );
}

function StatusChip({ status }) {
  const map = {
    pending: { icon: Clock, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    approved: { icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    rejected: { icon: XCircle, cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
    cancelled: { icon: XCircle, cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  };
  const { icon: Icon, cls } = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize", cls)}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

// ── Profile Tab Components ────────────────────────────────────────────────────
function EditSectionHeading({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="w-3.5 h-3.5" /> {children}
    </div>
  );
}

// Full self-service / HR profile editor — mirrors the sections collected during
// employee onboarding (see EmployeeOnboardingPage) so anything captured there can
// be viewed and updated later from the same place.
function ProfileEditForm({ form, setForm, jobTitles, onSave, onCancel, isPending }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const contacts = form.emergency_contacts ?? [];
  const setContact = (i, k, v) =>
    setForm((f) => ({
      ...f,
      emergency_contacts: f.emergency_contacts.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)),
    }));
  const addContact = () =>
    setForm((f) => ({ ...f, emergency_contacts: [...(f.emergency_contacts ?? []), emptyContact()] }));
  const removeContact = (i) =>
    setForm((f) => ({ ...f, emergency_contacts: f.emergency_contacts.filter((_, idx) => idx !== i) }));

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
    <div className="space-y-4">
      {/* Employment */}
      <EditSectionHeading icon={Briefcase}>Employment</EditSectionHeading>
      <div className="grid md:grid-cols-2 gap-4">
        <FormField label="Employment type">
          <Select className="mt-1" value={form.employment_type} onChange={(v) => set("employment_type", v)} options={EMPLOYMENT_TYPES} />
        </FormField>
        <FormField label="Job title">
          <Select
            className="mt-1"
            placeholder="— None —"
            value={form.job_title_id}
            onChange={(v) => set("job_title_id", v)}
            options={[{ value: "", label: "— None —" }, ...jobTitles.map((jt) => ({ value: jt.id, label: jt.name }))]}
          />
        </FormField>
        <FormField label="Employee ID">
          <BaseInput value={form.employee_id} onChange={(e) => set("employee_id", e.target.value)} />
        </FormField>
        <FormField label="Start date">
          <BaseInput type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </FormField>
        <FormField label="Location">
          <BaseInput value={form.location} onChange={(e) => set("location", e.target.value)} />
        </FormField>
      </div>
      <FormField
        label="Work location (Google Maps link)"
        hint="Paste a Maps share link — coordinates are derived automatically and used for attendance geofencing."
      >
        <BaseInput
          type="url"
          placeholder="https://maps.google.com/…"
          value={form.work_location_url}
          onChange={(e) => set("work_location_url", e.target.value)}
        />
      </FormField>

      {/* Personal */}
      <EditSectionHeading icon={User}>Personal</EditSectionHeading>
      <div className="grid md:grid-cols-2 gap-4">
        <FormField label="Personal email">
          <BaseInput type="email" value={form.personal_email} onChange={(e) => set("personal_email", e.target.value)} />
        </FormField>
        <FormField label="Contact number">
          <BaseInput value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </FormField>
        <FormField label="Date of birth">
          <BaseInput type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        </FormField>
        <FormField label="Gender">
          <Select className="mt-1" placeholder="Select…" value={form.gender} onChange={(v) => set("gender", v)} options={GENDERS} />
        </FormField>
        <FormField label="Marital status">
          <Select className="mt-1" placeholder="Select…" value={form.marital_status} onChange={(v) => set("marital_status", v)} options={MARITAL_STATUSES} />
        </FormField>
        <FormField label="Nationality">
          <Select className="mt-1" searchable placeholder="Select…" value={form.nationality} onChange={(v) => set("nationality", v)} options={countryOptions} />
        </FormField>
      </div>

      {/* Home address */}
      <EditSectionHeading icon={Home}>Home address</EditSectionHeading>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <FormField label="Address line 1">
            <BaseInput value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="Address line 2">
            <BaseInput value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} />
          </FormField>
        </div>
        <FormField label="City"><BaseInput value={form.city} onChange={(e) => set("city", e.target.value)} /></FormField>
        <FormField label="State / Region"><BaseInput value={form.state_region} onChange={(e) => set("state_region", e.target.value)} /></FormField>
        <FormField label="Postal code"><BaseInput value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></FormField>
        <FormField label="Country">
          <Select className="mt-1" searchable placeholder="Select…" value={form.country} onChange={(v) => set("country", v)} options={countryOptions} />
        </FormField>
      </div>

      {/* Emergency contacts */}
      <EditSectionHeading icon={ShieldAlert}>Emergency contacts</EditSectionHeading>
      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div key={i} className="rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {i === 0 ? "Primary contact" : `Contact ${i + 1}`}
              </span>
              <button
                type="button"
                onClick={() => removeContact(i)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove contact"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <FormField label="Name"><BaseInput value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} /></FormField>
              <FormField label="Relationship"><BaseInput value={c.relationship} onChange={(e) => setContact(i, "relationship", e.target.value)} placeholder="e.g. Spouse" /></FormField>
              <FormField label="Phone"><BaseInput value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} /></FormField>
              <FormField label="Email"><BaseInput type="email" value={c.email} onChange={(e) => setContact(i, "email", e.target.value)} /></FormField>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addContact}>
          <Plus className="w-4 h-4 mr-1" /> Add contact
        </Button>
      </div>

      {/* Bank & IDs */}
      <EditSectionHeading icon={Landmark}>Bank &amp; IDs</EditSectionHeading>
      <div className="grid md:grid-cols-2 gap-4">
        <FormField label="Bank name"><BaseInput value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></FormField>
        <FormField label="Account holder name"><BaseInput value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} /></FormField>
        <FormField label="Account number"><BaseInput value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} /></FormField>
        <FormField label="IBAN"><BaseInput value={form.bank_iban} onChange={(e) => set("bank_iban", e.target.value)} /></FormField>
        <FormField label="National ID"><BaseInput value={form.national_id} onChange={(e) => set("national_id", e.target.value)} /></FormField>
      </div>

      {/* Bio */}
      <EditSectionHeading icon={FileText}>About</EditSectionHeading>
      <FormField label="Bio">
        <textarea
          className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background resize-none"
          rows={3}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
        />
      </FormField>

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={onSave} disabled={isPending}>
          <Check className="w-4 h-4 mr-1" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function ProfileTab({ workspaceId, memberId, isAdmin }) {
  const { data: profile, isLoading } = useOrgProfile(workspaceId, memberId);
  const { data: jobTitles = [] } = useJobTitles(workspaceId);
  const update = useUpdateOrgProfile(workspaceId, memberId);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  function startEdit() {
    setForm({
      // Employment
      employment_type: profile?.employment_type ?? "full_time",
      job_title_id: profile?.job_title?.id ?? "",
      employee_id: profile?.employee_id ?? "",
      start_date: profile?.start_date ?? "",
      location: profile?.location ?? "",
      work_location_url: profile?.work_location_url ?? "",
      // Personal
      personal_email: profile?.personal_email ?? "",
      phone: profile?.phone ?? "",
      date_of_birth: profile?.date_of_birth ?? "",
      gender: profile?.gender ?? "",
      marital_status: profile?.marital_status ?? "",
      nationality: profile?.nationality ?? "",
      // Home address
      address_line1: profile?.address_line1 ?? "",
      address_line2: profile?.address_line2 ?? "",
      city: profile?.city ?? "",
      state_region: profile?.state_region ?? "",
      postal_code: profile?.postal_code ?? "",
      country: profile?.country ?? "",
      // Emergency contacts
      emergency_contacts: (profile?.emergency_contacts ?? []).map((c) => ({
        name: c.name ?? "",
        relationship: c.relationship ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
      })),
      // Bank & IDs
      bank_name: profile?.bank_name ?? "",
      bank_account_name: profile?.bank_account_name ?? "",
      bank_account_number: profile?.bank_account_number ?? "",
      bank_iban: profile?.bank_iban ?? "",
      national_id: profile?.national_id ?? "",
      bio: profile?.bio ?? "",
    });
    setEditing(true);
  }

  function saveEdit() {
    const payload = { ...form };
    // Emergency contacts are a replace-the-set write (see backend
    // _sync_emergency_contacts); drop rows with no name.
    payload.emergency_contacts = (form.emergency_contacts ?? []).filter((c) => c.name?.trim());
    // Empty date/FK fields must be omitted rather than sent as "".
    if (!payload.job_title_id) delete payload.job_title_id;
    if (!payload.start_date) delete payload.start_date;
    if (!payload.date_of_birth) delete payload.date_of_birth;
    update.mutate(payload, { onSuccess: () => setEditing(false) });
  }

  if (isLoading) return <Loader className="h-40" />;
  if (!profile) return null;

  const user = profile.member?.user;
  const isLocked = profile.locked;

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="h-20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <div className="px-6 pb-6">
          <div className="-mt-9 mb-4 flex items-end justify-between">
            <Avatar
              user={user}
              name={user?.full_name || user?.email}
              size="xl"
              className="ring-4 ring-background rounded-full"
            />
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold",
                isLocked 
                  ? "bg-muted text-muted-foreground" 
                  : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 border border-green-200 dark:border-green-800"
              )}>
                {isLocked ? "Locked" : "Editable"}
              </span>
              {isAdmin && !editing && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update.mutate({ locked: !isLocked })}
                    disabled={update.isPending}
                  >
                    {isLocked ? "Unlock" : "Lock"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                </>
              )}
            </div>
          </div>

          <h1 className="text-xl font-bold tracking-tight">{user?.full_name || user?.email}</h1>
          {profile.job_title && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {profile.job_title.name}
              {profile.job_title.level > 0 && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  L{profile.job_title.level}
                </span>
              )}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>

          {!editing && (
            <>
              <div className="flex flex-wrap gap-2 mt-4">
                {profile.employment_type && (
                  <Chip label={getEmploymentLabel(profile.employment_type)} className="bg-muted text-muted-foreground" />
                )}
                {profile.location && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" /> {profile.location}
                  </span>
                )}
                {profile.start_date && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" /> Joined {formatDate(profile.start_date)}
                  </span>
                )}
              </div>
              {profile.bio && (
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
                  {profile.bio}
                </p>
              )}
            </>
          )}

          {editing && (
            <div className="mt-4 border-t border-border/50 pt-4">
              <ProfileEditForm
                form={form}
                setForm={setForm}
                jobTitles={jobTitles}
                onSave={saveEdit}
                onCancel={() => setEditing(false)}
                isPending={update.isPending}
              />
            </div>
          )}
        </div>
      </div>

      {/* Grid Subsections */}
      {!editing && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="flex flex-col gap-5">
            <SectionCard title="Reports to" icon={User}>
              {profile.manager ? (
                <Link to={`/w/${workspaceId}/people/${profile.manager.id}`} className="flex items-center gap-3 group">
                  <Avatar
                    user={{ full_name: profile.manager.name, email: profile.manager.email }}
                    name={profile.manager.name || profile.manager.email}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                      {profile.manager.name || profile.manager.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{profile.manager.email}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 group-hover:text-primary transition-colors" />
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground italic">No manager set</p>
              )}
            </SectionCard>

            {profile.direct_reports_count > 0 && (
              <SectionCard title="Direct Reports" icon={Users}>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">{profile.direct_reports_count}</span>
                  <span className="text-sm text-muted-foreground">
                    {profile.direct_reports_count === 1 ? "person" : "people"} reporting to them
                  </span>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Employment" icon={Briefcase}>
              <DetailRow label="Type" value={getEmploymentLabel(profile.employment_type)} />
              <DetailRow label="Employee ID" value={profile.employee_id || null} />
              <DetailRow label="Start date" value={formatDate(profile.start_date)} />
              <DetailRow label="Location" value={profile.location || null} />
              {profile.work_location_url && (
                <DetailRow
                  label="Work location"
                  value={
                    <a
                      href={profile.work_location_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      {profile.work_latitude != null && profile.work_longitude != null
                        ? `${Number(profile.work_latitude).toFixed(4)}, ${Number(profile.work_longitude).toFixed(4)}`
                        : "View on map"}
                    </a>
                  }
                />
              )}
            </SectionCard>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-5">
            <SectionCard title="Departments" icon={Building2}>
              {profile.departments?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.departments.map((d) => <Chip key={d.id} label={d.name} color={d.color} />)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not in any department</p>
              )}
            </SectionCard>

            <SectionCard title="Teams" icon={Users}>
              {profile.teams?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.teams.map((t) => <Chip key={t.id} label={t.name} color={t.color} />)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not in any team</p>
              )}
            </SectionCard>

            <SectionCard title="Personal" icon={User}>
              <DetailRow label="Personal email" value={profile.personal_email || null} />
              <DetailRow label="Contact number" value={profile.phone || null} />
              <DetailRow label="Date of birth" value={formatDate(profile.date_of_birth)} />
              <DetailRow label="Gender" value={profile.gender ? getGenderLabel(profile.gender) : null} />
              <DetailRow label="Marital status" value={profile.marital_status ? getMaritalLabel(profile.marital_status) : null} />
              <DetailRow label="Nationality" value={profile.nationality ? countryName(profile.nationality) : null} />
              {!profile.personal_email && !profile.phone && !profile.date_of_birth &&
                !profile.gender && !profile.marital_status && !profile.nationality && (
                  <p className="text-sm text-muted-foreground italic">No personal details on file</p>
                )}
            </SectionCard>

            <SectionCard title="Home address" icon={Home}>
              {profile.address_line1 || profile.city || profile.country ? (
                <address className="not-italic text-sm leading-relaxed">
                  {profile.address_line1 && <div>{profile.address_line1}</div>}
                  {profile.address_line2 && <div>{profile.address_line2}</div>}
                  {(profile.city || profile.state_region) && (
                    <div>{[profile.city, profile.state_region].filter(Boolean).join(", ")}</div>
                  )}
                  {(profile.postal_code || profile.country) && (
                    <div>{[profile.postal_code, countryName(profile.country)].filter(Boolean).join(" ")}</div>
                  )}
                </address>
              ) : (
                <p className="text-sm text-muted-foreground italic">No address on file</p>
              )}
            </SectionCard>

            <SectionCard title="Emergency contacts" icon={ShieldAlert}>
              {profile.emergency_contacts?.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {profile.emergency_contacts.map((c, i) => (
                    <div key={c.id ?? i} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.name}</span>
                        {i === 0 && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            Primary
                          </span>
                        )}
                        {c.relationship && (
                          <span className="text-xs text-muted-foreground">· {c.relationship}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                        {c.phone && (
                          <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>
                        )}
                        {c.email && <span>{c.email}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No emergency contacts</p>
              )}
            </SectionCard>

            <SectionCard title="Bank & IDs" icon={Landmark}>
              <DetailRow label="Bank name" value={profile.bank_name || null} />
              <DetailRow label="Account holder" value={profile.bank_account_name || null} />
              <DetailRow label="Account number" value={profile.bank_account_number || null} />
              <DetailRow label="IBAN" value={profile.bank_iban || null} />
              <DetailRow label="National ID" value={profile.national_id || null} />
              {!profile.bank_name && !profile.bank_account_name && !profile.bank_account_number &&
                !profile.bank_iban && !profile.national_id && (
                  <p className="text-sm text-muted-foreground italic">No bank or ID details on file</p>
                )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leave History Tab Component ───────────────────────────────────────────────
function LeaveHistoryTab({ workspaceId, memberId }) {
  const { data: allRequests = [], isLoading } = useLeaveRequests(workspaceId);

  if (isLoading) return <Loader className="h-40" />;

  const requests = allRequests.filter((r) => r.employee?.id === memberId);

  return (
    <SectionCard title="Leave History" icon={CalendarDays}>
      {requests.length === 0 ? (
        <EmptyState
          illustration="notifications"
          title="No leave requests"
          description="This employee hasn't submitted any leave requests."
        />
      ) : (
        <div className={LIST_CONTAINER_CLASS}>
          {requests.map((req) => (
            <div key={req.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium capitalize">
                    {req.policy?.leave_type?.replace("_", " ")} leave
                  </span>
                  <StatusChip status={req.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(req.start_date)} → {formatDate(req.end_date)}
                </p>
                {req.reason && <p className="text-xs text-muted-foreground mt-1 truncate">{req.reason}</p>}
              </div>
              <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(req.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Notes Tab Component ───────────────────────────────────────────────────────
function NotesTab({ workspaceId, memberId }) {
  const { data: notes = [], isLoading } = useEmployeeNotes(workspaceId, memberId);
  const create = useCreateEmployeeNote(workspaceId, memberId);
  const update = useUpdateEmployeeNote(workspaceId, memberId);
  const remove = useDeleteEmployeeNote(workspaceId, memberId);

  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  function submitNote() {
    if (!newContent.trim()) return;
    create.mutate({ content: newContent, is_private: true }, { onSuccess: () => setNewContent("") });
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function saveEdit() {
    update.mutate(
      { noteId: editingId, content: editContent },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditContent("");
        },
      }
    );
  }

  if (isLoading) return <Loader className="h-40" />;

  return (
    <SectionCard title="Notes" icon={MessageSquare}>
      <div className="space-y-4">
        {/* Compose Input */}
        <div className="border rounded-lg p-3 space-y-2">
          <textarea
            className="w-full text-sm bg-transparent resize-none outline-none placeholder:text-muted-foreground"
            rows={3}
            placeholder="Add a private manager note…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submitNote} disabled={!newContent.trim() || create.isPending}>
              <Plus className="w-4 h-4 mr-1" /> Add note
            </Button>
          </div>
        </div>

        {/* List Content */}
        {notes.length === 0 ? (
          <EmptyState title="No notes yet" description="Private HR notes about this employee will appear here." />
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="border rounded-lg p-4">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full text-sm border rounded px-3 py-2 bg-background resize-none"
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} disabled={update.isPending}>
                        <Check className="w-4 h-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {note.author?.full_name} · {formatDate(note.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => startEdit(note)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove.mutate(note.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Root Master Page Component ────────────────────────────────────────────────
export default function MemberDetailPage() {
  const { workspaceId, memberId } = useParams();
  const navigate = useNavigate();
  const { isOwner, can } = usePermission();
  const { data: members = [], isLoading } = useMembers(workspaceId);
  const [activeTab, setActiveTab] = useState("profile");

  if (isLoading) return <Loader className="h-96" />;

  const member = members.find((m) => m.id === memberId);
  if (!member) return <div className="p-8 text-center text-muted-foreground">Member not found.</div>;

  const isDocsAdmin = isOwner || can("hr.manage_documents");
  const isNotesAdmin = isOwner || can("hr.manage_notes");
  const isProfileAdmin = isOwner || can("member.view_profile") || can("org.manage");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsUnderlineList className="mb-6 overflow-x-auto">
          {TABS.map((tab) => {
            if (tab.key === "notes" && !isNotesAdmin) return null;
            if (tab.key === "documents" && !isDocsAdmin) return null;
            return (
              <TabsUnderlineTrigger key={tab.key} value={tab.key} icon={tab.icon}>
                {tab.label}
              </TabsUnderlineTrigger>
            );
          })}
        </TabsUnderlineList>
 
        <TabsContent value="profile">
          <ProfileTab workspaceId={workspaceId} memberId={memberId} isAdmin={isProfileAdmin} />
        </TabsContent>
        {isDocsAdmin && (
          <TabsContent value="documents">
            <DocumentsPanel workspaceId={workspaceId} memberId={memberId} />
          </TabsContent>
        )}
        <TabsContent value="leave">
          <LeaveHistoryTab workspaceId={workspaceId} memberId={memberId} />
        </TabsContent>
        {isNotesAdmin && (
          <TabsContent value="notes">
            <NotesTab workspaceId={workspaceId} memberId={memberId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}