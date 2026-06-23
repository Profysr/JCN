import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspaces } from "@/shared/hooks/useWorkspace";
import { Loader } from "@/shared/components/ui/Loader";

export default function WorkspaceRedirect() {
  const navigate = useNavigate();
  const { data, isError } = useWorkspaces();

  useEffect(() => {
    if (isError) {
      navigate("/login", { replace: true });
      return;
    }
    if (!data) return;
    if (data.length > 0) {
      navigate(`/w/${data[0].id}`, { replace: true });
    } else {
      navigate("/onboarding", { replace: true });
    }
  }, [data, isError, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Loader size="xl" />
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}