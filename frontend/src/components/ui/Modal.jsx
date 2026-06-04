import React, { Suspense } from "react";
import { X, AlertTriangle, Info, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { cn } from "@/lib/utils";

// Map semantic variant names → our Button variants
const VARIANT_MAP = {
  primary:      "default",
  danger:       "destructive",
  secondary:    "secondary",
  success:      "default",
  warning:      "default",
  "danger-light": "ghost",
};

/**
 * Loading Skeleton for Modal Content
 */
const ModalSkeleton = () => (
    <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
            <div className="h-4 bg-foreground/10 rounded w-1/3" />
            <div className="h-4 bg-foreground/5 rounded w-16" />
        </div>
        <div className="space-y-2">
            <div className="h-20 bg-foreground/5 rounded-md w-full" />
            <div className="h-12 bg-foreground/5 rounded-md w-full" />
            <div className="h-32 bg-foreground/5 rounded-md w-full" />
        </div>
        <div className="flex justify-between items-center gap-4 pt-2">
            <div className="h-10 bg-foreground/10 rounded-md w-24" />
            <div className="h-10 bg-foreground/10 rounded-md w-32" />
        </div>
    </div>
);

/**
 * Base Modal Component
 */
const BaseModal = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    onConfirm,
    confirmLabel = "Confirm",
    confirmVariant = "primary",
    isLoading = false,
    isConfirmDisabled = false,
    showFooter = true,
    maxWidth = "600px",
    padding = "px-5 py-4",
    icon: Icon,
    iconColor = "text-primary",
}) => {
    if (!isOpen) return null;

    return createPortal(
      <div className="fixed inset-0 z-999 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="absolute inset-0 bg-background/60 backdrop-blur-md"
        />

        {/* Modal Content */}
        <div
          className="relative w-full bg-background rounded-md shadow-xl overflow-hidden"
          style={{ maxWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-muted/40 px-5 py-2.5 border-b border-border">
            <div className="flex items-center gap-2.5">
              {Icon && <Icon className={cn("w-4 h-4", iconColor)} />}
              <div className="flex flex-col">
                <h2 className="text-sm font-semibold text-foreground">
                  {title}
                </h2>
                {description && (
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {description}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className={padding}>
            <Suspense fallback={<ModalSkeleton />}>{children}</Suspense>
          </div>

          {/* Footer */}
          {showFooter && (
            <div className="flex items-center justify-end gap-2 px-5 py-2.5 border-t border-border">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                variant={"destructive"}
                onClick={onConfirm}
                disabled={isConfirmDisabled || isLoading}
              >
                {isLoading && (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                )}
                {confirmLabel}
              </Button>
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
};

/**
 * Generalized Modal with Variants
 */
const Modal = ({ variant, ...props }) => {
    // Built-in Templates
    switch (variant) {
        case "delete":
            return (
                <BaseModal
                    title={props.title || "Confirm Delete"}
                    confirmLabel={props.confirmLabel || "Delete"}
                    confirmVariant="danger"
                    icon={AlertTriangle}
                    iconColor="text-red-500"
                    {...props}
                >
                    {props.children || (
                        <div className="space-y-0">
                            <p className="text-foreground-muted">
                                Are you sure you want to proceed with this deletion?
                            </p>
                            <p className="text-sm text-error font-medium">
                                This action is permanent and cannot be undone.
                            </p>
                        </div>
                    )}
                </BaseModal>
            );

        case "info":
            return (
                <BaseModal
                    icon={Info}
                    iconColor="text-info"
                    {...props}
                />
            );

        case "success":
            return (
              <BaseModal
                icon={CheckCircle}
                iconColor="text-success"
                confirmVariant="default"
                {...props}
              />
            );

        case "warning":
            return (
              <BaseModal
                icon={AlertCircle}
                iconColor="text-warning"
                confirmVariant="default"
                {...props}
              />
            );

        default:
            return <BaseModal {...props} />;
    }
};

export default Modal;   
