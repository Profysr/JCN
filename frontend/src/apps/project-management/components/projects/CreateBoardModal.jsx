import { useState } from "react";
import { useCreateBoard } from "@/apps/project-management/hooks/useProjects";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import Modal from "@/shared/components/ui/Modal";
import confetti from "canvas-confetti";
import { Loader2, CheckCircle2, Lock } from "lucide-react";
import { BOARD_TYPES, getBoardIcon } from "@/shared/lib/boardTypes";

const TYPE_META = {
  general: {
    gradient: "from-blue-500 to-indigo-600",
    active: "bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-400",
  },
  software: {
    gradient: "from-violet-500 to-purple-600",
    active:
      "bg-violet-500/10 border-violet-500 text-violet-700 dark:text-violet-400",
  },
  marketing: {
    gradient: "from-orange-400 to-rose-500",
    active:
      "bg-orange-500/10 border-orange-500 text-orange-700 dark:text-orange-400",
  },
  operations: {
    gradient: "from-emerald-500 to-teal-600",
    active:
      "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400",
  },
  client: {
    gradient: "from-sky-500 to-cyan-600",
    active: "bg-sky-500/10 border-sky-500 text-sky-700 dark:text-sky-400",
  },
  hr: {
    gradient: "from-rose-500 to-pink-600",
    active: "bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-400",
  },
  design: {
    gradient: "from-fuchsia-500 to-pink-600",
    active:
      "bg-fuchsia-500/10 border-fuchsia-500 text-fuchsia-700 dark:text-fuchsia-400",
  },
};

const INITIAL_FORM = {
  name: "",
  description: "",
  board_type: "general",
  is_private: false,
};

export default function CreateBoardModal({ workspaceId, open, onClose }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [success, setSuccess] = useState(false);
  const [created, setCreated] = useState(null);
  const { mutate, isPending, error } = useCreateBoard(workspaceId);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setForm(INITIAL_FORM);
      setSuccess(false);
      setCreated(null);
    }, 200);
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    mutate(form, {
      onSuccess: (board) => {
        setCreated(board);
        setSuccess(true);
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setTimeout(handleClose, 2000);
      },
    });
  };

  const meta = TYPE_META[form.board_type] ?? TYPE_META.general;
  const ActiveIcon = getBoardIcon(form.board_type);

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="New Board"
      showFooter={false}
      maxWidth="560px"
      padding="p-0"
      flexBody
    >
      {success ? (
        <div className="py-14 flex flex-col items-center text-center gap-3 px-6">
          <CheckCircle2 className="w-14 h-14 text-green-500" />
          <h3 className="text-lg font-semibold">{created?.name} is ready!</h3>
          <p className="text-sm text-muted-foreground">
            Your board has been created successfully.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          {/* Gradient preview banner */}
          <div
            className={`relative h-32 bg-gradient-to-br ${meta.gradient} flex flex-col items-center justify-center gap-2 overflow-hidden transition-all duration-300`}
          >
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
            <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-white/30" />
            <div className="absolute bottom-6 right-12 w-1.5 h-1.5 rounded-full bg-white/30" />

            <div className="relative bg-white/20 backdrop-blur-sm rounded-lg p-3 ring-1 ring-white/30">
              <ActiveIcon className="w-7 h-7 text-white drop-shadow" />
            </div>

            <div className="relative text-center px-6">
              {form.name ? (
                <p className="text-white font-semibold text-sm truncate max-w-[320px] drop-shadow">
                  {form.name}
                </p>
              ) : (
                <p className="text-white/50 text-xs">Board preview</p>
              )}
            </div>

            {form.is_private && (
              <span className="absolute top-3 right-3 flex items-center gap-1 bg-black/25 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Private
              </span>
            )}
          </div>

          <div className="px-5 pt-4 pb-5 space-y-4">
            {error && (
              <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
                {error.response?.data?.name?.[0] ||
                  error.response?.data?.detail ||
                  error.response?.data?.non_field_errors?.[0] ||
                  "Something went wrong. Please try again."}
              </p>
            )}

            {/* Board type picker */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Board Type
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {BOARD_TYPES.map(({ value, label, icon: Icon }) => {
                  const m = TYPE_META[value] ?? TYPE_META.general;
                  const isActive = form.board_type === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setField("board_type", value)}
                      className={`flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg border text-[11px] font-medium transition-all duration-150 ${
                        isActive
                          ? m.active
                          : "border-border text-muted-foreground hover:bg-accent hover:border-muted-foreground/50"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-center leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border/50" />

            {/* Name + Description */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="board-name" className="text-xs font-medium">
                  Board name
                </Label>
                <Input
                  id="board-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="e.g. Website Redesign"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-desc" className="text-xs font-medium">
                  Description{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="board-desc"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="What is this board about?"
                />
              </div>
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-muted">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">
                    Private board
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Only invited members can access
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_private}
                onClick={() => setField("is_private", !form.is_private)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                  form.is_private ? "bg-primary" : "bg-input"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                    form.is_private ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !form.name.trim()}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{" "}
                    Creating…
                  </>
                ) : (
                  "Create board"
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
