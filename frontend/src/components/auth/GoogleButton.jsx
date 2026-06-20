import { useGoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";

// onSuccess(data) — if provided, called after auth instead of navigating to `next`
export default function GoogleButton({ next = "/", onSuccess, onError }) {
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const navigate = useNavigate();

  const login = useGoogleLogin({
    onSuccess: async ({ access_token }) => {
      try {
        const data = await googleLogin(access_token);
        if (onSuccess) {
          onSuccess(data);
        } else {
          navigate(next);
        }
      } catch (err) {
        const msg =
          err.response?.data?.non_field_errors?.[0] ||
          err.response?.data?.detail ||
          "Google sign-in failed. Please try again.";
        onError?.(msg);
      }
    },
    onError: () => onError?.("Google sign-in was cancelled or failed."),
  });

  return (
    <button
      type="button"
      onClick={() => login()}
      className="w-full h-11 flex items-center justify-center gap-3 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FcGoogle className="w-5 h-5 flex-shrink-0" />
      Continue with Google
    </button>
  );
}
