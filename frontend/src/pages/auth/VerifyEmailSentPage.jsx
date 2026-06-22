import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import api from "@/shared/lib/api";
import { useToast } from "@/shared/components/ui/toast";

export default function VerifyEmailSentPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "your email";

  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  const handleResend = async () => {
    setError("");
    setResending(true);
    try {
      await api.post("/api/auth/registration/resend-email/", { email });
      setResent(true);
    } catch (err) {
      const msg =
        err?.response?.data?.detail || "Could not resend. Please try registering again.";
      setError(msg);
      toast.error("Failed to resend email", msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Check your inbox</CardTitle>
          <CardDescription>
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{email}</span>. Click
            it to activate your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {resent && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Verification email resent!
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center">
            Didn't receive it? Check your spam folder or resend below.
          </p>
        </CardContent>

        <CardFooter className="flex-col gap-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={resending || resent}
          >
            {resending
              ? "Resending…"
              : resent
                ? "Email sent!"
                : "Resend verification email"}
          </Button>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
