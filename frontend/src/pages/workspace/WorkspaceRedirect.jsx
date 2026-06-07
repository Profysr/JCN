import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Loader } from "@/components/ui/Loader";

export default function WorkspaceRedirect() {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () =>
      api.get("/api/workspaces/").then((r) => r.data.results || r.data),
  });

  useEffect(() => {
    if (isError) {
      navigate("/login", { replace: true });
      return;
    }
    if (!data) return;
    if (data.length > 0) {
      navigate(`/w/${data[0].slug}`, { replace: true });
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
