import { useBackendQuery } from "./use-backend-query";
import type { LogFilter } from "./types";

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
