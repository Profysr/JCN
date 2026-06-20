import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import GoogleButton from "@/components/auth/GoogleButton";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/";
  const inviteToken = searchParams.get("invite") || "";
  const prefillEmail = searchParams.get("email") || "";
  const register = useAuthStore((s) => s.register);

  const [form, setForm] = useState({
    full_name: "",
    email: prefillEmail,
    password1: "",
    password2: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  // After any successful auth, accept the pending invite then navigate
  const handlePostAuth = async (workspaceId) => {
    if (workspaceId) {
      navigate(`/w/${workspaceId}`, { replace: true });
      return;
    }
    if (inviteToken) {
      try {
        const workspace = await api
          .post(`/api/invites/${inviteToken}/accept/`)
          .then((r) => r.data);
        localStorage.removeItem("pendingInvite");
        navigate(`/w/${workspace.id}`, { replace: true });
        return;
      } catch {
        // invite already accepted or expired — continue to normal flow
      }
    }
    navigate(next, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (form.password1 !== form.password2) {
      setErrors({ password2: "Passwords do not match." });
      return;
    }
    setLoading(true);
    try {
      await register(form.email, form.password1, form.password2, form.full_name);
      await handlePostAuth(null);
    } catch (err) {
      setErrors(err.response?.data || {});
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (data) => {
    // data.pendingInviteToken comes from authStore.googleLogin()
    if (data?.pendingInviteToken) {
      try {
        const workspace = await api
          .post(`/api/invites/${data.pendingInviteToken}/accept/`)
          .then((r) => r.data);
        navigate(`/w/${workspace.id}`, { replace: true });
        return;
      } catch {
        // fall through to normal navigation
      }
    }
    await handlePostAuth(null);
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-float absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
        />
        <div
          className="animate-float-reverse absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)" }}
        />
        <div
          className="animate-float-slow absolute top-1/3 right-1/4 w-64 h-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)" }}
        />
      </div>

      <Card className="w-full max-w-lg relative animate-scale-in shadow-xl">
        <div className="flex justify-center pt-8 pb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <span className="text-primary-foreground font-bold text-lg select-none">J</span>
          </div>
        </div>

        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
          <CardDescription>
            {inviteToken
              ? "Create an account to accept your invitation"
              : "Start managing projects with your team"}
          </CardDescription>
        </CardHeader>

        <div className="px-8 pb-2">
          <GoogleButton onSuccess={handleGoogleSuccess} onError={setGoogleError} />
          {googleError && (
            <p className="text-sm text-destructive mt-2 animate-slide-up">{googleError}</p>
          )}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-card px-3">or continue with email</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-8">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" type="text" placeholder="Jane Doe" className="h-11" {...field("full_name")} />
              {errors.full_name && (
                <p className="text-xs text-destructive animate-slide-up">{errors.full_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@company.com" required className="h-11" {...field("email")} />
              {errors.email && (
                <p className="text-xs text-destructive animate-slide-up">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password1">Password</Label>
              <div className="relative">
                <Input
                  id="password1"
                  type={showPw1 ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  required
                  className="h-11 pr-10"
                  {...field("password1")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw1((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw1 ? "Hide password" : "Show password"}
                >
                  {showPw1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password1 && (
                <p className="text-xs text-destructive animate-slide-up">{errors.password1}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password2">Confirm password</Label>
              <div className="relative">
                <Input
                  id="password2"
                  type={showPw2 ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  className="h-11 pr-10"
                  {...field("password2")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw2((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw2 ? "Hide password" : "Show password"}
                >
                  {showPw2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password2 && (
                <p className="text-xs text-destructive animate-slide-up">{errors.password2}</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4 px-8 pb-8">
            <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : inviteToken ? "Create account & join workspace" : "Create account"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
