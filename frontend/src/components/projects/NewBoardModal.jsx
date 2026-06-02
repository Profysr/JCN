import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, LayoutGrid, List, Zap, CalendarDays, GanttChartSquare,
  Sparkles, Check,
} from "lucide-react";
import { useCreateBoard, useBoardTemplates } from "@/hooks/useBoards";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BOARD_TYPES = [
  {
    id: "kanban",
    icon: LayoutGrid,
    label: "Kanban",
    desc: "Drag-and-drop columns — the classic PM board",
    preview: (
      <div className="flex gap-1 h-10">
        {["#94a3b8","#6366f1","#f59e0b","#22c55e"].map((c,i) => (
          <div key={i} className="flex-1 rounded" style={{ background: c, opacity: 0.25 }} />
        ))}
      </div>
    ),
  },
  {
    id: "scrum",
    icon: Zap,
    label: "Scrum",
    desc: "Sprint-based workflow with backlog and velocity tracking",
    preview: (
      <div className="space-y-1 h-10 overflow-hidden">
        {[70, 90, 55, 80].map((w, i) => (
          <div key={i} className="h-2 rounded-full bg-primary/25" style={{ width: `${w}%` }} />
        ))}
      </div>
    ),
  },
  {
    id: "list",
    icon: List,
    label: "List",
    desc: "Spreadsheet-style rows — sortable, filterable, powerful",
    preview: (
      <div className="space-y-1 h-10 overflow-hidden">
        {[100, 100, 100].map((_, i) => (
          <div key={i} className="h-2.5 rounded bg-muted-foreground/15 flex items-center px-1.5 gap-1">
            <div className="w-2 h-1.5 rounded-sm bg-muted-foreground/30" />
            <div className="flex-1 h-1 rounded bg-muted-foreground/20" />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "timeline",
    icon: GanttChartSquare,
    label: "Timeline",
    desc: "Gantt chart — visualise task durations and dependencies",
    preview: (
      <div className="space-y-1 h-10 overflow-hidden">
        {[[10,60],[30,40],[20,70]].map(([l,w], i) => (
          <div key={i} className="h-2 relative">
            <div
              className="absolute h-full rounded bg-primary/30"
              style={{ left: `${l}%`, width: `${w}%` }}
            />
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "calendar",
    icon: CalendarDays,
    label: "Calendar",
    desc: "Month/week/day view — see work distributed in time",
    preview: (
      <div className="grid grid-cols-7 gap-0.5 h-10">
        {Array.from({ length: 21 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-sm",
              [3,8,12,16].includes(i) ? "bg-primary/40" : "bg-muted-foreground/10"
            )}
          />
        ))}
      </div>
    ),
  },
];

export default function NewBoardModal({ open, onClose, workspaceSlug, projectId, onCreated }) {
  const [step, setStep]             = useState("type");  // "type" | "template"
  const [selectedType, setSelectedType] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [boardName, setBoardName]   = useState("");
  const [useTemplate, setUseTemplate] = useState(false);

  const createBoard  = useCreateBoard(workspaceSlug, projectId);
  const { data: templates = [] } = useBoardTemplates(workspaceSlug, projectId);

  const handleClose = () => {
    setStep("type"); setSelectedType(null); setSelectedTemplate(null);
    setBoardName(""); setUseTemplate(false);
    onClose();
  };

  const handleCreate = () => {
    const payload = {
      board_type:   selectedType,
      name:         boardName.trim() || (selectedTemplate?.name ?? BOARD_TYPES.find(t => t.id === selectedType)?.label ?? "New Board"),
      template_key: selectedTemplate?.key || undefined,
    };
    createBoard.mutate(payload, {
      onSuccess: (board) => { handleClose(); onCreated?.(board); },
    });
  };

  const canProceed = !!selectedType;
  const canCreate  = canProceed && (step === "template");

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border rounded-xl shadow-xl w-full max-w-2xl animate-scale-in flex flex-col max-h-[85vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
            <Dialog.Title className="text-sm font-semibold">
              {step === "type" ? "Choose a board type" : "Pick a template"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Step 1: Type picker */}
          {step === "type" && (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {BOARD_TYPES.map((type) => {
                  const Icon = type.icon;
                  const active = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={cn(
                        "relative text-left p-4 rounded-xl border transition-all",
                        "hover:border-primary/40 hover:shadow-card",
                        active
                          ? "border-primary bg-primary/5 shadow-card"
                          : "border-border bg-background"
                      )}
                    >
                      {active && (
                        <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <div className="mb-3">{type.preview}</div>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="font-semibold text-sm">{type.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{type.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Template + name */}
          {step === "template" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Board name */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Board name
                </label>
                <input
                  autoFocus
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={BOARD_TYPES.find(t => t.id === selectedType)?.label || "New Board"}
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                />
              </div>

              {/* Template picker */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Start from a template (optional)
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Blank option */}
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all",
                      !selectedTemplate
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <p className="text-sm font-medium">Blank board</p>
                    <p className="text-xs text-muted-foreground">Start with your own setup</p>
                  </button>

                  {templates.map((tmpl) => (
                    <button
                      key={tmpl.key}
                      onClick={() => { setSelectedTemplate(tmpl); if (!boardName) setBoardName(tmpl.name); }}
                      className={cn(
                        "text-left p-3 rounded-lg border transition-all",
                        selectedTemplate?.key === tmpl.key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <p className="text-sm font-medium">{tmpl.name}</p>
                      <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t flex-shrink-0">
            <div className="flex gap-1">
              {["type", "template"].map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    step === s ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step === "template" && (
                <Button variant="outline" size="sm" onClick={() => setStep("type")}>
                  Back
                </Button>
              )}
              {step === "type" ? (
                <Button size="sm" disabled={!canProceed} onClick={() => setStep("template")}>
                  Next →
                </Button>
              ) : (
                <Button size="sm" disabled={createBoard.isPending} onClick={handleCreate}>
                  {createBoard.isPending ? "Creating…" : "Create board"}
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
