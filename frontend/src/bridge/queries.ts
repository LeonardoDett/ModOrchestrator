import { useBackendQuery } from "./use-backend-query";
import type { HistoryFilter, LogFilter } from "./types";

export function useAppInfo() {
  return useBackendQuery((b) => b.getAppInfo(), []);
}

export function useOperations(limit = 50) {
  return useBackendQuery(async (b) => (await b.listRecentOperations(limit)) ?? [], [limit], { onOperationEvents: true });
}

export function useLogTail(filter: LogFilter) {
  const { levels, operation, text, limit } = filter;
  return useBackendQuery(
    async (b) => (await b.logTail({ levels, operation, text, limit })) ?? [],
    [levels.join(","), operation, text, limit],
    { onOperationEvents: true },
  );
}

/** Games screen content; rereads on operation events (manage, search). */
export function useGamesView(showHidden: boolean) {
  return useBackendQuery((b) => b.gamesView(showHidden), [showHidden], { onOperationEvents: true });
}

/** Shell navigation derived by the backend from the active game's capabilities. */
export function useWorkspace() {
  return useBackendQuery((b) => b.workspace(), [], { onOperationEvents: true });
}

export function useInstanceDetails(id: string) {
  return useBackendQuery((b) => b.gameInstanceDetails(id), [id], { onOperationEvents: true });
}

// --- Library (ui/telas/mods.md §10). Every read follows operation events:
// imports, removals and decisions arrive as operation events (D021). ---

export function useModList(instance: string) {
  return useBackendQuery(async (b) => (await b.modList(instance)) ?? [], [instance], { onOperationEvents: true });
}

export function useModDetails(id: string) {
  return useBackendQuery((b) => b.modDetails(id), [id], { onOperationEvents: true });
}

export function useModFiles(id: string, filter: string) {
  return useBackendQuery((b) => b.modFiles(id, filter, 0, 2000), [id, filter], { onOperationEvents: true });
}

export function useModHistory(id: string) {
  return useBackendQuery(async (b) => (await b.modHistory(id)) ?? [], [id], { onOperationEvents: true });
}

export function useImportQueue(instance: string) {
  return useBackendQuery(async (b) => (await b.importQueue(instance)) ?? [], [instance], { onOperationEvents: true });
}

export function useCategories(instance: string) {
  return useBackendQuery(async (b) => (await b.categories(instance)) ?? [], [instance], { onOperationEvents: true });
}

// --- Profiles and mod order (F5). Profile commands are short and reread
// through useAction's refresh; imports change the order through operation
// events (D021). ---

export function useProfiles(instance: string) {
  return useBackendQuery(async (b) => (await b.profileList(instance)) ?? [], [instance], { onOperationEvents: true });
}

export function useSnapshots(profile: string) {
  return useBackendQuery(async (b) => (profile ? ((await b.profileSnapshots(profile)) ?? []) : []), [profile]);
}

export function useModOrder(instance: string) {
  return useBackendQuery((b) => b.modOrder(instance), [instance], { onOperationEvents: true });
}

export function useModRules(instance: string) {
  return useBackendQuery(async (b) => (await b.modRules(instance)) ?? [], [instance], { onOperationEvents: true });
}

export function useOrderHistory(instance: string) {
  return useBackendQuery(async (b) => (await b.orderHistory(instance)) ?? [], [instance]);
}

// --- Conflicts (F6). Calculated by the backend from profile + instance
// (INV-CON-04); commands reread through useAction's refresh, imports and
// removals through operation events (D021). ---

export function useConflictPairs(instance: string, includeDisabled: boolean, search: string) {
  return useBackendQuery((b) => b.conflictPairs(instance, includeDisabled, search), [instance, includeDisabled, search], { onOperationEvents: true });
}

export function useConflictPairDetail(instance: string, a: string, b: string, includeDisabled: boolean) {
  return useBackendQuery((be) => be.conflictPairDetail(instance, a, b, includeDisabled), [instance, a, b, includeDisabled], { onOperationEvents: true });
}

export function useModConflicts(instance: string, mod: string) {
  return useBackendQuery((b) => b.modConflicts(instance, mod), [instance, mod], { onOperationEvents: true });
}

export function useModConflictFiles(instance: string, mod: string, filter: string) {
  return useBackendQuery((b) => b.modConflictFiles(instance, mod, filter, 0, 2000), [instance, mod, filter], { onOperationEvents: true });
}

export function useConflictIndicators(instance: string) {
  return useBackendQuery(async (b) => (await b.conflictIndicators(instance)) ?? [], [instance], { onOperationEvents: true });
}

export function useRuleCycle(instance: string) {
  return useBackendQuery((b) => b.ruleCycle(instance), [instance], { onOperationEvents: true });
}

// --- Deploy (F7). The status, plans and methods are calculated by the
// backend; every reread follows operation events (D021). ---

export function useDeployStatus(instance: string) {
  return useBackendQuery((b) => (instance ? b.deployStatus(instance) : Promise.resolve(null)), [instance], { onOperationEvents: true });
}

export function usePendingDeployDecision(instance: string) {
  return useBackendQuery((b) => (instance ? b.pendingDeployDecision(instance) : Promise.resolve(null)), [instance], { onOperationEvents: true });
}

export function useDeployMethods(instance: string) {
  return useBackendQuery(async (b) => (instance ? await b.deployMethods(instance) : []), [instance], { onOperationEvents: true });
}

export function useInstanceSettings(instance: string) {
  return useBackendQuery(async (b) => (instance ? await b.listInstanceSettings(instance) : []), [instance]);
}

// --- Diagnostics, notifications and history (F9, core/10). Diagnostics are
// recalculated by the backend on every read; "diagnostics.changed" and
// "notification.*" signals arrive with the operation events (D021). ---

export function useProblems(instance: string) {
  return useBackendQuery((b) => (instance ? b.diagnostics(instance) : Promise.resolve(null)), [instance], { onOperationEvents: true });
}

export function useAttention() {
  return useBackendQuery(async (b) => (await b.attentionDiagnostics()) ?? [], [], { onOperationEvents: true });
}

export function useNotifications(limit = 50) {
  return useBackendQuery(async (b) => (await b.notifications(limit)) ?? [], [limit], { onOperationEvents: true });
}

export function useSuppressions() {
  return useBackendQuery(async (b) => (await b.suppressions()) ?? [], [], { onOperationEvents: true });
}

export function useHistory(filter: HistoryFilter) {
  const { instance, profile, mod, types, origin, from, to, before, limit } = filter;
  return useBackendQuery(
    async (b) => (await b.history({ instance, profile, mod, types, origin, from, to, before, limit })) ?? [],
    [instance, profile, mod, types.join(","), origin, from, to, before, limit],
    { onOperationEvents: true },
  );
}

// --- Plugins and load order (F11, core/08). Inventory, indexes and
// problems are calculated by the backend; the background sync and the
// load order file monitor arrive as signals with the operation events
// (D021). ---

export function usePluginList(instance: string) {
  return useBackendQuery((b) => b.pluginList(instance), [instance], { onOperationEvents: true });
}

export function usePluginDetails(instance: string, name: string) {
  return useBackendQuery((b) => (name ? b.pluginDetails(instance, name) : Promise.resolve(null)), [instance, name], { onOperationEvents: true });
}

export function usePluginRules(instance: string) {
  return useBackendQuery((b) => b.pluginRules(instance), [instance], { onOperationEvents: true });
}

export function useLoadOrderView(instance: string) {
  return useBackendQuery((b) => b.loadOrderView(instance), [instance], { onOperationEvents: true });
}

export function useLoadOrderExplain(instance: string, name: string) {
  return useBackendQuery((b) => (name ? b.loadOrderExplain(instance, name) : Promise.resolve(null)), [instance, name], { onOperationEvents: true });
}

// --- F12: Settings, Play, Overview and Dashboard. Reads follow operation
// events: launches, deploys, backups and the game process watch all signal
// through them (D021). ---

export function useRestartState() {
  return useBackendQuery((b) => b.restartState(), [], { onOperationEvents: true });
}

export function useBackupStatus() {
  return useBackendQuery((b) => b.backupStatus(), [], { onOperationEvents: true });
}

export function useWorkarounds() {
  return useBackendQuery((b) => b.workarounds(), []);
}

export function useExtensions() {
  return useBackendQuery(async (b) => (await b.extensions()) ?? [], []);
}

export function useLaunchCheck(instance: string) {
  return useBackendQuery(async (b) => (instance ? await b.launchCheck(instance) : null), [instance], { onOperationEvents: true });
}

export function useInstanceOverview(instance: string) {
  return useBackendQuery((b) => b.instanceOverview(instance), [instance], { onOperationEvents: true });
}

export function useDashboardLayout() {
  return useBackendQuery(async (b) => (await b.dashboardLayout()) ?? [], [], { onOperationEvents: true });
}

export function useFirstSteps() {
  return useBackendQuery((b) => b.firstSteps(), [], { onOperationEvents: true });
}

export function useRecentGames() {
  return useBackendQuery(async (b) => (await b.recentGames()) ?? [], [], { onOperationEvents: true });
}

export function useActiveGameStatus() {
  return useBackendQuery((b) => b.activeGameStatus(), [], { onOperationEvents: true });
}
