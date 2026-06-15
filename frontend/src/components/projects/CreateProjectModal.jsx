import { useState } from "react";
import { useCreateBoard } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Modal from "@/components/ui/Modal";
import confetti from "canvas-confetti";
import {
  Loader2,
  CheckCircle2,
  Lock,
  Code2,
  Megaphone,
  Settings2,
  Briefcase,
  Users,
  Palette,
  LayoutGrid,
} from "lucide-react";

const BOARD_TYPES = [
  { value: "general", label: "General", icon: LayoutGrid },
  { value: "software", label: "Software", icon: Code2 },
  { value: "marketing", label: "Marketing", icon: Megaphone },
  { value: "operations", label: "Operations", icon: Settings2 },
  { value: "client", label: "Client Project", icon: Briefcase },
  { value: "hr", label: "HR & People", icon: Users },
  { value: "design", label: "Design", icon: Palette },
];

const INITIAL_FORM = {
  name: "",
  description: "",
  board_type: "general",
  is_private: false,
};

export default function CreateProjectModal({ workspaceId, open, onClose }) {
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

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="New Board"
      showFooter={false}
      maxWidth="600px"
      padding="px-6 py-5"
    >
      {success ? (
        <div className="py-8 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
          <h3 className="text-base font-semibold">{created?.name} is ready!</h3>
          <p className="text-sm text-muted-foreground">
            Your board has been created successfully.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p className="text-sm text-destructive">
              {error.response?.data?.name?.[0] || "Something went wrong."}
            </p>
          )}

          {/* Name + Description */}
          {/* <div className="grid grid-cols-2 gap-4"> */}
          <div className="space-y-1.5">
            <Label htmlFor="board-name">Board name</Label>
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
            <Label htmlFor="board-desc">
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
          {/* </div> */}

          {/* Board type */}
          <div className="space-y-2">
            <Label>Board type</Label>
            <div className="grid grid-cols-4 gap-2">
              {BOARD_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setField("board_type", value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-md border text-xs transition-colors ${
                    form.board_type === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-muted-foreground hover:bg-accent text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Private toggle */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Private board</p>
                <p className="text-xs text-muted-foreground">
                  Only invited members can access this board
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
          <div className="flex justify-end gap-2 pt-1">
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
        </form>
      )}
    </Modal>
  );
}
