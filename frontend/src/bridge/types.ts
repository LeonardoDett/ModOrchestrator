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
  /** Parameters of a delivery signal (notification.created...). */
  data?: Record<string, string>;
}

/** One catalog setting (core/13) with its effective value. */
export interface Setting {
  key: string;
  tab: string;
  type: "bool" | "int" | "enum" | "path" | "list";
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
  /** FOMOD wizard (DLG-06): the backend evaluates every selection. */
  fomodState(operationId: string, selection: FomodSelection[]): Promise<FomodView>;
  /** An image of the installer as a data URL ("" is the module image). */
  fomodImage(operationId: string, image: string): Promise<string>;
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
  // Conflicts (F6, ui/telas/conflicts.md §6)
  conflictPairs(instance: string, includeDisabled: boolean, search: string): Promise<ConflictPairs>;
  conflictPairDetail(instance: string, a: string, b: string, includeDisabled: boolean): Promise<ConflictPairDetail>;
  modConflicts(instance: string, mod: string): Promise<ModConflicts>;
  modConflictFiles(instance: string, mod: string, filter: string, offset: number, limit: number): Promise<ModConflictFiles>;
  conflictIndicators(instance: string): Promise<ConflictIndicator[]>;
  ruleCycle(instance: string): Promise<RuleCycle | null>;
  setFileOverrides(instance: string, winner: string, locations: FileLocation[]): Promise<void>;
  clearFileOverrides(instance: string, locations: FileLocation[]): Promise<void>;
  setFileExclusions(instance: string, mod: string, locations: FileLocation[], hidden: boolean): Promise<void>;
  markConflictsReviewed(instance: string, pairs: { a: string; b: string }[]): Promise<void>;
  previewPairDecisions(instance: string, decisions: PairDecision[]): Promise<RulePreview>;
  decidePairs(instance: string, decisions: PairDecision[]): Promise<void>;
  // Deploy and purge (F7, core/04)
  deployStatus(instance: string): Promise<DeployStatus>;
  previewDeploy(instance: string, purge: boolean): Promise<DeployPlan>;
  deploy(instance: string): Promise<string>;
  purge(instance: string): Promise<string>;
  reconcileDeploy(instance: string): Promise<string>;
  cancelDeploy(instance: string): Promise<boolean>;
  pendingDeployDecision(instance: string): Promise<DeployPlan | null>;
  resolveDeployDecision(instance: string, operation: string, acceptFallbacks: string[], decisions: ExternalDecision[]): Promise<void>;
  cancelDeployDecision(instance: string, operation: string): Promise<void>;
  verifyDeployment(instance: string): Promise<ExternalChanges>;
  // External changes (F8, core/09)
  scanExternalChanges(instance: string): Promise<void>;
  resolveExternalChanges(instance: string, decisions: ExternalDecision[]): Promise<string>;
  openLocationFolder(instance: string, location: FileLocation): Promise<void>;
  deployMethods(instance: string): Promise<DeployMethod[]>;
  changeDeployMethod(instance: string, method: string): Promise<string>;
  previewMoveStaging(instance: string, path: string): Promise<StagingPreview>;
  moveStaging(instance: string, path: string): Promise<string>;
  listInstanceSettings(instance: string): Promise<Setting[]>;
  setInstanceSetting(instance: string, key: string, value: string): Promise<void>;
  // Diagnostics, notifications and history (F9, core/10)
  diagnostics(instance: string): Promise<Problems>;
  attentionDiagnostics(): Promise<Problems[]>;
  markDiagnosticsVisited(instance: string): Promise<void>;
  runHealthChecks(instance: string): Promise<void>;
  executeDiagnosticAction(instance: string, key: string, actionId: string, index: number): Promise<DiagnosticActionResult>;
  suppressDiagnostic(instance: string, key: string, wholeCode: boolean): Promise<void>;
  unsuppressDiagnostic(key: string, code: string): Promise<void>;
  suppressions(): Promise<Suppression[]>;
  resetSuppressedDiagnostics(): Promise<number>;
  notifications(limit: number): Promise<AppNotification[]>;
  markNotificationsRead(ids: string[]): Promise<void>;
  dismissNotifications(ids: string[]): Promise<void>;
  sendDesktopNotification(id: string, title: string, body: string): Promise<void>;
  history(filter: HistoryFilter): Promise<HistoryEntry[]>;
  revertHistoryEntry(id: string): Promise<void>;
  /** Save dialog + zip; "" when cancelled. */
  exportSupportBundle(title: string, defaultName: string): Promise<string>;
  enableImpact(instance: string, ids: string[], enabling: boolean): Promise<EnableImpact>;
  // Plugins and load order (F11, ui/telas/plugins.md §8, load-order.md §5)
  pluginList(instance: string): Promise<PluginList>;
  pluginDetails(instance: string, name: string): Promise<PluginDetails>;
  pluginRules(instance: string): Promise<PluginRules>;
  loadOrderView(instance: string): Promise<LoadOrderView>;
  loadOrderExplain(instance: string, name: string): Promise<PluginExplain>;
  loadOrderDiffApplied(instance: string): Promise<LoadOrderDiff>;
  sortPreview(instance: string): Promise<SortPreview>;
  exportLoadOrder(instance: string): Promise<string>;
  setPluginsEnabled(instance: string, plugins: string[], enabled: boolean): Promise<void>;
  sortPlugins(instance: string): Promise<SortResult>;
  undoLastSort(instance: string): Promise<void>;
  setAutoSort(instance: string, on: boolean): Promise<void>;
  movePlugins(instance: string, plugins: string[], index: number): Promise<PluginMoveResult>;
  setIndexLock(instance: string, plugins: string[], locked: boolean): Promise<void>;
  setPluginGroup(instance: string, plugins: string[], group: string): Promise<void>;
  createPluginRule(instance: string, plugin: string, after: string): Promise<void>;
  removePluginRule(instance: string, id: string): Promise<void>;
  createPluginGroup(instance: string, name: string, after: string[]): Promise<void>;
  updatePluginGroup(instance: string, name: string, after: string[]): Promise<void>;
  deletePluginGroup(instance: string, name: string): Promise<void>;
  applyLoadOrder(instance: string): Promise<string>;
  restorePreviousLoadOrder(instance: string): Promise<string>;
  importLoadOrder(instance: string, text: string): Promise<SortResult>;
  resolveLoadOrderChange(instance: string, action: "import_load_order" | "restore_load_order"): Promise<string>;
  // Settings, Workarounds and Extensions (F12, core/13, core/14 §3–4)
  restartState(): Promise<RestartState>;
  restartApp(): Promise<void>;
  openDataFolder(): Promise<void>;
  openBackupsFolder(): Promise<void>;
  backupStatus(): Promise<BackupStatus>;
  createBackup(): Promise<Backup>;
  restoreBackup(id: string): Promise<void>;
  /** Open dialog; "" when cancelled. */
  pickBackupFile(title: string): Promise<string>;
  restoreBackupFromFile(path: string): Promise<void>;
  cancelRestore(): Promise<void>;
  workarounds(): Promise<Workarounds>;
  cleanTempFiles(): Promise<TempCleanup>;
  rebuildPluginHeaderCache(): Promise<void>;
  previewMoveArchives(instance: string, path: string): Promise<ArchivesPreview>;
  moveArchiveStore(instance: string, path: string): Promise<string>;
  extensions(): Promise<Extension[]>;
  // Play, Overview and Dashboard (F12, core/11 §6, overview.md, dashboard.md)
  launchCheck(instance: string): Promise<LaunchCheck>;
  launch(instance: string, request: LaunchRequest): Promise<string>;
  instanceOverview(instance: string): Promise<InstanceOverview>;
  dashboardLayout(): Promise<Dashlet[]>;
  firstSteps(): Promise<FirstSteps>;
  recentGames(): Promise<RecentGame[]>;
  activeGameStatus(): Promise<ActiveGameStatus>;
}

// --- Settings, Workarounds and Extensions (internal/bridge/settings.go). ---

export interface RestartState {
  /** Restart-required settings changed since the app started. */
  settings: string[];
  /** A database restore waits for the restart. */
  restore: boolean;
}

export type BackupKind = "auto" | "manual" | "pre_migration" | "startup" | "pre_restore";

export interface Backup {
  id: string;
  kind: BackupKind;
  at: string;
  size: number;
}

export interface BackupStatus {
  lastAuto?: string;
  lastManual?: string;
  lastStartup?: string;
  failure?: { kind: BackupKind; at: string; reason: string };
  restorePending?: string;
  restoredAt?: string;
  backups: Backup[];
}

export interface Workarounds {
  longPaths: "enabled" | "disabled" | "unknown";
}

export interface TempCleanup {
  removed: number;
  skipped: number;
}

export interface ArchivesPreview {
  from: string;
  to: string;
  bytes: number;
  free: number;
  sameVolume: boolean;
  problem?: string;
  reason?: string;
}

export interface ExtensionGame {
  id: string;
  name: string;
  capabilities: string[];
  custom: boolean;
}

export interface Extension {
  name: string;
  version: string;
  games: ExtensionGame[];
  capabilities: string[];
  builtIn: boolean;
  active: boolean;
}

// --- Play, Overview and Dashboard (internal/bridge/overview.go). ---

export type LaunchState = "ready" | "deploy" | "warnings" | "blocked" | "running" | "busy" | "unavailable";

export interface LaunchOption {
  id: string;
  exe: string;
  default: boolean;
}

export interface LaunchCheck {
  instance: string;
  state: LaunchState;
  options: LaunchOption[];
  deployKind: DeployStatusKind;
  deployReason: string;
  deployNeeded: boolean;
  autoDeploy: boolean;
  deployProblem: boolean;
  busy?: string;
  running: string[];
  blocking: Diagnostic[];
  warnings: Diagnostic[];
  unavailable?: string;
}

export interface LaunchRequest {
  option: string;
  deploy: boolean;
  confirmed: boolean;
}

export interface AttentionGroup {
  code: string;
  severity: DiagnosticSeverity;
  blocking: boolean;
  count: number;
  first: Diagnostic;
}

export interface ModsSummary {
  enabled: number;
  total: number;
  size: number;
  files: number;
}

export interface PluginsSummary {
  active: number;
  limits: { kind: string; used: number; max: number }[];
}

export interface ConflictsSummary {
  pairs: number;
  unreviewed: number;
  overrides: number;
}

export interface InstanceOverview {
  instance: ManagedGame;
  status?: DeployStatus;
  attention: AttentionGroup[];
  attentionPartial: boolean;
  mods?: ModsSummary;
  plugins?: PluginsSummary;
  conflicts?: ConflictsSummary;
  recent: HistoryEntry[];
}

export type DashletId = "first_steps" | "attention" | "active_game" | "recent_games" | "recent_operations" | "whats_new";

export interface Dashlet {
  id: DashletId;
  hidden: boolean;
  pinned: boolean;
  visible: boolean;
  locked: boolean;
}

export interface FirstSteps {
  steps: { id: "manage_game" | "import_mod" | "deploy" | "play"; done: boolean }[];
  complete: boolean;
}

export interface RecentGame {
  instance: ManagedGame;
  lastUsed?: string;
}

export interface ActiveGameStatus {
  instance?: ManagedGame;
  status?: DeployStatus;
  mods?: ModsSummary;
  conflicts?: ConflictsSummary;
}

// --- Diagnostics, notifications and history (internal/bridge/diagnostics.go).
// Diagnostics are calculated by the backend on every read; texts come from
// the i18n catalog by code + parameters (D044). ---

export type DiagnosticSeverity = "error" | "warning" | "info";
export type DiagnosticModule = "deploy" | "conflicts" | "rules" | "plugins" | "library" | "game" | "app";

export interface DiagnosticEvidence {
  kind: string;
  ref?: EntityRef;
  params?: Record<string, string>;
}

export interface DiagnosticAction {
  id: string;
  params?: Record<string, string>;
  target?: EntityRef;
  /** Set when the UI opens a place instead of running a backend command. */
  navigateTo?: string;
}

export interface Diagnostic {
  key: string;
  code: string;
  severity: DiagnosticSeverity;
  blocking: boolean;
  blocks: string[];
  module: DiagnosticModule;
  instance: string;
  params: Record<string, string>;
  evidence: DiagnosticEvidence[];
  actions: DiagnosticAction[];
  related: EntityRef[];
  firstSeen?: string;
  new: boolean;
  suppressed: boolean;
}

export interface DiagnosticCounts {
  blocking: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface Problems {
  instance: string;
  name?: string;
  items: Diagnostic[];
  suppressed: Diagnostic[];
  counts: DiagnosticCounts;
  partial: boolean;
}

export interface DiagnosticActionResult {
  operations: string[];
}

export interface Suppression {
  key?: string;
  code?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  kind: "diagnostic" | "operation_result" | "info";
  code: string;
  params: Record<string, string>;
  subject?: EntityRef;
  instance?: string;
  severity: string;
  count: number;
  state: "unread" | "read" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

export interface HistoryFilter {
  instance: string;
  profile: string;
  mod: string;
  types: string[];
  origin: string;
  from: string;
  to: string;
  before: number;
  limit: number;
}

export interface HistoryEntry {
  id: string;
  sequence: number;
  type: string;
  at: string;
  origin: "user" | "auto" | "system";
  subject?: EntityRef;
  operation?: string;
  params: Record<string, string>;
  items: number;
  reversible: boolean;
  revertedBy?: string;
  revertOf?: string;
}

export interface EnableImpact {
  alsoEnable: NamedMod[];
  affected: NamedMod[];
}

// --- Deploy (internal/bridge/deployment.go). Status and plans are
// calculated by the backend; the UI shows them (D021). ---

export type DeployStatusKind = "never_deployed" | "in_sync" | "pending" | "blocked" | "failed" | "unknown";

export interface DeployFailure {
  location: FileLocation;
  action?: string;
  code: string;
}

export interface ProfileRef {
  id: string;
  name: string;
}

export interface DeployStatus {
  instance: string;
  kind: DeployStatusKind;
  reason: string;
  activeProfile: ProfileRef;
  appliedProfile?: ProfileRef;
  appliedAt?: string;
  method: string;
  entries: number;
  /** Work holding the instance ("deploy", "import"...). */
  busy?: string;
  /** Deploy waiting at await_decision. */
  pendingDecision?: string;
  externalChanges: number;
  /** Generated files found in managed folders (they never block, D080). */
  newFiles: number;
  foreign: ForeignFinding[];
  failures: DeployFailure[];
}

export interface DeploySummary {
  create: number;
  keep: number;
  replace: number;
  remove: number;
  backupAndCreate: number;
  restoreBackup: number;
  mkdir: number;
  removeDir: number;
  extraBytes: number;
  decisions: number;
}

export type ExternalChangeKind = "missing" | "modified" | "replaced" | "unexpected" | "permission" | "load_order";

export type ExternalAction =
  | "restore"
  | "accept_removal"
  | "keep_change"
  | "revert"
  | "save_to_mod"
  | "capture"
  | "leave_unmanaged"
  | "ignore_now"
  | "retry"
  | "import_load_order"
  | "restore_load_order";

export interface FileFacts {
  size: number;
  modTime?: string;
}

/** One row of DLG-15; the actions offered come from the backend (core/09 §4). */
export interface DeployChange {
  location: FileLocation;
  kind: ExternalChangeKind;
  mod?: string;
  modName?: string;
  method?: string;
  wanted: boolean;
  actions: ExternalAction[];
  /** Pre-selected action; absent for generated files (nothing is pre-selected). */
  suggested?: ExternalAction;
  before?: FileFacts;
  after?: FileFacts;
}

/** The action chosen for one row of DLG-15. */
export interface ExternalDecision {
  location: FileLocation;
  action: ExternalAction;
  captureInto?: string;
  captureName?: string;
  captureCategory?: string;
}

/** A scan outside a deploy (verify, review). */
export interface ExternalChanges {
  instance: string;
  changes: DeployChange[];
  changeCount: number;
  newFileCount: number;
}

export interface DeployBlocked {
  location: FileLocation;
  reason: string;
}

export interface DeployFallback {
  key: string;
  target: string;
  from: string;
  to: string;
  count: number;
  sample: FileLocation[];
}

export interface DeployPlan {
  instance: string;
  operation?: string;
  kind: "deploy" | "purge";
  summary: DeploySummary;
  changes: DeployChange[];
  blocked: DeployBlocked[];
  fallbacks: DeployFallback[];
  changeCount: number;
  blockedCount: number;
  newFileCount: number;
  empty: boolean;
}

export interface DeployMethod {
  method: "hardlink" | "symlink" | "copy";
  available: boolean;
  reason?: string;
  preferred: boolean;
}

export interface StagingPreview {
  from: string;
  to: string;
  bytes: number;
  free: number;
  deployed: boolean;
  sameVolume: boolean;
  hardlinkAfter: boolean;
  problem?: string;
  reason?: string;
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
  /** The suggestion; staging is empty when mods.useSuggestedStaging is off. */
  suggestedStaging?: string;
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

export type ImportChoice = "reinstall" | "variant" | "replace" | "continue" | "root" | "install" | "cancel";

export interface ImportDecision {
  kind: "duplicate_archive" | "duplicate_name" | "suspicious_ratio" | "root_ambiguous" | "root_unrecognized" | "fomod_script" | "fomod";
  choices: ImportChoice[];
  duplicates: DuplicateMod[];
  suggestedLabel?: string;
  candidates: string[];
  folders: string[];
  ratio?: number;
  fomod?: FomodDecision;
}

/** Options chosen in one group of the FOMOD wizard, by display position. */
export interface FomodSelection {
  step: number;
  group: number;
  options: number[];
}

export interface FomodWarning {
  code: string;
  params: Record<string, string>;
}

/** The FOMOD wizard an import waits on (DLG-06); steps come from fomodState. */
export interface FomodDecision {
  module: string;
  hasImage: boolean;
  /** Choices of the previous installation (reinstall), preselected. */
  previous: FomodSelection[];
  warnings: FomodWarning[];
}

export type FomodGroupType = "SelectExactlyOne" | "SelectAtMostOne" | "SelectAtLeastOne" | "SelectAll" | "SelectAny";
export type FomodOptionType = "Required" | "Optional" | "Recommended" | "NotUsable" | "CouldBeUsable";

export interface FomodOption {
  index: number;
  name: string;
  description: string;
  image?: string;
  type: FomodOptionType;
  selected: boolean;
  locked: boolean;
  disabled: boolean;
}

export interface FomodGroup {
  index: number;
  name: string;
  type: FomodGroupType;
  options: FomodOption[];
  problem?: "exactly_one" | "at_least_one" | "at_most_one";
}

export interface FomodStep {
  index: number;
  name: string;
  visible: boolean;
  groups: FomodGroup[];
}

export interface FomodSummary {
  files: number;
  size: number;
  folders: { folder: string; files: number }[];
  warnings: FomodWarning[];
  requirements: { file: string; mod?: string; modName?: string }[];
}

/** The wizard evaluated by the backend for the visited groups. */
export interface FomodView {
  steps: FomodStep[];
  selection: FomodSelection[];
  problems: FomodSelection[];
  summary?: FomodSummary;
  planError?: string;
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
  /** FOMOD: the visited groups and the requirement files to turn into rules. */
  fomod?: FomodSelection[];
  requirements?: string[];
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

// --- Conflicts (internal/bridge/conflicts.go, core/05 §5) ---

export interface FileLocation {
  target: string;
  path: string;
}

export interface ConflictMod {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
}

export interface PairRule {
  id: string;
  winner: string;
  source: string;
  disabled: boolean;
}

/** How a pair is decided as a whole (ui/telas/conflicts.md §3). */
export type ConflictDecision = "order" | "rule" | "override" | "mixed" | "redundant";
/** How the winner of one location was decided (core/05 §5.1). */
export type ConflictResolution = "order" | "rule" | "override" | "redundant";

export interface ConflictPair {
  a: ConflictMod;
  b: ConflictMod;
  /** The mod deploying most of the pair's files. */
  winner: string;
  files: number;
  winsA: number;
  winsB: number;
  redundant: number;
  decision: ConflictDecision;
  reviewed: boolean;
  needsReview: boolean;
  potential: boolean;
  rule?: PairRule;
}

export interface ConflictTotals {
  pairs: number;
  unreviewed: number;
  override: number;
  redundant: number;
  rule: number;
  order: number;
  mixed: number;
}

export interface StaleIntent {
  kind: "override" | "exclusion";
  location: FileLocation;
  mod: ConflictMod;
  reason: "disabled" | "not_provider" | "missing";
  /** Enabled providers of the location now (ascending priority), for "Reescolher". */
  rivals: ConflictMod[];
}

export interface ConflictPairs {
  pairs: ConflictPair[];
  totals: ConflictTotals;
  stale: StaleIntent[];
  pendingHashes: number;
}

export interface ConflictProvider extends ConflictMod {
  size: number;
  hash?: string;
}

export interface ConflictFile {
  location: FileLocation;
  /** Ascending priority. */
  providers: ConflictProvider[];
  winner: string;
  resolution: ConflictResolution;
  override?: string;
}

export interface ConflictPairDetail {
  pair: ConflictPair;
  files: ConflictFile[];
  pendingHashes: number;
}

export interface ConflictOpponent {
  opponent: ConflictMod;
  files: number;
  wins: number;
  loses: number;
  redundant: number;
  decision: ConflictDecision;
  reviewed: boolean;
  needsReview: boolean;
  rule?: PairRule;
}

export type ConflictIndicatorKind = "none" | "wins_all" | "loses_all" | "mixed" | "fully_overwritten" | "redundant_only";

export interface ModConflicts {
  mod: ConflictMod;
  indicator: ConflictIndicatorKind;
  opponents: ConflictOpponent[];
}

export type ConflictFileState = "none" | "wins" | "loses" | "redundant" | "hidden";

export interface ModConflictFile {
  location: FileLocation;
  size: number;
  state: ConflictFileState;
  winner?: ConflictMod;
  opponents: ConflictMod[];
  overridden: boolean;
}

export interface ModConflictFiles {
  total: number;
  files: ModConflictFile[];
}

export interface ConflictIndicator {
  modId: string;
  indicator: ConflictIndicatorKind;
  files: number;
  unreviewed: number;
}

export type PairChoice = "wins" | "loses" | "order";

export interface PairDecision {
  mod: string;
  opponent: string;
  choice: PairChoice;
}

export interface RuleCycle {
  mods: ConflictMod[];
  rules: { id: string; winner: NamedMod; loser: NamedMod; source: string }[];
}

// --- Plugins and load order (internal/bridge/plugins.go, core/08). The
// inventory, indexes, constraints and problems are calculated by the
// backend; the UI only shows and asks (anti-pattern 1). ---

export type PluginOrigin = "mod" | "base_game" | "unmanaged";

export interface PluginRow {
  name: string;
  enabled: boolean;
  implicit: boolean;
  locked: boolean;
  /** 1-based place in the full load order. */
  position: number;
  /** Load index in the adapter format ("0A", "FE:003"); "" when inactive. */
  index: string;
  origin: PluginOrigin;
  mod: string;
  modName: string;
  flags: string[];
  group: string;
  masters: number;
  problems: number;
  problem: string;
  severity: DiagnosticSeverity | "";
  author: string;
  version: string;
  description: string;
  rules: number;
}

export interface PluginLimit {
  kind: string;
  used: number;
  max: number;
}

export interface DisabledPlugin {
  name: string;
  mod: string;
  modName: string;
  losing: boolean;
}

export interface PluginList {
  rows: PluginRow[];
  limits: PluginLimit[];
  active: number;
  errors: number;
  autoSort: boolean;
  disabled: DisabledPlugin[];
  external: boolean;
  cycle: string[];
  manualOrder: boolean;
  hasLoadOrder: boolean;
}

export interface PluginMaster {
  name: string;
  present: boolean;
  active: boolean;
  before: boolean;
  mod: string;
  modName: string;
  disabled: boolean;
}

export interface PluginRule {
  id: string;
  plugin: string;
  after: string;
  source: string;
  disabled: boolean;
  orphan: boolean;
}

export interface PluginDetails extends PluginRow {
  path: string;
  headerError: string;
  mastersList: PluginMaster[];
  dependents: string[];
  ruleList: PluginRule[];
  diagnostics: Diagnostic[];
}

export interface PluginGroup {
  name: string;
  after: string[];
  plugins: string[];
  default: boolean;
}

export interface PluginRules {
  rules: PluginRule[];
  groups: PluginGroup[];
  plugins: string[];
}

export interface LoadOrderState {
  supported: boolean;
  applied: boolean;
  differences: number;
  external: boolean;
  fileExists: boolean;
  unreadable: boolean;
  canRestorePrevious: boolean;
}

export interface LoadOrderView extends PluginList {
  state: LoadOrderState;
  canUndoSort: boolean;
}

/** A constraint that holds a plugin in place (kind: master, master_flag, rule, group). */
export interface PluginReason {
  kind: string;
  rule: string;
  group: string;
  afterGroup: string;
  other: string;
  before: boolean;
  plugin: string;
}

export interface PluginExplain {
  plugin: string;
  position: number;
  fixed: boolean;
  locked: boolean;
  group: string;
  after: PluginReason[];
  dependents: PluginReason[];
}

export interface PluginMove {
  plugin: string;
  from: number;
  to: number;
  because: PluginReason[];
}

export interface SortPreview {
  moves: PluginMove[];
  confirmAbove: number;
  cycle: string[];
}

export interface SortResult {
  moved: number;
  moves: PluginMove[];
}

export interface PluginMoveResult {
  applied: boolean;
  violated: PluginReason[];
  nearest: number;
}

export interface LoadOrderLine {
  name: string;
  enabled: boolean;
}

export interface LoadOrderDiff {
  desired: LoadOrderLine[];
  applied: LoadOrderLine[];
  exists: boolean;
}
