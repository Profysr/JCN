import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Loader } from "@/components/ui/Loader";


const FetchUser = ({ fetchMe }) => {
  useEffect(() => {
    fetchMe().catch(() => {});
  }, [fetchMe]);

  return <Loader size="xl" className="min-h-screen bg-background" />;
};

export default function ProtectedRoute() {
  const { user, accessToken, fetchMe } = useAuthStore();
  const location = useLocation();

  // No token at all → send to login
  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Token exists but user not hydrated yet → fetch it
  if (!user) {
    return <FetchUser fetchMe={fetchMe} />;
  }

  return <Outlet />;
}
