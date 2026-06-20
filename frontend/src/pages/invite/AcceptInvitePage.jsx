import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/Loader";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useAcceptInvite } from "@/hooks/useMembers";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, LogIn, UserPlus, Zap, Users, BarChart2 } from "lucide-react";

const FEATURES = [
  { icon: Zap,       text: "Kanban boards, sprints & task management" },
  { icon: Users,     text: "Real-time collaboration & notifications" },
  { icon: BarChart2, text: "Wiki, forms, analytics — all in one workspace" },
];

function InviteShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm bg-card border rounded-lg p-8 shadow-sm">
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

  const { data: invite, isLoading, isError } = useQuery({
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
          setTimeout(() => navigate(`/w/${workspace.id}`), 1800);
        },
        onError: (err) =>
          setError(err.response?.data?.detail || "Failed to accept invite."),
      });
    }
  }, [invite, accessToken]);

  if (isLoading) return <InviteShell><Loader /></InviteShell>;

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
          <span className="font-medium text-foreground">{invite?.workspace?.name}</span>…
        </p>
      </InviteShell>
    );
  }

  // Wrong account logged in
  if (accessToken && user?.email !== invite?.email) {
    return (
      <InviteShell>
        <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-center">Wrong account</h2>
        <p className="text-sm text-muted-foreground text-center mt-1">
          This invite is for{" "}
          <span className="font-medium text-foreground">{invite?.email}</span>, but you're
          signed in as{" "}
          <span className="font-medium text-foreground">{user?.email}</span>.
        </p>
        <p className="text-sm text-muted-foreground text-center mt-1">
          Sign in with the correct account to accept.
        </p>
      </InviteShell>
    );
  }

  // Not logged in — rich landing screen
  const workspaceName = invite?.workspace?.name || "a workspace";
  const initial = workspaceName[0]?.toUpperCase();
  const inviterName = invite?.invited_by || "Someone";
  const inviteEmail = invite?.email || "";

  const goToRegister = () => {
    localStorage.setItem("pendingInvite", token);
    navigate(`/register?invite=${token}&email=${encodeURIComponent(inviteEmail)}`);
  };

  const goToLogin = () => {
    navigate(
      `/login?next=${encodeURIComponent(`/invites/${token}`)}&email=${encodeURIComponent(inviteEmail)}`
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md bg-card border rounded-lg shadow-sm overflow-hidden">
        {/* Workspace identity */}
        <div className="bg-primary/5 border-b px-8 py-6 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xl mx-auto mb-3">
            {initial}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{inviterName}</span> invited you to join
          </p>
          <h1 className="text-xl font-bold mt-1">{workspaceName}</h1>
          <span className="inline-block mt-2 text-xs bg-secondary border rounded px-2.5 py-1 font-medium capitalize">
            Joining as {invite?.role}
          </span>
        </div>

        {/* What you get */}
        <div className="px-8 py-5 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            What you'll get
          </p>
          <ul className="space-y-2.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-foreground">
                <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="px-8 py-6 space-y-3">
          <p className="text-xs text-muted-foreground text-center mb-1">
            Invite sent to <span className="font-medium text-foreground">{inviteEmail}</span>
          </p>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button className="w-full gap-2" onClick={goToRegister}>
            <UserPlus className="w-4 h-4" /> Create account to join
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={goToLogin}>
            <LogIn className="w-4 h-4" /> I already have an account
          </Button>
        </div>
      </div>
    </div>
  );
}
