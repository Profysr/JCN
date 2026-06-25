import { useState } from "react";
import Modal from "./Modal";
import { cn } from "@/shared/lib/utils";
import { TriangleAlert, Trash2 } from "lucide-react";
import { Button } from "./button";

export function ConfirmModal({
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      variant={danger ? "delete" : undefined}
      isOpen={true}
      onClose={onCancel}
      title={title}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
    >
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </Modal>
  );
}

/* ── Shared internals ────────────────────────────────────────────────────────── */

function CheckList({ checks, ticked, onToggle }) {
  return (
    <div className="space-y-2.5 mb-5">
      {checks.map((label, i) => (
        <label
          key={i}
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none",
            ticked[i]
              ? "border-destructive/30 bg-destructive/5"
              : "border-border hover:bg-accent/50",
          )}
        >
          <div
            className={cn(
              "w-4 h-4 rounded flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-colors",
              ticked[i] ? "bg-destructive border-destructive" : "border-muted-foreground/40",
            )}
          >
            {ticked[i] && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1.5 5l2.5 2.5 4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <input type="checkbox" className="sr-only" checked={ticked[i]} onChange={() => onToggle(i)} />
          <span className="text-sm text-foreground/80 leading-snug">{label}</span>
        </label>
      ))}
    </div>
  );
}

function NameConfirmInput({ targetName, value, onChange }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Type the name to confirm
      </p>
      <p className="text-xs text-muted-foreground mb-2">
        Enter{" "}
        <span className="font-mono font-medium text-foreground bg-muted px-1 py-0.5 rounded">
          {targetName}
        </span>{" "}
        to continue
      </p>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={targetName}
        className={cn(
          "w-full px-3 py-2 text-sm border rounded-md bg-background outline-none transition-colors",
          value.trim() === targetName?.trim() && value
            ? "border-destructive/50 ring-1 ring-destructive/30"
            : "border-border focus:ring-1 focus:ring-ring",
        )}
      />
    </div>
  );
}

/* ── DeleteBoardModal ────────────────────────────────────────────────────────── */

const BOARD_DELETE_CHECKS = [
  "All tasks, comments, and attachments will be permanently deleted.",
  "All board members will immediately lose access.",
  "This action is irreversible and cannot be undone.",
];

export function DeleteBoardModal({ board, isPending, onConfirm, onClose }) {
  const [ticked, setTicked] = useState([false, false, false]);
  const [nameInput, setNameInput] = useState("");

  const allTicked = ticked.every(Boolean);
  const nameMatches = nameInput.trim() === board?.name?.trim();
  const canDelete = allTicked && nameMatches;

  const toggle = (i) => setTicked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <Modal
      isOpen={!!board}
      onClose={onClose}
      title="Delete board"
      icon={Trash2}
      showFooter={false}
      // maxWidth="480px"
    >
      <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/8 border border-destructive/20 mb-5">
        <TriangleAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <p className="text-sm text-destructive">
          You are about to permanently delete{" "}
          <strong className="font-semibold">"{board?.name}"</strong>. This cannot be reversed.
        </p>
      </div>

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Confirm you understand
      </p>
      <CheckList checks={BOARD_DELETE_CHECKS} ticked={ticked} onToggle={toggle} />

      <NameConfirmInput
        targetName={board?.name}
        value={nameInput}
        onChange={setNameInput}
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={!canDelete || isPending}
          onClick={onConfirm}
        >
          {isPending ? "Deleting…" : "Delete board"}
        </Button>
      </div>
    </Modal>
  );
}

/* ── DeleteWorkspaceModal ────────────────────────────────────────────────────── */

const WORKSPACE_DELETE_CHECKS = [
  "All boards, tasks, and sprints across every project will be permanently deleted.",
  "All members will lose access immediately — this cannot be reversed.",
  "Integrations, API keys, and webhooks will be revoked and removed.",
  "This action is irreversible. There is no way to recover this workspace.",
];

export function DeleteWorkspaceModal({ workspace, isPending, onConfirm, onClose }) {
  const [ticked, setTicked] = useState([false, false, false, false]);
  const [nameInput, setNameInput] = useState("");

  const allTicked = ticked.every(Boolean);
  const nameMatches = nameInput.trim() === workspace?.name?.trim();
  const canDelete = allTicked && nameMatches;

  const toggle = (i) => setTicked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <Modal
      isOpen={!!workspace}
      onClose={onClose}
      title="Delete workspace"
      icon={Trash2}
      showFooter={false}
      // maxWidth="500px"
    >
      <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/8 border border-destructive/20 mb-5">
        <TriangleAlert className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <p className="text-sm text-destructive">
          You are about to permanently delete{" "}
          <strong className="font-semibold">"{workspace?.name}"</strong> and everything inside it.
          This cannot be reversed.
        </p>
      </div>

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Confirm you understand
      </p>
      <CheckList checks={WORKSPACE_DELETE_CHECKS} ticked={ticked} onToggle={toggle} />

      <NameConfirmInput
        targetName={workspace?.name}
        value={nameInput}
        onChange={setNameInput}
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={!canDelete || isPending}
          onClick={onConfirm}
        >
          {isPending ? "Deleting…" : "Delete workspace"}
        </Button>
      </div>
    </Modal>
  );
}
