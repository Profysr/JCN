import { createContext, useContext, useCallback, useReducer, useRef } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  error:   <AlertCircle className="w-4 h-4 text-red-500" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  info:    <Info className="w-4 h-4 text-primary" />,
  default: null,
};

let nextId = 0;

function reducer(state, action) {
  switch (action.type) {
    case "add":
      return [action.toast, ...state].slice(0, 3); // max 3 stacked
    case "remove":
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    dispatch({ type: "remove", id });
  }, []);

  const toast = useCallback(
    ({ title, description, type = "default", duration = 4000 }) => {
      const id = ++nextId;
      dispatch({ type: "add", toast: { id, title, description, type } });
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Top-center stack */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 pointer-events-none"
        style={{ zIndex: "var(--z-toast)" }}
      >
        {toasts.map((t, i) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-xl border bg-card shadow-popover",
              "flex items-start gap-3 px-4 py-3",
              "animate-toast-in",
              i > 0 && "opacity-70 scale-95"
            )}
            style={{ animationDelay: `${i * 20}ms` }}
          >
            {ICONS[t.type] && (
              <div className="flex-shrink-0 mt-0.5">{ICONS[t.type]}</div>
            )}
            <div className="flex-1 min-w-0">
              {t.title && (
                <p className="text-sm font-semibold text-foreground leading-snug">{t.title}</p>
              )}
              {t.description && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  const { toast } = ctx;
  return {
    toast,
    success: (title, description) => toast({ title, description, type: "success" }),
    error:   (title, description) => toast({ title, description, type: "error" }),
    warning: (title, description) => toast({ title, description, type: "warning" }),
    info:    (title, description) => toast({ title, description, type: "info" }),
  };
}

