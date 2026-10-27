import { useState } from "react";
import { Boxes, Download, FolderOpen, HardDrive, Link2, LayoutDashboard, Puzzle, Settings, ScrollText } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Icon,
  Input,
  Modal,
  Sidebar,
  Stack,
  Switch,
  Table,
  Toolbar,
  Typography,
  type Intent,
} from "../../src";

const MODS: { name: string; version: string; status: string; intent: Intent; enabled: boolean }[] = [
  { name: "SkyUI", version: "5.2", status: "Ativo", intent: "success", enabled: true },
  { name: "SKSE64", version: "2.2.6", status: "Ativo", intent: "success", enabled: true },
  { name: "RaceMenu", version: "0.4.19", status: "Conflito", intent: "warning", enabled: true },
  { name: "USSEP", version: "4.3.2", status: "Atualizar", intent: "info", enabled: false },
  { name: "Immersive Armors", version: "8.1", status: "Quebrado", intent: "danger", enabled: false },
];

const SECTIONS = [
  {
    id: "main",
    label: "Jogo",
    items: [
      { id: "overview", label: "Visão geral", icon: LayoutDashboard },
      { id: "mods", label: "Mods", icon: Puzzle, badge: <Badge size="sm">5</Badge> },
      { id: "profiles", label: "Perfis", icon: Boxes },
      { id: "files", label: "Arquivos", icon: FolderOpen },
    ],
  },
  {
    id: "system",
    label: "Sistema",
    placement: "end" as const,
    items: [
      { id: "log", label: "Registro", icon: ScrollText },
      { id: "settings", label: "Ajustes", icon: Settings },
    ],
  },
];

const SIDEBAR_LABELS = {
  navigation: "Navegação",
  openSidebar: "Abrir navegação",
  collapseSidebar: "Recolher navegação",
  expandSidebar: "Expandir navegação",
};

/**
 * Tela representativa: shell com navegação, barra com uma ação `high`, tabela, formulário e
 * diálogo. O `Modal` é portado para `document.body` e herda tema e modo da coluna pelo
 * `ThemeScope` (o `Portal` reemite o escopo).
 */
export function SampleScreen() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState("Principal");
  const [method, setMethod] = useState("hardlink");
  const [backup, setBackup] = useState(true);
  const [autoSort, setAutoSort] = useState(false);

  return (
    <div data-budget-region="sample" className="flex h-[34rem] overflow-hidden rounded-card border border-border bg-canvas">
      <Sidebar.Root
        sections={SECTIONS}
        currentId="mods"
        labels={SIDEBAR_LABELS}
        header={
          <Typography variant="label" className="px-2 py-3 font-semibold">
            Orchestrator
          </Typography>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          start={
            <>
              <Typography variant="heading-6" color="fg">
                Mods
              </Typography>
              <Badge size="sm" intent="info">
                1 nova
              </Badge>
            </>
          }
          end={
            <>
              <Button size="sm" emphasis="low">
                Filtrar
              </Button>
              <Button size="sm" emphasis="high" startIcon={<Icon icon={Download} size="sm" color="current" />} onClick={() => setOpen(true)}>
                Instalar mod
              </Button>
            </>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 [&>*]:shrink-0">
          <Alert.Root variant="warning" role="status">
            <Alert.Title>RaceMenu sobrescreve 3 arquivos de SkyUI</Alert.Title>
            <Alert.Description>Revise a ordem antes de implantar.</Alert.Description>
          </Alert.Root>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Mod</Table.Head>
                <Table.Head>Versão</Table.Head>
                <Table.Head>Estado</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {MODS.map((m, i) => (
                <Table.Row key={m.name} selected={i === 2}>
                  <Table.Cell className={m.enabled ? "text-fg" : "text-fg-muted"}>{m.name}</Table.Cell>
                  <Table.Cell className="font-mono text-fg-muted">{m.version}</Table.Cell>
                  <Table.Cell>
                    <Badge size="sm" intent={m.intent}>
                      {m.status}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          <Stack gap="md" as="form" onSubmit={(e) => e.preventDefault()} className="rounded-card border border-border bg-surface p-4">
            <Typography variant="label" color="fg">
              Implantação
            </Typography>
            <Input.Root fullWidth value={profile} onChange={setProfile}>
              <Input.Label>Perfil</Input.Label>
              <Input.Box>
                <Input.Field />
              </Input.Box>
              <Input.HelperText>Nome exibido na lista de perfis.</Input.HelperText>
            </Input.Root>
            <Input.Root fullWidth name="method" value={method} onChange={setMethod}>
              <Input.Label floating>Método de implantação</Input.Label>
              <Input.Box>
                <Input.Select
                  options={[
                    { value: "hardlink", label: "Hardlink", icon: <Link2 />, description: "Rápido, sem cópia; exige o mesmo disco" },
                    { value: "symlink", label: "Symlink", icon: <Link2 />, description: "Funciona entre discos" },
                    {
                      label: "Cópia",
                      options: [
                        { value: "copy", label: "Copiar arquivos", icon: <HardDrive />, description: "Mais lento, máxima compatibilidade" },
                        { value: "usvfs", label: "Virtual (USVFS)", disabled: true, description: "Indisponível neste jogo" },
                      ],
                    },
                  ]}
                />
              </Input.Box>
            </Input.Root>
            <Checkbox label="Criar backup antes de implantar" checked={backup} onCheckedChange={setBackup} />
            <Switch label="Ordenar automaticamente" checked={autoSort} onCheckedChange={setAutoSort} />
            <div className="flex justify-end gap-2">
              <Button size="sm" emphasis="low" intent="danger">
                Descartar
              </Button>
              <Button size="sm" type="submit">
                Salvar
              </Button>
            </div>
          </Stack>
        </div>
      </div>
      <Modal.Root open={open} onOpenChange={setOpen}>
        <Modal.Content size="sm">
          <Modal.Header>
            <Modal.Title>Instalar mod</Modal.Title>
            <Modal.CloseButton aria-label="Fechar" />
          </Modal.Header>
          <Modal.Body>
            <Typography variant="body-sm" color="muted-fg">
              O arquivo será extraído para a área de staging e entrará no fim da ordem de mods.
            </Typography>
          </Modal.Body>
          <Modal.Footer>
            <Button emphasis="low" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button emphasis="high" onClick={() => setOpen(false)}>
              Instalar
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </div>
  );
}
