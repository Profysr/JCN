import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CalendarDays, CheckCircle2, Clock, XCircle, Plus,
  ChevronLeft, ChevronRight, Users, AlertCircle,
  Pencil, Trash2, ShieldCheck, Wallet, History, UserCheck,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import { Avatar } from "@/shared/components/ui/avatar";
import Select from "@/shared/components/ui/Select";
import { useToast } from "@/shared/components/ui/toast";
import Modal from "@/shared/components/ui/Modal";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { cn } from "@/shared/lib/utils";
import { usePermission } from "@/contexts/PermissionsContext";
import {
  useLeaveBalances,
  useLeavePolicies,
  useLeaveRequests,
  useCreateLeaveRequest,
  useReviewLeaveRequest,
  useCreateLeavePolicy,
  useUpdateLeavePolicy,
  useDeleteLeavePolicy,
} from "@/apps/hr-management/hooks/useLeave";

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEAVE_TYPE_COLORS = {
  annual:       { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300", bar: "bg-indigo-500" },
  sick:         { bg: "bg-rose-100 dark:bg-rose-900/30",     text: "text-rose-700 dark:text-rose-300",     bar: "bg-rose-500"    },
  unpaid:       { bg: "bg-zinc-100 dark:bg-zinc-800",        text: "text-zinc-600 dark:text-zinc-400",     bar: "bg-zinc-400"    },
  paternity:    { bg: "bg-sky-100 dark:bg-sky-900/30",       text: "text-sky-700 dark:text-sky-300",       bar: "bg-sky-500"     },
  maternity:    { bg: "bg-pink-100 dark:bg-pink-900/30",     text: "text-pink-700 dark:text-pink-300",     bar: "bg-pink-500"    },
  compassionate:{ bg: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-300",   bar: "bg-amber-500"   },
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function leaveTypeColor(type) {
  return LEAVE_TYPE_COLORS[type] ?? { bg: "bg-muted", text: "text-muted-foreground", bar: "bg-muted-foreground" };
}

function StatusChip({ status }) {
  const map = {
    pending:   { icon: Clock,         cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    approved:  { icon: CheckCircle2,  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    rejected:  { icon: XCircle,       cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
    cancelled: { icon: XCircle,       cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  };
  const { icon: Icon, cls } = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize", cls)}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dateBetween(dateStr, startStr, endStr) {
  const d = new Date(dateStr);
  return d >= new Date(startStr) && d <= new Date(endStr);
}

function daysInRange(start, end) {
  let count = 0;
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return count;
}

// ── Balance Card ──────────────────────────────────────────────────────────────
function BalanceCard({ balance }) {
  const colors = leaveTypeColor(balance.policy.leave_type);
  const pct = balance.total_days > 0
    ? Math.min(100, (parseFloat(balance.used_days) / parseFloat(balance.total_days)) * 100)
    : 0;
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", colors.bg, colors.text)}>
          {balance.policy.name}
        </span>
        <span className="text-xs text-muted-foreground">{new Date().getFullYear()}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-foreground">{balance.remaining_days}</p>
          <p className="text-xs text-muted-foreground">days remaining</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{parseFloat(balance.used_days)} used</p>
          {parseFloat(balance.pending_days) > 0 && (
            <p className="text-amber-600">{parseFloat(balance.pending_days)} pending</p>
          )}
          <p>of {parseFloat(balance.total_days)} total</p>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", colors.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Request Row ───────────────────────────────────────────────────────────────
function RequestRow({ req, isAdmin, workspaceId, onApprove, onReject }) {
  const colors = leaveTypeColor(req.policy.leave_type);
  const days = daysInRange(req.start_date, req.end_date);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      {isAdmin && (
        <Link to={`/w/${workspaceId}/members/${req.employee.id}`} className="shrink-0">
          <Avatar user={req.employee.user} size="sm" />
        </Link>
      )}
      <div className="flex-1 min-w-0">
        {isAdmin && (
          <Link
            to={`/w/${workspaceId}/members/${req.employee.id}`}
            className="text-sm font-medium text-foreground truncate hover:text-primary hover:underline block"
          >
            {req.employee.user.full_name}
          </Link>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", colors.bg, colors.text)}>
            {req.policy.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(req.start_date)} → {formatDate(req.end_date)} · {days}d
          </span>
        </div>
        {req.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.reason}</p>}
      </div>
      <StatusChip status={req.status} />
      {isAdmin && req.status === "pending" && (
        <div className="flex gap-1.5 ml-2 shrink-0">
          <Button size="xs" variant="outline"
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            onClick={() => onApprove(req.id)}>
            Approve
          </Button>
          <Button size="xs" variant="outline"
            className="text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={() => onReject(req.id)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Request Form Modal ────────────────────────────────────────────────────────
function RequestFormModal({ workspaceId, open, onClose }) {
  const { data: policies = [] } = useLeavePolicies(workspaceId);
  const { data: balances = [] } = useLeaveBalances(workspaceId);
  const createRequest = useCreateLeaveRequest(workspaceId);

  const [policyId, setPolicyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const selectedBalance = balances.find((b) => b.policy.id === policyId);
  const days = startDate && endDate ? daysInRange(startDate, endDate) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createRequest.mutateAsync({ policy_id: policyId, start_date: startDate, end_date: endDate, reason });
      onClose();
      setPolicyId(""); setStartDate(""); setEndDate(""); setReason("");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request Leave">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Leave type</label>
          <Select
            placeholder="Select policy…"
            value={policyId}
            onChange={setPolicyId}
            options={policies.map((p) => ({ value: p.id, label: p.name }))}
          />
          {selectedBalance && (
            <p className="text-xs text-muted-foreground">
              Available: <span className="font-medium text-foreground">{selectedBalance.remaining_days} days</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Start date</label>
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">End date</label>
            <input type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        {days > 0 && (
          <p className="text-xs text-muted-foreground -mt-1">
            That&apos;s <span className="font-medium text-foreground">{days} working day{days !== 1 ? "s" : ""}</span>
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Add a note for your manager…"
            className="rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={createRequest.isPending}>
            {createRequest.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Team Calendar Tab ─────────────────────────────────────────────────────────
function TeamCalendar({ workspaceId }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data: requests = [], isLoading } = useLeaveRequests(workspaceId, "approved");

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const prev = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const next = () => { if (month === 11) { setMonth(0);  setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const monthRequests = requests.filter((r) => {
    const s = new Date(r.start_date);
    const e = new Date(r.end_date);
    const mStart = new Date(year, month, 1);
    const mEnd   = new Date(year, month, daysInMonth);
    return s <= mEnd && e >= mStart;
  });

  if (isLoading) return <Loader className="h-32" />;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {MONTH_NAMES[month]} {year}
        </h3>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={prev} aria-label="Previous month">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={next} aria-label="Next month">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 text-center">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e-${i}`} className="bg-background h-10" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
          const todayStr = today.toISOString().slice(0,10);
          const isToday = dateStr === todayStr;
          const dayRequests = monthRequests.filter((r) => dateBetween(dateStr, r.start_date, r.end_date));
          const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;

          return (
            <div key={dayNum} className={cn("bg-background h-10 px-1 pt-0.5 flex flex-col", isWeekend && "bg-muted/30")}>
              <span className={cn(
                "text-xs w-5 h-5 flex items-center justify-center rounded-full",
                isToday ? "bg-primary text-primary-foreground font-semibold" : "text-foreground",
              )}>
                {dayNum}
              </span>
              <div className="flex flex-col gap-px mt-0.5">
                {dayRequests.slice(0, 2).map((r) => {
                  const colors = leaveTypeColor(r.policy?.leave_type);
                  return (
                    <div key={r.id} className={cn("h-1 rounded-full", colors.bar)} title={r.employee.user.full_name} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend — people off this month */}
      {monthRequests.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">People off this month</p>
          {monthRequests.map((r) => {
            const colors = leaveTypeColor(r.policy?.leave_type);
            return (
              <div key={r.id} className="flex items-center gap-2">
                <Avatar user={r.employee.user} size="xs" />
                <span className="text-sm text-foreground flex-1 truncate">{r.employee.user.full_name}</span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", colors.bg, colors.text)}>
                  {r.policy.name}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(r.start_date)} → {formatDate(r.end_date)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {monthRequests.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No approved leaves this month</p>
      )}
    </div>
  );
}

// ── Manager Queue Tab ─────────────────────────────────────────────────────────
function ManagerQueue({ workspaceId }) {
  const { data: pending = [], isLoading } = useLeaveRequests(workspaceId, "pending");
  const reviewRequest = useReviewLeaveRequest(workspaceId);

  const handleReview = async (requestId, status) => {
    await reviewRequest.mutateAsync({ requestId, status, comment: "" });
  };

  if (isLoading) return <Loader className="h-32" />;

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        <p className="text-sm">No pending requests</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{pending.length} pending request{pending.length !== 1 ? "s" : ""}</p>
      {pending.map((req) => (
        <RequestRow
          key={req.id}
          req={req}
          isAdmin
          workspaceId={workspaceId}
          onApprove={(id) => handleReview(id, "approved")}
          onReject={(id) => handleReview(id, "rejected")}
        />
      ))}
    </div>
  );
}

// ── Policy Form Modal ─────────────────────────────────────────────────────────
const LEAVE_TYPES = [
  { value: "annual",        label: "Annual" },
  { value: "sick",          label: "Sick" },
  { value: "unpaid",        label: "Unpaid" },
  { value: "paternity",     label: "Paternity" },
  { value: "maternity",     label: "Maternity" },
  { value: "compassionate", label: "Compassionate" },
];

const EMPTY_POLICY = { name: "", leave_type: "annual", days_per_year: 20, carry_over_days: 0, accrual_type: "upfront" };

function PolicyFormModal({ workspaceId, open, onClose, existing }) {
  const createPolicy = useCreateLeavePolicy(workspaceId);
  const updatePolicy = useUpdateLeavePolicy(workspaceId);
  const isEdit = !!existing;

  const [form, setForm] = useState(existing ?? EMPTY_POLICY);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Reset form when modal opens
  const _handleOpen = () => setForm(existing ?? EMPTY_POLICY);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEdit) {
      await updatePolicy.mutateAsync({ policyId: existing.id, ...form });
    } else {
      await createPolicy.mutateAsync(form);
    }
    onClose();
  };

  const isPending = createPolicy.isPending || updatePolicy.isPending;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit policy" : "New leave policy"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Policy name</label>
          <input
            required
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Annual Leave"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Leave type</label>
          <Select
            value={form.leave_type}
            onChange={(v) => set("leave_type", v)}
            options={LEAVE_TYPES}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Days per year</label>
            <input
              type="number" min="0" max="365" required
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.days_per_year}
              onChange={(e) => set("days_per_year", parseInt(e.target.value, 10))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Carry-over days</label>
            <input
              type="number" min="0" max="365"
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.carry_over_days}
              onChange={(e) => set("carry_over_days", parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Accrual type</label>
          <div className="flex gap-2">
            {["upfront", "monthly"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("accrual_type", v)}
                className={cn(
                  "flex-1 h-9 rounded-md border text-sm font-medium transition-colors",
                  form.accrual_type === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {form.accrual_type === "upfront"
              ? "All days granted at the start of the year."
              : "Days accrue evenly each month throughout the year."}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Create policy"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Policies Tab ──────────────────────────────────────────────────────────────
function PoliciesTab({ workspaceId }) {
  const { data: policies = [], isLoading } = useLeavePolicies(workspaceId);
  const deletePolicy = useDeleteLeavePolicy(workspaceId);
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this policy? Employees with this policy assigned will lose their balances.")) return;
    try {
      await deletePolicy.mutateAsync(id);
      toast.success("Leave policy deleted");
    } catch (err) {
      toast.error(
        "Couldn't delete policy",
        err.message,
      );
    }
  };

  if (isLoading) return <Loader className="h-32" />;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {policies.length} polic{policies.length === 1 ? "y" : "ies"} configured
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          New policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-2 text-muted-foreground rounded-lg border border-dashed">
          <ShieldCheck className="w-8 h-8" />
          <p className="text-sm">No policies yet</p>
          <Button variant="outline" size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            Create first policy
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Days/yr</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Carry-over</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Accrual</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {policies.map((policy, i) => {
                const colors = leaveTypeColor(policy.leave_type);
                return (
                  <tr key={policy.id} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                    <td className="px-4 py-3 font-medium text-foreground">{policy.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", colors.bg, colors.text)}>
                        {policy.leave_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{policy.days_per_year}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{policy.carry_over_days}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{policy.accrual_type}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditing(policy); setFormOpen(true); }}
                          aria-label="Edit leave policy"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(policy.id)}
                          disabled={deletePolicy.isPending}
                          aria-label="Delete leave policy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PolicyFormModal
        workspaceId={workspaceId}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        existing={editing}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: "my-leave",   label: "My Leave" },
  { key: "team",       label: "Team Calendar" },
  { key: "queue",      label: "Manager Queue", adminOnly: true },
  { key: "policies",   label: "Policies",      adminOnly: true },
];

export default function LeavePage() {
  const { workspaceId } = useParams();
  const { isOwner, can, hasAppAccess } = usePermission();
  const [tab, setTab] = useState("my-leave");
  const [requestOpen, setRequestOpen] = useState(false);

  const isAdmin = isOwner || can("hr.manage_leave");
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  const { data: balances = [], isLoading: balancesLoading } = useLeaveBalances(workspaceId);
  const { data: myRequests = [], isLoading: requestsLoading } = useLeaveRequests(workspaceId);

  if (!isOwner && !hasAppAccess("hr")) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Users className="w-10 h-10" />
        <p className="text-sm">You don&apos;t have access to HR Management.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Leave</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage time off requests and balances</p>
        </div>
        <Button size="sm" onClick={() => setRequestOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Request leave
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b shrink-0">
        {visibleTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-t-md border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ── My Leave ── */}
        {tab === "my-leave" && (
          <div className="flex flex-col gap-5 max-w-3xl">
            <SectionCard title="Your balances" icon={Wallet}>
              {balancesLoading ? (
                <Loader className="h-24" />
              ) : balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave policies assigned yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {balances.map((b) => <BalanceCard key={b.id} balance={b} />)}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Request history" icon={History}>
              {requestsLoading ? (
                <Loader className="h-24" />
              ) : myRequests.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                  <CalendarDays className="w-8 h-8" />
                  <p className="text-sm">No requests yet</p>
                  <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
                    Request your first leave
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {myRequests.map((req) => (
                    <RequestRow key={req.id} req={req} isAdmin={false} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ── Team Calendar ── */}
        {tab === "team" && (
          <div className="max-w-2xl">
            <SectionCard title="Team Calendar" icon={CalendarDays}>
              <TeamCalendar workspaceId={workspaceId} />
            </SectionCard>
          </div>
        )}

        {/* ── Manager Queue ── */}
        {tab === "queue" && (
          <div className="max-w-3xl">
            <SectionCard title="Manager Queue" icon={UserCheck}>
              <ManagerQueue workspaceId={workspaceId} />
            </SectionCard>
          </div>
        )}

        {/* ── Policies ── */}
        {tab === "policies" && (
          <SectionCard title="Leave Policies" icon={ShieldCheck}>
            <PoliciesTab workspaceId={workspaceId} />
          </SectionCard>
        )}
      </div>

      <RequestFormModal workspaceId={workspaceId} open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}
