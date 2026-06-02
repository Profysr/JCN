import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({ full_name: "", email: "", password1: "", password2: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

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
      // If there's a ?next= param (e.g. an invite link), go there.
      // Otherwise go to "/" which WorkspaceRedirect handles — it'll send to
      // /onboarding only if the user has no workspace yet.
      const next = searchParams.get("next");
      navigate(next || "/", { replace: true });
    } catch (err) {
      const data = err.response?.data || {};
      setErrors(data);
    } finally {
      setLoading(false);
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start managing projects with your team</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" placeholder="Jane Doe" {...field("full_name")} />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@company.com" {...field("email")} required />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password1">Password</Label>
              <Input id="password1" type="password" placeholder="Min. 8 characters" {...field("password1")} required />
              {errors.password1 && <p className="text-xs text-destructive">{errors.password1}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password2">Confirm password</Label>
              <Input id="password2" type="password" placeholder="••••••••" {...field("password2")} required />
              {errors.password2 && <p className="text-xs text-destructive">{errors.password2}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
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
