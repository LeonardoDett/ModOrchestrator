/**
 * Transport types mirrored from internal/bridge/dto.go. The UI renders them;
 * it never derives business decisions from them.
 */
export interface AppInfo {
  name: string;
  version: string;
  dataDir: string;
  schemaVersion: number;
  interruptedOperations: number;
}

export type OperationStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";

export interface EntityRef {
  kind: string;
  id: string;
}

export interface OperationStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  finishedAt?: string;
}

export interface OperationError {
  code: string;
  message: string;
  step?: string;
  detail?: string;
  retryable: boolean;
}

export interface Operation {
  id: string;
  kind: string;
  status: OperationStatus;
  subject?: EntityRef;
  steps: OperationStep[];
  currentStep?: string;
  progress: { current: number; total: number };
  error?: OperationError;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface OperationEvent {
  id: string;
  sequence: number;
  type: string;
  occurredAt: string;
  operationId?: string;
  subject?: EntityRef;
  status?: OperationStatus;
  step?: string;
  progress?: { current: number; total: number };
  error?: OperationError;
}

/** Everything the UI may ask of the backend. */
export interface Backend {
  /** False when the UI runs outside the desktop shell (plain browser, tests). */
  readonly connected: boolean;
  getAppInfo(): Promise<AppInfo>;
  listRecentOperations(limit: number): Promise<Operation[]>;
  getOperationEvents(id: string): Promise<OperationEvent[]>;
  onOperationEvent(listener: (event: OperationEvent) => void): () => void;
}
