import { Outlet, Navigate, useParams } from "react-router-dom";
import { Loader } from "@/shared/components/ui/Loader";
import { usePermission } from "@/contexts/PermissionsContext";
import { useMyOrgProfile } from "@/apps/people/hooks/useOrg";
import { usePeopleSocket } from "@/apps/people/hooks/usePeopleSocket";
import { usePeopleNavShortcuts } from "@/apps/people/hooks/usePeopleShortcuts";

/**
 * Wraps every People/HR route (see App.jsx). Blocks access until the member has
 * completed the employee onboarding intake (OrgProfile.onboarding_completed).
 * When incomplete, redirects to the full-page multi-step intake at
 * `/w/:id/people/welcome`; that route lives outside this gate so there's no loop.
 *
 * The workspace owner is exempt — they set up the org, not an employee profile.
 */
export default function ProfileSetupGate() {
  const { workspaceId } = useParams();
  usePeopleSocket();
  usePeopleNavShortcuts();
  const { isLoading: permsLoading, isOwner } = usePermission();
  const isExempt = isOwner;
  const { data: profile, isLoading: profileLoading } = useMyOrgProfile(
    workspaceId,
    { enabled: !isExempt },
  );

  if (permsLoading || (!isExempt && profileLoading)) {
    return <Loader className="min-h-screen" size="lg" />;
  }

  if (!isExempt && profile && !profile.onboarding_completed) {
    return <Navigate to={`/w/${workspaceId}/people/welcome`} replace />;
  }

  return <Outlet />;
}
