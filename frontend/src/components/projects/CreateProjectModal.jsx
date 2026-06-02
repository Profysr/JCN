import { useState } from "react";
import { useParams } from "react-router-dom";
import { useCreateProject } from "@/hooks/useProjects";
import { useWorkspaceTemplates, useApplyWorkspaceTemplate } from "@/hooks/useOnboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkles, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_TEMPLATES = [
  { key: "software_dev",       name: "Software Dev",      emoji: "💻", desc: "Kanban + bug tracker" },
  { key: "marketing",          name: "Marketing",          emoji: "📢", desc: "Campaign pipeline" },
  { key: "product_launch",     name: "Product Launch",     emoji: "🚀", desc: "Cross-functional launch" },
  { key: "bug_tracker",        name: "Bug Tracker",        emoji: "🐛", desc: "Triage → fix → close" },
  { key: "customer_requests",  name: "Customer Requests",  emoji: "💬", desc: "Feedback & requests" },
];

export default function CreateProjectModal({ open, onClose }) {
  const { workspaceSlug } = useParams();
  const [name, setName]           = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const { mutate, isPending, error } = useCreateProject(workspaceSlug);
  const applyTemplate = useApplyWorkspaceTemplate(workspaceSlug);

  const handleClose = () => {
    onClose();
    setName(""); setDescription(""); setSelectedTemplate(null); setShowTemplates(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutate(
      { name, description },
      { onSuccess: handleClose }
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border rounded-xl shadow-xl w-full max-w-md animate-scale-in">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <Dialog.Title className="text-sm font-semibold">New Project</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <p className="text-sm text-destructive">
                {error.response?.data?.name?.[0] || "Something went wrong."}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website Redesign"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-desc">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
              />
            </div>

            {/* Template gallery toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {showTemplates ? "Hide templates" : "Start from a template"}
              </button>

              {showTemplates && (
                <div className="mt-3 grid grid-cols-2 gap-2 animate-slide-up">
                  {/* Blank option */}
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    className={cn(
                      "text-left p-3 rounded-lg border text-sm transition-all",
                      selectedTemplate === null
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <span className="text-lg block mb-1">✨</span>
                    <p className="font-medium text-xs">Blank</p>
                    <p className="text-[10px] text-muted-foreground">No pre-configuration</p>
                  </button>

                  {PROJECT_TEMPLATES.map((tmpl) => (
                    <button
                      type="button"
                      key={tmpl.key}
                      onClick={() => {
                        setSelectedTemplate(tmpl.key);
                        if (!name) setName(tmpl.name);
                      }}
                      className={cn(
                        "text-left p-3 rounded-lg border text-sm transition-all relative",
                        selectedTemplate === tmpl.key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      {selectedTemplate === tmpl.key && (
                        <span className="absolute top-2 right-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      <span className="text-lg block mb-1">{tmpl.emoji}</span>
                      <p className="font-medium text-xs">{tmpl.name}</p>
                      <p className="text-[10px] text-muted-foreground">{tmpl.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
                {isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Creating…</>
                  : "Create project"
                }
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
