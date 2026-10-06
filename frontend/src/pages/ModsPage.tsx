import { ModsWorkspace } from "./ModsWorkspace";
import { WorkspaceGate } from "./PageBody";

/** Mods (ui/telas/mods.md) of the active game. */
export function ModsPage() {
  return <WorkspaceGate>{(instance) => <ModsWorkspace instance={instance} />}</WorkspaceGate>;
}
