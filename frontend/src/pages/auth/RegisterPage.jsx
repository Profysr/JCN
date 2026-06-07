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
        const next = searchParams.get("next") || "/";
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
      // Otherwise go to "/" which WorkspaceRedirect handles — it'll send to /onboarding only if the user has no workspace yet.
      navigate(next, { replace: true });
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

const FIELDS = [
  { id: "full_name", label: "Full name", placeholder: "Jane Doe" },
  {
    id: "email",
    label: "Email",
    type: "email",
    placeholder: "you@company.com",
    required: true,
  },
  {
    id: "password1",
    label: "Password",
    type: "password",
    placeholder: "Min. 8 characters",
    required: true,
  },
  {
    id: "password2",
    label: "Confirm password",
    type: "password",
    placeholder: "••••••••",
    required: true,
  },
];

return (
  <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Start managing projects with your team
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {FIELDS.map(({ id, label, type = "text", placeholder, required }) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id}>{label}</Label>
              <Input
                id={id}
                type={type}
                placeholder={placeholder}
                required={required}
                {...field(id)}
              />
              {errors[id] && (
                <p className="text-xs text-destructive">{errors[id]}</p>
              )}
            </div>
          ))}
        </CardContent>

        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  </div>
);
}
