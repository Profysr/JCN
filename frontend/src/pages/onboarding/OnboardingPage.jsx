import { useState, useRef } from "react";
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
import { ImagePlus, X } from "lucide-react";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const fileInputRef = useRef(null);

  const { mutate, isPending } = useCreateWorkspace({
    onSuccess: (workspace) => navigate(`/w/${workspace.id}/setup`),
    onError: (err) =>
      setError(err.response?.data?.name?.[0] || "Something went wrong."),
  });

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = (e) => {
    e.stopPropagation();
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", name);
    if (logoFile) fd.append("logo", logoFile);
    mutate(fd);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Create your workspace</CardTitle>
          <CardDescription>
            This is where your team will collaborate. You can change this later.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Logo upload */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-2xl border-2 border-dashed border-border group-hover:border-primary transition-colors flex items-center justify-center bg-muted/50 overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Workspace logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
                      <ImagePlus className="w-6 h-6" />
                      <span className="text-[10px] font-medium">Logo</span>
                    </div>
                  )}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Click to upload a logo (optional)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleLogoChange}
              />
            </div>

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
