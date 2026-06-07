import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, Eye, EyeOff, AlertCircle } from "lucide-react";
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
import api from "@/lib/api";

/**
 * Handles /reset-password/:uid/:token — the link sent by dj_rest_auth.
 * Calls POST /api/auth/password/reset/confirm/ with uid + token + new passwords.
 */
export default function ResetPasswordConfirmPage() {
  const { uid, token } = useParams();
  const [form, setForm] = useState({ new_password1: "", new_password2: "" });
  const [show, setShow] = useState({ p1: false, p2: false });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.new_password1 !== form.new_password2) {
      setError("Passwords do not match.");
      return;
    }
    if (form.new_password1.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/auth/password/reset/confirm/", {
        uid,
        token,
        new_password1: form.new_password1,
        new_password2: form.new_password2,
      });
      setSuccess(true);
    } catch (err) {
      const data = err?.response?.data || {};
      const msg =
        data.new_password1?.[0] ||
        data.new_password2?.[0] ||
        data.token?.[0] ||
        data.uid?.[0] ||
        data.detail ||
        data.non_field_errors?.[0] ||
        "Reset failed. The link may have expired.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Set new password</CardTitle>
          <CardDescription>
            Choose a strong password for your account.
          </CardDescription>
        </CardHeader>

        {success ? (
          <>
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
              <p className="font-semibold">Password reset!</p>
              <p className="text-sm text-muted-foreground">
                Your password has been updated successfully.
              </p>
            </CardContent>
            <CardFooter>
              <Link to="/login" className="w-full">
                <Button className="w-full">Sign in with new password</Button>
              </Link>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="pw1">New password</Label>
                <div className="relative">
                  <Input
                    id="pw1"
                    type={show.p1 ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={form.new_password1}
                    onChange={(e) =>
                      setForm({ ...form, new_password1: e.target.value })
                    }
                    className="pr-10"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow((s) => ({ ...s, p1: !s.p1 }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {show.p1 ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="pw2"
                    type={show.p2 ? "text" : "password"}
                    placeholder="Repeat password"
                    value={form.new_password2}
                    onChange={(e) =>
                      setForm({ ...form, new_password2: e.target.value })
                    }
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow((s) => ({ ...s, p2: !s.p2 }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {show.p2 ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Resetting…" : "Reset password"}
              </Button>
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                ← Back to sign in
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
