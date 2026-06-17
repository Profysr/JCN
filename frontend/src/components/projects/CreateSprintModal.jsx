import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Zap } from "lucide-react";

export function CreateSprintModal({ open, onClose, createSprint, onSelectSprint }) {
  const [form, setForm] = useState({
    name: "",
    goal: "",
    start_date: "",
    end_date: "",
  });

  const handleConfirm = () => {
    if (!form.name.trim()) return;
    createSprint.mutate(form, {
      onSuccess: (sprint) => {
        onClose();
        setForm({ name: "", goal: "", start_date: "", end_date: "" });
        onSelectSprint(sprint);
      },
    });
  };

  const handleClose = () => {
    onClose();
    setForm({ name: "", goal: "", start_date: "", end_date: "" });
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="New Sprint"
      confirmLabel="Create Sprint"
      confirmVariant="primary"
      isLoading={createSprint.isPending}
      isConfirmDisabled={!form.name.trim() || createSprint.isPending}
      onConfirm={handleConfirm}
      icon={Zap}
      maxWidth="480px"
    >
      <div className="space-y-4 py-1">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Sprint name <span className="text-destructive">*</span>
          </label>
          <input
            autoFocus
            className="w-full text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Sprint 3"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Goal <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            className="w-full text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 focus:ring-ring"
            placeholder="What will this sprint accomplish?"
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Start date
            </label>
            <input
              type="date"
              className="w-full text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 focus:ring-ring"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              End date
            </label>
            <input
              type="date"
              className="w-full text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 focus:ring-ring"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
