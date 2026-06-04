import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import api from "@/lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next  = searchParams.get("next") || "/";
  const login = useAuthStore((s) => s.login);

  const [mode,    setMode]    = useState("login"); // "login" | "forgot"
  const [form,    setForm]    = useState({ email: "", password: "" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(next);
    } catch (err) {
      setError(err.response?.data?.non_field_errors?.[0] || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/password/reset/", { email: form.email });
      setResetSent(true);
    } catch (err) {
      setError(err.response?.data?.email?.[0] || "Could not send reset email. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password card ──────────────────────────────────────────────────
  if (mode === "forgot") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Reset password</CardTitle>
            <CardDescription>
              Enter your email and we'll send you a reset link.
            </CardDescription>
          </CardHeader>

          {resetSent ? (
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <p className="font-semibold">Check your inbox</p>
              <p className="text-sm text-muted-foreground">
                We've sent a password reset link to <strong>{form.email}</strong>.
              </p>
            </CardContent>
          ) : (
            <form onSubmit={handleForgot}>
              <CardContent className="space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Email address</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-3">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </CardFooter>
            </form>
          )}

          <div className="px-6 pb-5 text-center">
            <button
              onClick={() => { setMode("login"); setResetSent(false); setError(""); }}
              className="text-sm text-primary hover:underline"
            >
              ← Back to sign in
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Sign in card ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your JCN account</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(""); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link
                to={`/register${next !== "/" ? `?next=${next}` : ""}`}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
