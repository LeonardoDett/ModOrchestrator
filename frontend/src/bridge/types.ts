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
  params?: Record<string, string>;
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

  // Library (ui/telas/mods.md §10)
  modList(instance: string): Promise<ModRow[]>;
  modDetails(id: string): Promise<ModDetails>;
  modFiles(id: string, filter: string, offset: number, limit: number): Promise<ModFiles>;
  modHistory(id: string): Promise<ModHistoryEntry[]>;
  importQueue(instance: string): Promise<QueueItem[]>;
  importFiles(instance: string, paths: string[]): Promise<string[]>;
  /** Native pickers; an empty choice queues nothing. */
  pickImportFiles(instance: string, title: string): Promise<string[]>;
  pickImportFolder(instance: string, title: string): Promise<string[]>;
  resolveImport(operationId: string, answer: ImportAnswer): Promise<void>;
  cancelImport(operationId: string): Promise<void>;
  installMods(instance: string, ids: string[]): Promise<string[]>;
  reinstallMods(instance: string, ids: string[]): Promise<string[]>;
  previewModRemoval(instance: string, ids: string[]): Promise<RemovalPreview>;
  removeMods(instance: string, ids: string[], withArchives: boolean): Promise<string>;
  setModAttributes(id: string, attributes: ModAttributes): Promise<void>;
  setModsCategory(instance: string, ids: string[], category: string): Promise<void>;
  setModType(id: string, modType: string): Promise<void>;
  setModsEnabled(instance: string, ids: string[], enabled: boolean): Promise<void>;
  categories(instance: string): Promise<Category[]>;
  saveCategory(instance: string, category: Category): Promise<string>;
  deleteCategory(instance: string, id: string): Promise<void>;
  openModFolder(id: string): Promise<void>;
  openModArchive(id: string): Promise<void>;
  /** Files and folders dropped on a drop target (absolute paths); the
   *  returned function stops listening. */
  onFileDrop(listener: (paths: string[]) => void): () => void;

  // Profiles and mod order (ui/telas/profiles.md §4, ui/telas/mods.md §10)
  profileList(instance: string): Promise<ProfileSummary[]>;
  createProfile(instance: string, name: string, from: string): Promise<string>;
  renameProfile(id: string, name: string): Promise<void>;
  setProfileNotes(id: string, notes: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  activateProfile(id: string): Promise<void>;
  compareProfiles(a: string, b: string): Promise<ProfileComparison>;
  transferSelection(from: string, to: string, options: TransferOptions): Promise<void>;
  profileSnapshots(id: string): Promise<Snapshot[]>;
  createSnapshot(id: string): Promise<string>;
  restoreSnapshot(id: string, snapshot: string): Promise<RestoreResult>;
  modOrder(instance: string): Promise<ModOrder>;
  moveMods(instance: string, request: MoveRequest): Promise<MoveResult>;
  createSeparator(instance: string, label: string, color: string, anchor: Anchor): Promise<string>;
  updateSeparator(instance: string, separator: Separator): Promise<void>;
  deleteSeparator(instance: string, id: string): Promise<void>;
  setSeparatorBlockEnabled(instance: string, id: string, enabled: boolean): Promise<void>;
  modRules(instance: string): Promise<Rule[]>;
  previewOrderRule(instance: string, winner: string, loser: string): Promise<RulePreview>;
  createOrderRule(instance: string, winner: string, loser: string): Promise<string>;
  addDependencyRule(instance: string, mod: string, target: string, kind: "requires" | "recommends"): Promise<string>;
  addIncompatibilityRule(instance: string, a: string, b: string): Promise<string>;
  removeRule(instance: string, id: string): Promise<void>;
  setRuleDisabled(instance: string, id: string, disabled: boolean): Promise<void>;
  orderHistory(instance: string): Promise<OrderChange[]>;
  revertOrderChange(instance: string, id: string): Promise<void>;
  undoOrderChange(instance: string): Promise<void>;
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

// --- Library (internal/bridge/library.go) ---

export type ModState = "imported" | "installing" | "installed";

export interface ModRow {
  id: string;
  name: string;
  detectedName: string;
  version: string;
  author: string;
  category: string;
  categoryPath: string[];
  state: ModState;
  enabled: boolean;
  enabledAt?: string;
  size: number;
  files: number;
  type: string;
  typeName: string;
  content: string[];
  installer: string;
  source: string;
  installedAt?: string;
  variantOf?: string;
  variantLabel?: string;
  highlight?: string;
  hasNotes: boolean;
  queued: boolean;
}

export interface ModDetails extends ModRow {
  description: string;
  notes: string;
  tags: string[];
  variantOfName?: string;
  archive?: { name: string; kind: string; size: number; hash: string; retained: boolean };
  installation?: { id: string; installer: string; options: Record<string, string>; files: number; size: number; createdAt: string };
  modTypes: ModTypeInfo[];
}

export interface ModFiles {
  total: number;
  files: { path: string; target: string; size: number }[];
}

export interface ModHistoryEntry {
  id: string;
  type: string;
  occurredAt: string;
  operationId?: string;
  params: Record<string, string>;
}

export interface DuplicateMod {
  id: string;
  name: string;
  version: string;
}

export type ImportChoice = "reinstall" | "variant" | "replace" | "continue" | "root" | "cancel";

export interface ImportDecision {
  kind: "duplicate_archive" | "duplicate_name" | "suspicious_ratio" | "root_ambiguous" | "root_unrecognized" | "fomod_pending";
  choices: ImportChoice[];
  duplicates: DuplicateMod[];
  suggestedLabel?: string;
  candidates: string[];
  folders: string[];
  ratio?: number;
}

export interface QueueItem {
  operationId: string;
  kind: string;
  label: string;
  status: OperationStatus;
  step?: string;
  decision?: ImportDecision;
  cancellable: boolean;
}

export interface ImportAnswer {
  choice: ImportChoice;
  mod?: string;
  label?: string;
  root?: string;
}

export interface RemovalPreview {
  mods: DuplicateMod[];
  orphanRules: number;
  sharedArchives: string[];
  deployed: boolean;
}

export interface ModAttributes {
  name: string;
  version: string;
  author: string;
  notes: string;
  highlight: string;
  tags: string[];
}

export interface Category {
  id: string;
  name: string;
  parent?: string;
  order: number;
}

// --- Profiles and mod order (internal/bridge/profiles.go) ---

export interface ProfileSummary {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  enabled: number;
  mods: number;
  snapshots: number;
  createdAt: string;
  updatedAt: string;
  lastActivatedAt?: string;
}

export interface NamedMod {
  id: string;
  name: string;
}

export interface ProfileComparison {
  a: ProfileSummary;
  b: ProfileSummary;
  onlyA: NamedMod[];
  onlyB: NamedMod[];
  priorityChanged: (NamedMod & { a: number; b: number })[];
  pluginsOnlyA: string[];
  pluginsOnlyB: string[];
  loadOrderChanged: { plugin: string; a: number; b: number }[];
}

export interface TransferOptions {
  order: boolean;
  plugins: boolean;
}

export interface Snapshot {
  id: string;
  reason: string;
  createdAt: string;
  enabled: number;
  mods: number;
}

export interface RestoreResult {
  ignored: NamedMod[];
}

export interface Separator {
  id: string;
  label: string;
  color?: string;
  collapsed: boolean;
  enabled: number;
  total: number;
}

export interface OrderEntry {
  kind: "mod" | "separator";
  modId?: string;
  priority?: number;
  separator?: Separator;
}

export interface ModOrder {
  profileId: string;
  profileName: string;
  entries: OrderEntry[];
  /** Order change Ctrl+Z reverts, if any. */
  undo?: string;
}

export interface EntryRef {
  mod?: string;
  separator?: string;
}

export type AnchorKind = "top" | "bottom" | "before" | "after" | "end_of_block" | "priority";

export interface Anchor {
  kind: AnchorKind;
  entry: EntryRef;
  priority?: number;
}

export type MoveMode = "exact" | "nearest" | "remove_rules";

export interface MoveRequest {
  entries: EntryRef[];
  anchor: Anchor;
  mode: MoveMode;
}

export type RuleKind = "wins" | "requires" | "recommends" | "incompatible";

export interface Rule {
  id: string;
  kind: RuleKind;
  /** For "wins", a wins b. */
  a: NamedMod;
  b: NamedMod;
  source: string;
  disabled: boolean;
  orphan: boolean;
}

export interface MoveResult {
  applied: boolean;
  violated: Rule[];
  hasNearest: boolean;
  nearestPriority?: number;
}

export interface ModMove extends NamedMod {
  from: number;
  to: number;
  because: string[];
}

export interface RulePreview {
  cycle: NamedMod[];
  profiles: { profileId: string; name: string; moves: ModMove[] }[];
}

export interface OrderChange {
  id: string;
  at: string;
  reason: string;
  moved: number;
  revertOf?: string;
  reverted: boolean;
  revertible: boolean;
}
