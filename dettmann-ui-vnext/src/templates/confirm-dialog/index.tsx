"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Info, Trash2 } from "lucide-react";
import { Modal } from "../../components/modal";
import { Button } from "../../components/button";
import { FeaturedIcon } from "../../components/featured-icon";
import { Typography } from "../../primitives/typography";
import type { LucideIconComponent } from "../../primitives/icon";

export type ConfirmType = "danger" | "warning" | "info" | "success";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: ConfirmType;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Called on confirm. Does not receive a DOM event. */
  onConfirm?: () => void;
}

const typeConfig: Record<
  ConfirmType,
  { color: "danger" | "warning" | "primary" | "success"; icon: LucideIconComponent }
> = {
  danger: { color: "danger", icon: Trash2 },
  warning: { color: "warning", icon: AlertTriangle },
  info: { color: "primary", icon: Info },
  success: { color: "success", icon: Check },
};

/**
 * ConfirmDialog is a typed confirmation modal on top of Modal.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  type = "info",
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmDialogProps) {
  const config = typeConfig[type];

  const handleConfirm = () => {
    onConfirm?.();
    onOpenChange(false);
  };

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content size="sm">
        <Modal.Header className="flex-col items-start gap-4 border-b-0">
          <FeaturedIcon icon={config.icon} color={config.color} size="lg" label={type} />
          <div className="space-y-1">
            <Modal.Title>{title}</Modal.Title>
            {description ? (
              <Typography variant="body-sm" color="muted-fg">
                {description}
              </Typography>
            ) : null}
          </div>
        </Modal.Header>
        <Modal.Footer>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={type === "danger" ? "danger" : type === "success" ? "success" : "primary"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

export type ConfirmOptions = Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm">;

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmProviderProps {
  children: ReactNode;
}

/**
 * ConfirmProvider enables `useConfirm()` anywhere below, same pattern as ToastProvider.
 */
export function ConfirmProvider({ children }: ConfirmProviderProps) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setRequest(options);
    });
  }, []);

  const finish = (value: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolve?.(value);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={request != null}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
        type={request?.type}
        title={request?.title ?? ""}
        description={request?.description}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        onConfirm={() => finish(true)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context;
}
