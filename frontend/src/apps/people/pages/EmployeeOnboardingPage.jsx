import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import {
  useMyOrgProfile,
  useCompleteOnboarding,
  useJobTitles,
  useDepartments,
  useTeams,
} from "@/apps/people/hooks/useOrg";
import { useMembers } from "@/shared/hooks/useMembers";
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
} from "@/apps/people/constants";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import Select from "@/shared/components/ui/Select";
import { Loader } from "@/shared/components/ui/Loader";
import { useToast } from "@/shared/components/ui/toast";
import { cn } from "@/shared/lib/utils";
import { COUNTRIES, flagComponent } from "@/shared/lib/locale";

const STEPS = [
  "Personal",
  "Address",
  "Emergency",
  "Employment",
  "Team & reporting",
  "Bank & IDs",
  "Review",
];
  
const emptyContact = () => ({
  name: "",
  relationship: "",
  phone: "",
  email: "",
});

function Field({ label, required, hint, className, children }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StepHeader({ step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors",
              i < step
                ? "bg-primary text-primary-foreground"
                : i === step
                  ? "bg-primary/10 text-primary ring-1 ring-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < step ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-xs hidden md:block",
              i === step
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div className="w-5 h-px bg-border hidden md:block" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function EmployeeOnboardingPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: profile, isLoading } = useMyOrgProfile(workspaceId);
  const { data: jobTitles = [] } = useJobTitles(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  const { data: departments = [] } = useDepartments(workspaceId);
  const { data: teams = [] } = useTeams(workspaceId);
  const complete = useCompleteOnboarding(workspaceId);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});

  // Seed the form from the existing profile once it loads.
  if (profile && form === null) {
    const seededContacts = (profile.emergency_contacts ?? []).map((c) => ({
      name: c.name ?? "",
      relationship: c.relationship ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    }));
    setForm({
      personal_email: profile.personal_email ?? "",
      phone: profile.phone ?? "",
      date_of_birth: profile.date_of_birth ?? "",
      gender: profile.gender ?? "",
      marital_status: profile.marital_status ?? "",
      nationality: profile.nationality ?? "",
      address_line1: profile.address_line1 ?? "",
      address_line2: profile.address_line2 ?? "",
      city: profile.city ?? "",
      state_region: profile.state_region ?? "",
      postal_code: profile.postal_code ?? "",
      country: profile.country ?? "",
      emergency_contacts: seededContacts.length
        ? seededContacts
        : [emptyContact()],
      job_title_id: profile.job_title?.id ?? "",
      employment_type: profile.employment_type ?? "full_time",
      start_date: profile.start_date ?? "",
      location: profile.location ?? "",
      manager_id: profile.manager?.id ?? "",
      department_ids: (profile.departments ?? []).map((d) => d.id),
      team_ids: (profile.teams ?? []).map((t) => t.id),
      bank_name: profile.bank_name ?? "",
      bank_account_name: profile.bank_account_name ?? "",
      bank_account_number: profile.bank_account_number ?? "",
      bank_iban: profile.bank_iban ?? "",
      national_id: profile.national_id ?? "",
    });
  }

  const countryOptions = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const Flag = flagComponent(c.code);
        return {
          value: c.code,
          label: c.name,
          iconNode: Flag ? (
            <Flag className="w-5 h-auto rounded-[2px]" />
          ) : undefined,
        };
      }),
    [],
  );

  // Define structured form steps config to optimize scannability
  const stepFieldsConfig = useMemo(() => {
    if (!profile) return {};
    return {
      0: [
        {
          key: "personal_email",
          label: "Personal email",
          type: "email",
          placeholder: "you@personal.com",
        },
        {
          key: "phone",
          label: "Contact number",
          required: true,
          placeholder: "+1 555 000 1234",
          errorKey: "phone",
        },
        { key: "date_of_birth", label: "Date of birth", type: "date" },
        { key: "gender", label: "Gender", type: "select", options: GENDERS },
        {
          key: "marital_status",
          label: "Marital status",
          type: "select",
          options: MARITAL_STATUSES,
        },
        {
          key: "nationality",
          label: "Nationality",
          type: "select",
          options: countryOptions,
          searchable: true,
        },
      ],
      1: [
        {
          key: "address_line1",
          label: "Address line 1",
          className: "sm:col-span-2",
        },
        {
          key: "address_line2",
          label: "Address line 2",
          className: "sm:col-span-2",
        },
        { key: "city", label: "City" },
        { key: "state_region", label: "State / Region" },
        { key: "postal_code", label: "Postal code" },
        {
          key: "country",
          label: "Country",
          type: "select",
          options: countryOptions,
          searchable: true,
        },
      ],
      3: [
        {
          key: "job_title_id",
          label: "Job title",
          required: true,
          type: "select",
          options: jobTitles.map((t) => ({ value: t.id, label: t.name })),
          placeholder: "Select your title…",
          errorKey: "job_title_id",
        },
        {
          key: "employment_type",
          label: "Employment type",
          type: "select",
          options: EMPLOYMENT_TYPES,
        },
        { key: "start_date", label: "Start date", type: "date" },
        { key: "location", label: "Location", placeholder: "e.g. London, UK" },
      ],
      4: [
        {
          key: "manager_id",
          label: "Who do you report to? (manager)",
          type: "select",
          className: "sm:col-span-2",
          options: members
            .filter((m) => m.id !== profile.member?.id)
            .map((m) => ({
              value: m.id,
              label: m.user?.full_name || m.user?.email,
              avatar: m.user,
            })),
          searchable: true,
          clearable: true,
          placeholder: "Select your manager…",
        },
        {
          key: "department_ids",
          label: "Department(s)",
          type: "select",
          multiple: true,
          options: departments.map((d) => ({ value: d.id, label: d.name })),
          searchable: true,
          placeholder: "Select department(s)…",
        },
        {
          key: "team_ids",
          label: "Team(s)",
          type: "select",
          multiple: true,
          options: teams.map((t) => ({ value: t.id, label: t.name })),
          searchable: true,
          placeholder: "Select team(s)…",
        },
      ],
      5: [
        { key: "bank_name", label: "Bank name" },
        { key: "bank_account_name", label: "Account holder name" },
        { key: "bank_account_number", label: "Account number" },
        { key: "bank_iban", label: "IBAN" },
        { key: "national_id", label: "National ID" },
      ],
    };
  }, [profile, countryOptions, jobTitles, members, departments, teams]);

  if (isLoading || !form) return <Loader className="min-h-screen" size="lg" />;

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const contacts = form.emergency_contacts;

  const setContact = (i, k, v) => {
    setForm((f) => ({
      ...f,
      emergency_contacts: f.emergency_contacts.map((c, idx) =>
        idx === i ? { ...c, [k]: v } : c,
      ),
    }));
    if (i === 0 && (k === "name" || k === "phone")) {
      setErrors((e) => ({ ...e, [`emergency_${k}`]: undefined }));
    }
  };

  const addContact = () =>
    setForm((f) => ({
      ...f,
      emergency_contacts: [...f.emergency_contacts, emptyContact()],
    }));

  const removeContact = (i) =>
    setForm((f) => ({
      ...f,
      emergency_contacts: f.emergency_contacts.filter((_, idx) => idx !== i),
    }));

  const primary = contacts[0] || {};
  const missingKeys = () => {
    const keys = [];
    if (!String(form.phone || "").trim()) keys.push("phone");
    if (!String(form.job_title_id || "").trim()) keys.push("job_title_id");
    if (!primary.name?.trim() || !primary.phone?.trim()) keys.push("emergency");
    return keys;
  };
  const MISSING_LABEL = {
    phone: "Contact number",
    job_title_id: "Job title",
    emergency: "Emergency contact (name & phone)",
  };

  const submit = () => {
    const missing = missingKeys();
    if (missing.length) {
      const errs = {};
      if (missing.includes("phone")) errs.phone = "Contact number is required.";
      if (missing.includes("job_title_id"))
        errs.job_title_id = "Job title is required.";
      if (missing.includes("emergency")) {
        if (!primary.name?.trim()) errs.emergency_name = "Required";
        if (!primary.phone?.trim()) errs.emergency_phone = "Required";
      }
      setErrors(errs);
      if (missing.includes("phone")) setStep(0);
      else if (missing.includes("emergency")) setStep(2);
      else setStep(3);
      toast.error(
        "A few details are still needed",
        "Please fill the required fields to finish.",
      );
      return;
    }
    const payload = { ...form };
    payload.emergency_contacts = contacts.filter((c) => c.name?.trim());
    if (!payload.job_title_id) delete payload.job_title_id;
    if (!payload.date_of_birth) delete payload.date_of_birth;
    if (!payload.start_date) delete payload.start_date;
    if (!payload.manager_id) delete payload.manager_id;
    complete.mutate(payload, {
      onSuccess: () => navigate(`/w/${workspaceId}/hr`, { replace: true }),
      onError: (err) =>
        toast.error(
          "Couldn't save your profile",
          err?.response?.data?.detail || err.message,
        ),
    });
  };

  const user = profile.member?.user;
  const currentFields = stepFieldsConfig[step];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-1 px-8 py-4 border-b">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
          J
        </div>
        <span className="font-semibold text-sm">CN</span>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-12 overflow-auto">
        <div className="w-full max-w-2xl animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">Complete your profile</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Welcome
              {user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}! HR
              needs a few details before you can use People &amp; HR. Optional
              fields you can finish later from your profile.
            </p>
          </div>

          <StepHeader step={step} />

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            {/* Dynamic Grid Step Renderer */}
            {currentFields && (
              <div className="grid sm:grid-cols-2 gap-4">
                {step === 5 && (
                  <p className="sm:col-span-2 text-xs text-muted-foreground mb-2">
                    All optional — you can add these later from your profile.
                  </p>
                )}
                {currentFields.map((f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    className={f.className}
                  >
                    {f.type === "select" ? (
                      <Select
                        value={form[f.key]}
                        onChange={(v) => set(f.key, v)}
                        options={f.options}
                        placeholder={f.placeholder || "Select…"}
                        searchable={f.searchable}
                        clearable={f.clearable}
                        multiple={f.multiple}
                        triggerClassName={
                          f.errorKey && errors[f.errorKey]
                            ? "border-destructive"
                            : ""
                        }
                      />
                    ) : (
                      <Input
                        type={f.type || "text"}
                        value={form[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className={
                          f.errorKey && errors[f.errorKey]
                            ? "border-destructive"
                            : ""
                        }
                      />
                    )}
                    {f.errorKey && errors[f.errorKey] && (
                      <p className="text-xs text-destructive mt-1">
                        {errors[f.errorKey]}
                      </p>
                    )}
                  </Field>
                ))}
                {step === 4 && (
                  <p className="sm:col-span-2 text-xs text-muted-foreground mt-2">
                    This sets your place in the org chart so HR doesn&apos;t
                    have to. All optional — HR can adjust it later.
                  </p>
                )}
              </div>
            )}

            {/* Step 2: Emergency contacts (Highly dynamic layout block) */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Who should we reach in an emergency? Your first contact is
                    required; add more if you&apos;d like a backup.
                  </span>
                </div>

                {contacts.map((c, i) => {
                  const isPrimary = i === 0;
                  return (
                    <div
                      key={i}
                      className="rounded-lg border bg-background p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {isPrimary ? "Primary contact" : `Contact ${i + 1}`}
                        </span>
                        {!isPrimary && (
                          <button
                            type="button"
                            onClick={() => removeContact(i)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Remove contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Contact name" required={isPrimary}>
                          <Input
                            value={c.name}
                            onChange={(e) =>
                              setContact(i, "name", e.target.value)
                            }
                            className={
                              isPrimary && errors.emergency_name
                                ? "border-destructive"
                                : ""
                            }
                          />
                          {isPrimary && errors.emergency_name && (
                            <p className="text-xs text-destructive">
                              {errors.emergency_name}
                            </p>
                          )}
                        </Field>
                        <Field label="Relationship">
                          <Input
                            value={c.relationship}
                            onChange={(e) =>
                              setContact(i, "relationship", e.target.value)
                            }
                            placeholder="e.g. Spouse, Parent"
                          />
                        </Field>
                        <Field label="Contact phone" required={isPrimary}>
                          <Input
                            value={c.phone}
                            onChange={(e) =>
                              setContact(i, "phone", e.target.value)
                            }
                            className={
                              isPrimary && errors.emergency_phone
                                ? "border-destructive"
                                : ""
                            }
                          />
                          {isPrimary && errors.emergency_phone && (
                            <p className="text-xs text-destructive">
                              {errors.emergency_phone}
                            </p>
                          )}
                        </Field>
                        <Field label="Contact email">
                          <Input
                            type="email"
                            value={c.email}
                            onChange={(e) =>
                              setContact(i, "email", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  );
                })}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addContact}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add another contact
                </Button>
              </div>
            )}

            {/* Step 6: Review */}
            {step === 6 && (
              <div className="space-y-2 text-sm">
                <p className="font-medium mb-3">
                  You&apos;re all set — review and finish.
                </p>
                {missingKeys().length > 0 ? (
                  <p className="text-xs text-destructive">
                    Still required:{" "}
                    {missingKeys()
                      .map((k) => MISSING_LABEL[k])
                      .join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    All required details are filled. You can update anything
                    later from your profile.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={complete.isPending}>
                {complete.isPending && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                )}
                Finish & enter People &amp; HR
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
