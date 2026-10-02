import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBackend } from "../../bridge/backend-context";
import { useDeployStatus, usePendingDeployDecision, useWorkspace } from "../../bridge/queries";
import type { DeployStatus } from "../../bridge/types";
import { useAction } from "../games/use-action";
import { DeployFailuresDialog, DeployPlanDialog, PurgeDialog } from "./DeployDialogs";
import { ReviewChangesDialog } from "./ReviewChangesDialog";

type Dialog = "preview" | "purge" | "failures" | "review" | null;

/** Minimum time between two focus scans (core/09 §3 "ao focar"). */
const FOCUS_SCAN_INTERVAL_MS = 5000;

interface DeployContextValue {
  /** Active instance ("" when no game is active). */
  instance: string;
  status: DeployStatus | null;
  reloadStatus: () => void;
  deploy: () => Promise<void>;
  reconcile: () => Promise<void>;
  openPreview: () => void;
  openPurge: () => void;
  openFailures: () => void;
  /** DLG-15 outside a deploy: scans and lets the user decide. */
  openReview: () => void;
}

const DeployContext = createContext<DeployContextValue | null>(null);

/**
 * Deploy flows shared by the top bar, the Mods toolbar, the Overview and the
 * Ctrl+D shortcut (ui/02 F-06/F-07). It only starts backend commands and
 * shows the plans and statuses the backend calculates; a deploy that stops
 * at await_decision opens the plan dialog (DLG-14) wherever it came from.
 */
export function DeployProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const run = useAction();
  const workspace = useWorkspace();
  const instance = workspace.status === "ready" ? (workspace.data.active?.id ?? "") : "";
  const status = useDeployStatus(instance);
  const pending = usePendingDeployDecision(instance);
  const [dialog, setDialog] = useState<Dialog>(null);

  const deploy = useCallback(async () => {
    if (instance) await run(() => backend.deploy(instance));
  }, [backend, instance, run]);
  const reconcile = useCallback(async () => {
    if (instance) await run(() => backend.reconcileDeploy(instance));
  }, [backend, instance, run]);

  // Focusing the window asks the backend for a limited scan of the
  // deployment (setting deploy.verifyOnFocus); changes it finds arrive as an
  // event that rereads the status.
  const lastScan = useRef(0);
  useEffect(() => {
    if (!instance) return;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastScan.current < FOCUS_SCAN_INTERVAL_MS) return;
      lastScan.current = now;
      backend.scanExternalChanges(instance).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [backend, instance]);

  const current = status.status === "ready" ? status.data : null;
  const value = useMemo<DeployContextValue>(
    () => ({
      instance,
      status: current,
      reloadStatus: status.reload,
      deploy,
      reconcile,
      openPreview: () => setDialog("preview"),
      openPurge: () => setDialog("purge"),
      openFailures: () => setDialog("failures"),
      openReview: () => setDialog("review"),
    }),
    [instance, current, status.reload, deploy, reconcile],
  );

  const decision = pending.status === "ready" ? pending.data : null;
  return (
    <DeployContext.Provider value={value}>
      {children}
      {decision ? <DeployPlanDialog key={decision.operation} instance={instance} plan={decision} onClose={() => pending.reload()} /> : null}
      {dialog === "preview" && instance ? <DeployPlanDialog instance={instance} onClose={() => setDialog(null)} /> : null}
      {dialog === "purge" && instance ? <PurgeDialog instance={instance} onClose={() => setDialog(null)} /> : null}
      {dialog === "failures" && current ? <DeployFailuresDialog status={current} onRetry={deploy} onClose={() => setDialog(null)} /> : null}
      {dialog === "review" && instance ? <ReviewChangesDialog instance={instance} onClose={() => setDialog(null)} /> : null}
    </DeployContext.Provider>
  );
}

export function useDeploy(): DeployContextValue {
  const ctx = useContext(DeployContext);
  if (!ctx) throw new Error("useDeploy must be used inside <DeployProvider>");
  return ctx;
}
