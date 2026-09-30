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

  // Games (ui/telas/games.md §6)
  gamesView(showHidden: boolean): Promise<GamesView>;
  gameInstanceDetails(id: string): Promise<ManagedGame>;
  workspace(): Promise<Workspace>;
  /** "quick" returns "" when done; "full" returns the operation id. */
  scanGames(mode: "quick" | "full"): Promise<string>;
  cancelOperation(id: string): Promise<boolean>;
  validateGameRoot(gameId: string, root: string): Promise<RootCheck>;
  suggestGameFolders(gameId: string, root: string, name: string): Promise<GameFolders>;
  verifyGameSetup(setup: GameSetup): Promise<SetupVerification>;
  manageGame(setup: GameSetup): Promise<ManageResult>;
  setActiveInstance(id: string): Promise<void>;
  renameInstance(id: string, name: string): Promise<void>;
  hideInstance(id: string, hidden: boolean): Promise<void>;
  hideGame(gameId: string, hidden: boolean): Promise<void>;
  updateInstanceLocation(id: string, root: string): Promise<void>;
  unmanageGame(id: string, options: UnmanageOptions): Promise<string>;
  openInstanceFolder(id: string, folder: InstanceFolder): Promise<void>;
  /** Native folder picker; "" when cancelled. */
  pickFolder(title: string): Promise<string>;
}

// --- Games (internal/bridge/dto_games.go) ---

export interface Target {
  id: string;
  path: string;
}

export interface TargetSpec {
  id: string;
  path: string;
}

export interface ModTypeInfo {
  id: string;
  name: string;
  target: string;
  methods?: string[];
}

/** Mark of another manager in the game folders (INV-DEP-08). */
export interface ForeignFinding {
  kind: "vortex" | "mo2" | "other_instance";
  target?: string;
  name: string;
  instance?: string;
}

/** A finding or advisory with a code the UI translates. */
export interface Problem {
  code: string;
  params?: Record<string, string>;
}

export interface ManagedGame {
  id: string;
  gameId: string;
  gameName: string;
  /** Generic game: the user declared the targets. */
  custom: boolean;
  name: string;
  adapter: string;
  store: string;
  root: string;
  staging: string;
  archiveStore: string;
  backupStore: string;
  method: string;
  executable?: string;
  version?: string;
  active: boolean;
  hidden: boolean;
  unavailable: boolean;
  rootMissing: boolean;
  deployed: boolean;
  capabilities: string[];
  targets: Target[];
  modTypes: ModTypeInfo[];
  foreign: ForeignFinding[];
}

export interface DiscoveredGame {
  gameId: string;
  gameName: string;
  root: string;
  store: string;
  version?: string;
  hidden: boolean;
}

export interface SupportedGame {
  gameId: string;
  gameName: string;
  hidden: boolean;
}

export interface GamesView {
  managed: ManagedGame[];
  discovered: DiscoveredGame[];
  supported: SupportedGame[];
  scanned: boolean;
  hiddenCount: number;
}

/** What the "manage game" assistant collects. */
export interface GameSetup {
  gameId: string;
  name: string;
  root: string;
  store: string;
  targets: TargetSpec[];
  executable: string;
  staging: string;
  archiveStore: string;
  backupStore: string;
  method: string;
}

export interface GameFolders {
  staging: string;
  archiveStore: string;
  backupStore: string;
}

export interface MethodStatus {
  method: string;
  available: boolean;
  reason?: string;
}

export interface SetupVerification {
  name: string;
  root: string;
  version?: string;
  targets: Target[];
  staging: string;
  archiveStore: string;
  backupStore: string;
  methods: MethodStatus[];
  foreign: ForeignFinding[];
  problems: Problem[];
  warnings: Problem[];
}

export interface RootCheck {
  root: string;
  version?: string;
  problem?: Problem;
}

export interface ManageResult {
  instanceId: string;
  operationId: string;
}

export interface UnmanageOptions {
  deleteFiles: boolean;
  confirmName: string;
}

export interface InstanceRef {
  id: string;
  name: string;
  gameName: string;
}

/** Workspace screens the backend derives from capabilities (core/11 §5). */
export type WorkspaceItemId = "overview" | "mods" | "plugins" | "load_order" | "conflicts" | "profiles" | "diagnostics";

export interface Workspace {
  active?: InstanceRef;
  instances: InstanceRef[];
  items: WorkspaceItemId[];
}

export type InstanceFolder = "game" | "staging" | "archives" | "backups";
