import { useState } from "react";
import { useParams } from "react-router-dom";
import { useCreateProject } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2 } from "lucide-react";

export default function CreateProjectModal({ open, onClose }) {
  const { workspaceSlug } = useParams();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { mutate, isPending, error } = useCreateProject(workspaceSlug);

  const handleClose = () => {
    onClose();
    setName("");
    setDescription("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutate({ name, description }, { onSuccess: handleClose });
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border rounded-md shadow-xl w-full max-w-md animate-scale-in">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <Dialog.Title className="text-sm font-semibold">
              New Project
            </Dialog.Title>
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
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
              />
            </div>

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
                disabled={isPending || !name.trim()}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{" "}
                    Creating…
                  </>
                ) : (
                  "Create project"
                )}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
