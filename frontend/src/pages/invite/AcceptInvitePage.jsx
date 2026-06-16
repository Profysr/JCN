import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/Loader";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useAcceptInvite } from "@/hooks/useMembers";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, LogIn } from "lucide-react";

function InviteShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm bg-card border rounded--md p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, accessToken } = useAuthStore();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  // Fetch invite details — public endpoint, no auth needed ---> useQuery = Used for fetching data (GET requests).
  const {
    data: invite,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.get(`/api/invites/${token}/`).then((r) => r.data),
    retry: false,
  });

  const acceptMutation = useAcceptInvite(token);

  // Auto-accept if user is already logged in with the right email
  useEffect(() => {
    if (invite && accessToken && user?.email === invite.email) {
      acceptMutation.mutate(undefined, {
        onSuccess: (workspace) => {
          setAccepted(true);
          setTimeout(() => navigate(`/w/${workspace.id}`), 2000);
        },
        onError: (err) => setError(err.response?.data?.detail || "Failed to accept invite."),
      });
    }
  }, [invite, accessToken]);

  if (isLoading) {
    return (
      <InviteShell>
        <Loader />
      </InviteShell>
    );
  }

  if (isError) {
    return (
      <InviteShell>
        <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-center">Invite not found</h2>
        <p className="text-sm text-muted-foreground text-center mt-1">
          This invite link is invalid or has already been used.
        </p>
        <Link to="/" className="mt-5 block">
          <Button className="w-full">Go to dashboard</Button>
        </Link>
      </InviteShell>
    );
  }

  if (accepted) {
    return (
      <InviteShell>
        <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-center">You're in!</h2>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Redirecting you to{" "}
          <span className="font-medium text-foreground">
            {invite?.workspace?.name}
          </span>
          …
        </p>
      </InviteShell>
    );
  }

  // Wrong user is logged in
  if (accessToken && user?.email !== invite?.email) {
    return (
      <InviteShell>
        <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-center">Wrong account</h2>
        <p className="text-sm text-muted-foreground text-center mt-1">
          This invite is for{" "}
          <span className="font-medium text-foreground">{invite?.email}</span>,
          but you're signed in as{" "}
          <span className="font-medium text-foreground">{user?.email}</span>.
        </p>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Sign in with the correct account to accept.
        </p>
      </InviteShell>
    );
  }

  // Not logged in — show invite info + redirect to login
  return (
    <InviteShell>
      <div className="w-12 h-12 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold text-lg mx-auto mb-4">
        {invite?.workspace?.name?.[0]?.toUpperCase()}
      </div>
      <h2 className="text-lg font-semibold text-center">You've been invited</h2>
      <p className="text-sm text-muted-foreground text-center mt-1">
        <span className="font-medium text-foreground">
          {invite?.invited_by}
        </span>{" "}
        invited you to join{" "}
        <span className="font-medium text-foreground">
          {invite?.workspace?.name}
        </span>{" "}
        as{" "}
        <span className="capitalize font-medium text-foreground">
          {invite?.role}
        </span>
        .
      </p>
      <p className="text-xs text-muted-foreground text-center mt-2">
        This invite is for <span className="font-medium">{invite?.email}</span>
      </p>

      {error && (
        <p className="text-sm text-destructive text-center mt-3">{error}</p>
      )}

      <div className="mt-6 space-y-2">
        <Button
          className="w-full"
          onClick={() => navigate(`/login?next=/invites/${token}`)}
        >
          <LogIn className="w-4 h-4 mr-2" /> Sign in to accept
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Don't have an account?{" "}
          <Link
            to={`/register?next=/invites/${token}`}
            className="text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </InviteShell>
  );
}
