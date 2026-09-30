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
  logsDir: string;
  /** Whether this window is frameless and the UI draws the window controls. */
  customTitleBar: boolean;
}

export type OperationStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface EntityRef {
  kind: string;
  id: string;
}

export interface OperationStep {
  name: string;
  status: StepStatus;
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

/** One catalog setting (core/13) with its effective value. */
export interface Setting {
  key: string;
  tab: string;
  type: "bool" | "int" | "enum" | "path";
  value: string;
  default: string;
  isDefault: boolean;
  options?: string[];
  min?: number;
  max?: number;
  advanced: boolean;
  restartRequired: boolean;
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogFilter {
  levels: LogLevel[];
  operation: string;
  text: string;
  limit: number;
}

export interface LogEntry {
  time?: string;
  level: LogLevel;
  message: string;
  operation?: string;
  step?: string;
  error?: string;
  fields?: Record<string, unknown>;
}

/** Window controls of a frameless desktop window. */
export interface WindowControls {
  minimise(): void;
  toggleMaximise(): void;
  quit(): void;
}

/** Everything the UI may ask of the backend. */
export interface Backend {
  /** False when the UI runs outside the desktop shell (plain browser, tests). */
  readonly connected: boolean;
  /** Present only inside the desktop shell. */
  readonly window: WindowControls | null;
  getAppInfo(): Promise<AppInfo>;
  listRecentOperations(limit: number): Promise<Operation[]>;
  getOperationEvents(id: string): Promise<OperationEvent[]>;
  onOperationEvent(listener: (event: OperationEvent) => void): () => void;
  listAppSettings(): Promise<Setting[]>;
  setAppSetting(key: string, value: string): Promise<void>;
  resetAppSetting(key: string): Promise<void>;
  logTail(filter: LogFilter): Promise<LogEntry[]>;
  openLogFolder(): Promise<void>;
}
