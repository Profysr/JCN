import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, User, FileText, CalendarDays, MessageSquare,
  Upload, Trash2, Download, Plus, Pencil, Check, X,
  AlertTriangle, Clock, CheckCircle2, XCircle, FileIcon,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import Select from "@/shared/components/ui/Select";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { cn } from "@/shared/lib/utils";
import { EMPLOYMENT_TYPES } from "@/shared/lib/constants";
import { useMembers } from "@/shared/hooks/useMembers";
import { usePermission } from "@/contexts/PermissionsContext";
import { useLeaveRequests } from "@/apps/hr-management/hooks/useLeave";
import {
  useEmployeeDocs,
  useUploadEmployeeDoc,
  useDeleteEmployeeDoc,
} from "@/apps/hr-management/hooks/useEmployeeDocs";
import {
  useEmployeeNotes,
  useCreateEmployeeNote,
  useUpdateEmployeeNote,
  useDeleteEmployeeNote,
} from "@/apps/hr-management/hooks/useEmployeeNotes";
import {
  useOrgProfile,
  useUpdateOrgProfile,
  useJobTitles,
} from "@/apps/org-structure/hooks/useOrg";

// ── Constants ─────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "id", label: "ID" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function StatusChip({ status }) {
  const map = {
    pending:   { icon: Clock,        cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    approved:  { icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    rejected:  { icon: XCircle,      cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
    cancelled: { icon: XCircle,      cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  };
  const { icon: Icon, cls } = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize", cls)}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function ExpiryBadge({ daysUntilExpiry }) {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return null;
  if (daysUntilExpiry < 0)
    return <span className="text-xs font-medium text-rose-500">Expired</span>;
  if (daysUntilExpiry <= 30)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <AlertTriangle className="w-3 h-3" />
        {daysUntilExpiry}d left
      </span>
    );
  return <span className="text-xs text-muted-foreground">{daysUntilExpiry}d left</span>;
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ member, workspaceId, isAdmin }) {
  const { data: profile, isLoading } = useOrgProfile(workspaceId, member.id);
  const { data: jobTitles = [] } = useJobTitles(workspaceId);
  const update = useUpdateOrgProfile(workspaceId, member.id);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  function startEdit() {
    setForm({
      employment_type: profile?.employment_type ?? "full_time",
      job_title: profile?.job_title?.id ?? "",
      employee_id: profile?.employee_id ?? "",
      start_date: profile?.start_date ?? "",
      location: profile?.location ?? "",
      bio: profile?.bio ?? "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
  }

  function saveEdit() {
    const payload = { ...form };
    if (!payload.job_title) delete payload.job_title;
    if (!payload.start_date) delete payload.start_date;
    update.mutate(payload, { onSuccess: () => setEditing(false) });
  }

  if (isLoading) return <Loader className="h-40" />;

  const empType = EMPLOYMENT_TYPES.find((e) => e.value === profile?.employment_type);

  return (
    <div className="space-y-6">
      {isAdmin && !editing && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="w-4 h-4 mr-1.5" />
            Edit profile
          </Button>
        </div>
      )}

      {editing ? (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-muted-foreground">Employment type</span>
              <Select
                className="mt-1"
                value={form.employment_type}
                onChange={(v) => setForm((f) => ({ ...f, employment_type: v }))}
                options={EMPLOYMENT_TYPES}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Job title</span>
              <Select
                className="mt-1"
                placeholder="— None —"
                value={form.job_title}
                onChange={(v) => setForm((f) => ({ ...f, job_title: v }))}
                options={[
                  { value: "", label: "— None —" },
                  ...jobTitles.map((jt) => ({ value: jt.id, label: jt.name })),
                ]}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Employee ID</span>
              <input
                className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Start date</span>
              <input
                type="date"
                className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Location</span>
              <input
                className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Bio</span>
            <textarea
              className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background resize-none"
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={update.isPending}>
              <Check className="w-4 h-4 mr-1" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid md:grid-cols-2 gap-x-8 gap-y-5">
          {[
            {
              label: "Employment type",
              value: empType ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-secondary text-xs font-medium">
                  {empType.label}
                </span>
              ) : "—",
            },
            { label: "Job title", value: profile?.job_title?.name ?? "—" },
            { label: "Employee ID", value: profile?.employee_id || "—" },
            {
              label: "Start date",
              value: profile?.start_date
                ? new Date(profile.start_date).toLocaleDateString()
                : "—",
            },
            { label: "Location", value: profile?.location || "—" },
            { label: "Bio", value: profile?.bio || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</dt>
              <dd className="mt-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ workspaceId, memberId }) {
  const { data: docs = [], isLoading } = useEmployeeDocs(workspaceId, memberId);
  const upload = useUploadEmployeeDoc(workspaceId, memberId);
  const remove = useDeleteEmployeeDoc(workspaceId, memberId);
  const fileRef = useRef(null);

  const [docType, setDocType] = useState("other");
  const [expiryDate, setExpiryDate] = useState("");

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", docType);
    if (expiryDate) fd.append("expiry_date", expiryDate);
    upload.mutate(fd, {
      onSuccess: () => {
        if (fileRef.current) fileRef.current.value = "";
        setExpiryDate("");
      },
    });
  }

  if (isLoading) return <Loader className="h-40" />;

  return (
    <div className="space-y-6">
      {/* Upload row */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <p className="text-sm font-medium">Upload document</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-muted-foreground block">
            Type
            <Select
              size="sm"
              className="mt-1 w-44"
              value={docType}
              onChange={setDocType}
              options={DOC_TYPES}
            />
          </label>
          <label className="text-xs text-muted-foreground block">
            Expiry date (optional)
            <input
              type="date"
              className="mt-1 block border rounded px-2 py-1.5 text-sm bg-background"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {upload.isPending ? "Uploading…" : "Choose file"}
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* List */}
      {docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Uploaded employee documents will appear here."
        />
      ) : (
        <div className="divide-y border rounded-lg">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
              <FileIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.original_name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {doc.doc_type}
                  {doc.expiry_date && ` · expires ${new Date(doc.expiry_date).toLocaleDateString()}`}
                </p>
              </div>
              <ExpiryBadge daysUntilExpiry={doc.days_until_expiry} />
              <a
                href={doc.file}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => remove.mutate(doc.id)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Leave History Tab ─────────────────────────────────────────────────────────

function LeaveHistoryTab({ workspaceId, memberId }) {
  const { data: allRequests = [], isLoading } = useLeaveRequests(workspaceId);

  if (isLoading) return <Loader className="h-40" />;

  const requests = allRequests.filter((r) => r.employee?.id === memberId);

  if (requests.length === 0)
    return (
      <EmptyState
        illustration="notifications"
        title="No leave requests"
        description="This employee hasn't submitted any leave requests."
      />
    );

  return (
    <div className="divide-y border rounded-lg">
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
              {new Date(req.start_date).toLocaleDateString()} →{" "}
              {new Date(req.end_date).toLocaleDateString()}
            </p>
            {req.reason && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{req.reason}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(req.created_at).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────

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
    create.mutate({ content: newContent, is_private: true }, {
      onSuccess: () => setNewContent(""),
    });
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function saveEdit() {
    update.mutate({ noteId: editingId, content: editContent }, {
      onSuccess: () => { setEditingId(null); setEditContent(""); },
    });
  }

  if (isLoading) return <Loader className="h-40" />;

  return (
    <div className="space-y-4">
      {/* Compose */}
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
            <Plus className="w-4 h-4 mr-1" />
            Add note
          </Button>
        </div>
      </div>

      {/* List */}
      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description="Private HR notes about this employee will appear here."
        />
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
                      <Check className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {note.author?.full_name} ·{" "}
                      {new Date(note.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => startEdit(note)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => remove.mutate(note.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "profile",   label: "Profile",       icon: User },
  { key: "documents", label: "Documents",      icon: FileText },
  { key: "leave",     label: "Leave history",  icon: CalendarDays },
  { key: "notes",     label: "Notes",          icon: MessageSquare },
];

export default function MemberDetailPage() {
  const { workspaceId, memberId } = useParams();
  const navigate = useNavigate();
  const { isOwner, can } = usePermission();
  const { data: members = [], isLoading } = useMembers(workspaceId);
  const [activeTab, setActiveTab] = useState("profile");

  if (isLoading) return <Loader className="h-96" />;

  const member = members.find((m) => m.id === memberId);
  if (!member)
    return (
      <div className="p-8 text-center text-muted-foreground">Member not found.</div>
    );

  const isAdmin = isOwner || can("member.view_profile");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Avatar user={member.user} name={member.user?.full_name || member.user?.email} src={member.user?.avatar} size="xl" />
        <div>
          <h1 className="text-xl font-bold">{member.user?.full_name}</h1>
          <p className="text-sm text-muted-foreground">{member.user?.email}</p>
          <span className="mt-1 inline-block text-xs font-medium capitalize px-2 py-0.5 rounded bg-secondary">
            {member.role}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1 mb-6 overflow-x-auto">
        {TABS.map((tab) =>
          (tab.key === "notes" || tab.key === "documents") && !isAdmin ? null : (
            <Tab
              key={tab.key}
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              icon={tab.icon}
              label={tab.label}
            />
          ),
        )}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "profile" && (
          <ProfileTab member={member} workspaceId={workspaceId} isAdmin={isAdmin} />
        )}
        {activeTab === "documents" && isAdmin && (
          <DocumentsTab workspaceId={workspaceId} memberId={memberId} />
        )}
        {activeTab === "leave" && (
          <LeaveHistoryTab workspaceId={workspaceId} memberId={memberId} />
        )}
        {activeTab === "notes" && isAdmin && (
          <NotesTab workspaceId={workspaceId} memberId={memberId} />
        )}
      </div>
    </div>
  );
}
