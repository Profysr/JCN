import { useState } from "react";
import { X, Send, Link, CheckCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInviteMember } from "@/hooks/useMembers";
import { useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";

const ROLES = [
  { key: "member", label: "Member", desc: "Can create and edit tasks" },
  { key: "viewer", label: "Viewer", desc: "Read-only access" },
  { key: "admin",  label: "Admin",  desc: "Full workspace access" },
];

function EmailChipInput({ emails, onChange }) {
  const [input, setInput] = useState("");

  const add = (raw) => {
    const next = raw
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@") && !emails.includes(e));
    if (next.length) onChange([...emails, ...next]);
  };

  const handleKey = (e) => {
    if (["Enter", ",", " ", "Tab"].includes(e.key)) {
      e.preventDefault();
      add(input);
      setInput("");
    }
    if (e.key === "Backspace" && !input && emails.length) {
      onChange(emails.slice(0, -1));
    }
  };

  return (
    <div
      className="flex flex-wrap gap-1.5 p-2.5 border border-border rounded-md bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 cursor-text min-h-[44px] transition-all"
      onClick={() => document.getElementById("invite-modal-email-input")?.focus()}
    >
      {emails.map((em) => (
        <span
          key={em}
          className="flex items-center gap-1 text-xs bg-muted text-foreground px-2 py-1 rounded font-normal"
        >
          {em}
          <button
            type="button"
            onClick={() => onChange(emails.filter((e) => e !== em))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        id="invite-modal-email-input"
        className="flex-1 min-w-[160px] text-sm bg-transparent outline-none py-0.5 px-1 placeholder:text-muted-foreground/60"
        placeholder={emails.length === 0 ? "Add emails — press Enter or comma to add" : ""}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input) { add(input); setInput(""); } }}
      />
    </div>
  );
}

export default function InviteModal({ workspaceId, workspaceName, open, onOpenChange }) {
  const [emails, setEmails] = useState([]);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [successCount, setSuccessCount] = useState(0);
  const qc = useQueryClient();
  const inviteMember = useInviteMember(workspaceId);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/register`);
  };

  const handleSend = async () => {
    if (!emails.length) return;
    setError("");
    try {
      await Promise.all(
        emails.map((email) => inviteMember.mutateAsync({ email, role }))
      );
      setSuccessCount(emails.length);
      setEmails([]);
      qc.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] });
      setTimeout(() => {
        setSuccessCount(0);
        onOpenChange(false);
      }, 1800);
    } catch (err) {
      setError(
        err.response?.data?.email?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        "One or more invites failed. Check the emails and try again."
      );
    }
  };

  const handleClose = () => {
    setEmails([]);
    setRole("member");
    setError("");
    setSuccessCount(0);
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={`Invite to ${workspaceName}`}
      description="They'll receive an email with a link to join."
      icon={UserPlus}
      iconColor="text-primary"
      showFooter={false}
      padding="px-6 py-5"
      maxWidth="448px"
    >
      {successCount > 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <p className="font-semibold text-foreground">
            {successCount} invite{successCount > 1 ? "s" : ""} sent!
          </p>
          <p className="text-sm text-muted-foreground">
            They'll receive an email shortly.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email addresses
              </label>
              <EmailChipInput emails={emails} onChange={setEmails} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(({ key, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRole(key)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      role === key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    )}
                  >
                    <p className={cn("text-xs font-semibold", role === key ? "text-primary" : "text-foreground")}>
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <div className="-mx-6 -mb-5 mt-5 px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Link className="w-3.5 h-3.5" />
              Copy invite link
            </button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!emails.length || inviteMember.isPending}
                onClick={handleSend}
                className="gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {inviteMember.isPending
                  ? "Sending…"
                  : `Send ${emails.length || ""} invite${emails.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
