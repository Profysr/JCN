import { useNavigate, useParams } from "react-router-dom";
import { ShieldOff, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import api from "@/lib/api";

export default function AccessDeniedPage({ projectName }) {
  const { workspaceSlug, projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRequestAccess = async () => {
    try {
      await api.post(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/request-access/`
      );
      toast.success("Request sent", "Project admins have been notified.");
    } catch {
      toast.error("Failed to send request", "Please contact a project admin directly.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
        <ShieldOff className="w-8 h-8 text-destructive" />
      </div>
      <h1 className="text-xl font-bold text-foreground mb-2">Access denied</h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
        {projectName
          ? <>You don&apos;t have permission to view <strong>{projectName}</strong>.</>
          : "You don't have permission to view this project."}
        {" "}Ask a project admin to grant you access.
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/w/${workspaceSlug}/projects`)}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to projects
        </Button>
        <Button size="sm" onClick={handleRequestAccess}>
          <Mail className="w-3.5 h-3.5 mr-1.5" /> Request access
        </Button>
      </div>
    </div>
  );
}
