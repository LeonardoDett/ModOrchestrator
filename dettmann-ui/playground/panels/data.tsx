import { useState } from "react";
import {
  Accordion,
  Badge,
  DataTable,
  FilterBar,
  Inspector,
  ReorderableList,
  Stack,
  Tabs,
  Tree,
  type DataTableColumn,
  type DataTableSort,
  type Intent,
  type ReorderableListItem,
  type TreeNode,
} from "../../src";

interface Mod {
  id: string;
  name: string;
  version: string;
  files: number;
  status: string;
  intent: Intent;
}

const MODS: Mod[] = [
  { id: "skyui", name: "SkyUI", version: "5.2", files: 248, status: "Ativo", intent: "success" },
  { id: "skse", name: "SKSE64", version: "2.2.6", files: 12, status: "Ativo", intent: "success" },
  { id: "racemenu", name: "RaceMenu", version: "0.4.19", files: 1310, status: "Conflito", intent: "warning" },
  { id: "ussep", name: "USSEP", version: "4.3.2", files: 5, status: "Atualizar", intent: "info" },
  { id: "armors", name: "Immersive Armors", version: "8.1", files: 2904, status: "Quebrado", intent: "danger" },
  { id: "smim", name: "Static Mesh Improvement", version: "2.08", files: 3711, status: "Ativo", intent: "success" },
];

const COLUMNS: DataTableColumn<Mod>[] = [
  { id: "name", label: "Mod", cell: (m) => m.name, sortable: true, grow: true },
  { id: "version", label: "Versão", cell: (m) => <span className="font-mono">{m.version}</span>, width: 96 },
  { id: "files", label: "Arquivos", cell: (m) => m.files, numeric: true, sortable: true, width: 96 },
  { id: "status", label: "Estado", cell: (m) => <Badge intent={m.intent}>{m.status}</Badge>, width: 112 },
];

const FILES: TreeNode[] = [
  {
    id: "data",
    label: "Data",
    children: [
      { id: "interface", label: "Interface", children: [{ id: "skyui.swf", label: "skyui.swf" }] },
      { id: "skyui.esp", label: "SkyUI_SE.esp" },
      { id: "skyui.bsa", label: "SkyUI_SE.bsa", disabled: true },
    ],
  },
];

const DASHLETS: ReorderableListItem<string>[] = [
  { id: "attention", data: "Precisa de atenção" },
  { id: "game", data: "Jogo ativo" },
  { id: "ops", data: "Operações recentes" },
];

/** Componentes de dados da onda 3 do redesenho (D-036). */
export function DataPanel() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(["racemenu"]));
  const [node, setNode] = useState("skyui.esp");
  const [dashlets, setDashlets] = useState(DASHLETS);

  const rows = MODS.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    if (!sort) return 0;
    const dir = sort.direction === "asc" ? 1 : -1;
    return sort.columnId === "files" ? (a.files - b.files) * dir : a.name.localeCompare(b.name) * dir;
  });

  return (
    <Stack gap="lg">
      <div className="overflow-hidden rounded-card border border-border">
        <FilterBar query={query} onQueryChange={setQuery} queryPlaceholder="Buscar mods" className="border-b-0" />
        <DataTable
          aria-label="Mods"
          className="h-64 rounded-none border-x-0 border-b-0"
          columns={COLUMNS}
          rows={rows}
          getRowId={(m) => m.id}
          selectionMode="multiple"
          selectedIds={selected}
          onSelectedIdsChange={setSelected}
          sort={sort}
          onSortChange={setSort}
          empty="Nenhum mod encontrado"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stack gap="md">
          <Tabs.Root defaultValue="files">
            <Tabs.List aria-label="Detalhes">
              <Tabs.Trigger value="files">Arquivos</Tabs.Trigger>
              <Tabs.Trigger value="conflicts">Conflitos</Tabs.Trigger>
              <Tabs.Trigger value="notes">Notas</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Panel value="files" className="py-2">
              <Tree aria-label="Arquivos do mod" nodes={FILES} defaultExpanded={new Set(["data", "interface"])} selectedId={node} onSelect={(n) => setNode(n.id)} />
            </Tabs.Panel>
            <Tabs.Panel value="conflicts" className="py-2 text-sm text-fg-muted">
              3 arquivos sobrescritos por RaceMenu.
            </Tabs.Panel>
            <Tabs.Panel value="notes" className="py-2 text-sm text-fg-muted">
              Sem notas.
            </Tabs.Panel>
          </Tabs.Root>
        </Stack>
        <Stack gap="md">
          <ReorderableList
            aria-label="Dashlets"
            items={dashlets}
            onReorder={setDashlets}
            renderItem={(item) => <div className="flex h-full items-center text-sm">{item.data}</div>}
            labels={{ dragHandle: "Arraste para reordenar", moveUp: "Mover para cima", moveDown: "Mover para baixo" }}
          />
          <Accordion.Root className="rounded-card border border-border">
            <Accordion.Item value="req">
              <Accordion.Trigger value="req">Requisitos</Accordion.Trigger>
              <Accordion.Content value="req">SKSE64 2.2.6 ou mais novo.</Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </Stack>
      </div>

      <Inspector title="SkyUI" description="Versão 5.2 · 248 arquivos" sticky={false} className="rounded-card border">
        <p className="text-sm text-fg-muted">Interface substituta com busca e ordenação no inventário.</p>
      </Inspector>
    </Stack>
  );
}
