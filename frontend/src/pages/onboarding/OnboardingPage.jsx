import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { mutate, isPending } = useCreateWorkspace({
    onSuccess: (workspace) => navigate(`/w/${workspace.id}/setup`),
    onError: (err) =>
      setError(err.response?.data?.name?.[0] || "Something went wrong."),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Create your workspace</CardTitle>
          <CardDescription>
            This is where your team will collaborate. You can change this later.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate({ name });
          }}
        >
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || !name.trim()}
            >
              {isPending ? "Creating…" : "Create workspace →"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
