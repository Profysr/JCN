import { useState } from "react";
import {
  X,
  Briefcase,
  Calendar,
  MapPin,
  Building2,
  Hash,
  User,
  Users,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { Loader } from "@/shared/components/ui/Loader";
import Select from "@/shared/components/ui/Select";
import { cn } from "@/shared/lib/utils";
import { EMPLOYMENT_TYPES } from "@/shared/lib/constants";
import {
  useOrgProfile,
  useUpdateOrgProfile,
  useJobTitles,
} from "@/apps/org-structure/hooks/useOrg";

function ProfileField({ label, icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
          {label}
        </p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function ColoredTagList({ items }) {
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {items.map((item) => (
        <span
          key={item.id}
          className="text-xs px-2 py-0.5 rounded-full border"
          style={{
            color: item.color,
            borderColor: item.color + "44",
            background: item.color + "18",
          }}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}

function EditableTextField({
  isAdmin,
  isEditing,
  value,
  onEditStart,
  onSave,
  emptyLabel = "Click to set",
  displayValue,
  inputType = "text",
  multiline = false,
  buttonClassName,
}) {
  const inputClass = "text-sm border rounded px-2 py-1 bg-background w-full";

  if (isAdmin && isEditing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          className={cn(inputClass, "resize-none")}
          rows={3}
          defaultValue={value || ""}
          onBlur={(e) => onSave(e.target.value)}
        />
      );
    }
    return (
      <input
        autoFocus
        type={inputType}
        className={inputClass}
        defaultValue={value || ""}
        onBlur={(e) => onSave(e.target.value)}
        onKeyDown={
          inputType !== "date"
            ? (e) => e.key === "Enter" && e.target.blur()
            : undefined
        }
      />
    );
  }

  return (
    <button
      onClick={() => isAdmin && onEditStart()}
      className={cn(
        "text-sm text-left w-full",
        isAdmin && "hover:text-primary cursor-pointer",
        !value && "text-muted-foreground italic",
        buttonClassName,
      )}
    >
      {displayValue !== undefined
        ? displayValue
        : value || (isAdmin ? emptyLabel : "—")}
    </button>
  );
}

export function MemberProfilePanel({ member, workspaceId, isAdmin, onClose }) {
  const { data: profile, isLoading } = useOrgProfile(workspaceId, member.id);
  const { data: jobTitles = [] } = useJobTitles(workspaceId);
  const updateProfile = useUpdateOrgProfile(workspaceId, member.id);

  const [editing, setEditing] = useState({});

  const save = (field, value) => {
    setEditing((p) => ({ ...p, [field]: false }));
    updateProfile.mutate({ [field]: value });
  };

  const startEditing = (field) => setEditing((p) => ({ ...p, [field]: true }));

  const empType = EMPLOYMENT_TYPES.find(
    (t) => t.value === profile?.employment_type,
  );

  return (
    <div className="w-80 border-l bg-card flex flex-col h-full animate-panel-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">Member Profile</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Identity block */}
        <div className="p-5 border-b flex flex-col items-center text-center gap-3">
          <Avatar
            user={member.user}
            name={member.user?.full_name || member.user?.email}
            src={member.user?.avatar}
            size="lg"
          />
          <div>
            <p className="font-semibold">{member.user?.full_name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {member.user?.email}
            </p>
          </div>
          {empType && (
            <span
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full",
                empType.color,
              )}
            >
              {empType.label}
            </span>
          )}
        </div>

        {isLoading && <Loader className="p-6" />}

        {!isLoading && profile && (
          <div className="p-5 space-y-5">
            {/* Job Title */}
            <ProfileField label="Job Title" icon={Briefcase}>
              {isAdmin && editing.job_title_id ? (
                <Select
                  size="sm"
                  value={profile.job_title?.id ?? ""}
                  onChange={(v) => save("job_title_id", v || null)}
                  options={[
                    { value: "", label: "— None —" },
                    ...jobTitles.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              ) : (
                <button
                  onClick={() => isAdmin && startEditing("job_title_id")}
                  className={cn(
                    "text-sm text-left w-full",
                    isAdmin && "hover:text-primary cursor-pointer",
                    !profile.job_title && "text-muted-foreground italic",
                  )}
                >
                  {profile.job_title?.name || (isAdmin ? "Click to set" : "—")}
                </button>
              )}
            </ProfileField>

            {/* Employment type */}
            {isAdmin && (
              <ProfileField label="Employment Type" icon={User}>
                <Select
                  size="sm"
                  value={profile.employment_type || "full_time"}
                  onChange={(v) => updateProfile.mutate({ employment_type: v })}
                  options={EMPLOYMENT_TYPES}
                />
              </ProfileField>
            )}

            {/* Departments */}
            {profile.departments?.length > 0 && (
              <ProfileField label="Department" icon={Building2}>
                <ColoredTagList items={profile.departments} />
              </ProfileField>
            )}

            {/* Teams */}
            {profile.teams?.length > 0 && (
              <ProfileField label="Teams" icon={Users}>
                <ColoredTagList items={profile.teams} />
              </ProfileField>
            )}

            {/* Manager */}
            {profile.manager && (
              <ProfileField label="Reports To" icon={User}>
                <p className="text-sm">{profile.manager.name}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.manager.email}
                </p>
              </ProfileField>
            )}

            {/* Direct reports */}
            {profile.direct_reports_count > 0 && (
              <ProfileField label="Direct Reports" icon={Users}>
                <p className="text-sm">
                  {profile.direct_reports_count}{" "}
                  {profile.direct_reports_count === 1 ? "person" : "people"}
                </p>
              </ProfileField>
            )}

            {/* Employee ID */}
            <ProfileField label="Employee ID" icon={Hash}>
              <EditableTextField
                isAdmin={isAdmin}
                isEditing={editing.employee_id}
                value={profile.employee_id}
                onEditStart={() => startEditing("employee_id")}
                onSave={(v) => save("employee_id", v)}
              />
            </ProfileField>

            {/* Start Date */}
            <ProfileField label="Start Date" icon={Calendar}>
              <EditableTextField
                isAdmin={isAdmin}
                isEditing={editing.start_date}
                value={profile.start_date}
                inputType="date"
                displayValue={
                  profile.start_date
                    ? new Date(profile.start_date).toLocaleDateString(
                        undefined,
                        { year: "numeric", month: "long", day: "numeric" },
                      )
                    : undefined
                }
                onEditStart={() => startEditing("start_date")}
                onSave={(v) => save("start_date", v || null)}
              />
            </ProfileField>

            {/* Location */}
            <ProfileField label="Location" icon={MapPin}>
              <EditableTextField
                isAdmin={isAdmin}
                isEditing={editing.location}
                value={profile.location}
                onEditStart={() => startEditing("location")}
                onSave={(v) => save("location", v)}
              />
            </ProfileField>

            {/* Bio */}
            <ProfileField label="Bio" icon={null}>
              <EditableTextField
                isAdmin={isAdmin}
                isEditing={editing.bio}
                value={profile.bio}
                multiline
                emptyLabel="Click to add bio"
                buttonClassName="leading-relaxed"
                onEditStart={() => startEditing("bio")}
                onSave={(v) => save("bio", v)}
              />
            </ProfileField>
          </div>
        )}
      </div>
    </div>
  );
}
