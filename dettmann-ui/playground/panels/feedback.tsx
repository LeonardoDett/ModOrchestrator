import { useState } from "react";
import {
  Alert,
  Button,
  Command,
  ContextMenu,
  Drawer,
  Inline,
  Loader,
  Menu,
  Modal,
  Popover,
  Progress,
  Skeleton,
  Stack,
  Stepper,
  Typography,
  useToast,
} from "../../src";
import { FolderIcon, PackageIcon, SettingsIcon } from "../../src/icons";

const COMMANDS = [
  { id: "deploy", label: "Implantar perfil", description: "Aplica a ordem atual no jogo", value: "deploy", icon: <PackageIcon size="sm" /> },
  { id: "open", label: "Abrir pasta do jogo", value: "open", icon: <FolderIcon size="sm" /> },
  { id: "purge", label: "Remover implantação", value: "purge", disabled: true },
  { id: "settings", label: "Configurações", value: "settings", icon: <SettingsIcon size="sm" /> },
];

const CONTEXT_ITEMS = [
  { id: "open", label: "Abrir", shortcut: "Enter" },
  { id: "rename", label: "Renomear", shortcut: "F2", disabled: true },
  { id: "remove", label: "Remover", shortcut: "Del", destructive: true },
];

/** Feedback e overlays da onda 2 do redesenho (D-035). */
export function FeedbackPanel() {
  const { addToast } = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [progress, setProgress] = useState(40);
  const [step, setStep] = useState(1);

  return (
    <Stack gap="lg">
      <div className="grid grid-cols-2 gap-3">
        <Alert.Root intent="info">
          <Alert.Title>Atualização disponível</Alert.Title>
          <Alert.Description>A versão 1.2 corrige a ordem de plugins.</Alert.Description>
        </Alert.Root>
        <Alert.Root intent="success">
          <Alert.Title>Implantação concluída</Alert.Title>
          <Alert.Description>248 arquivos ligados em 3 s.</Alert.Description>
        </Alert.Root>
        <Alert.Root intent="warning">
          <Alert.Title>3 conflitos sem regra</Alert.Title>
          <Alert.Description>Revise a ordem antes de implantar.</Alert.Description>
        </Alert.Root>
        <Alert.Root intent="danger">
          <Alert.Title>Operação interrompida</Alert.Title>
          <Alert.Description>O jogo estava aberto durante a implantação.</Alert.Description>
        </Alert.Root>
      </div>

      <Inline gap="sm" wrap>
        <Button onClick={() => setModal(true)}>Abrir modal</Button>
        <Button onClick={() => setDrawer(true)}>Abrir drawer</Button>
        <Button
          onClick={() =>
            addToast({
              title: "Mod habilitado",
              description: "SkyUI entra na próxima implantação.",
              variant: "success",
              action: { label: "Implantar agora", onClick: () => {} },
            })
          }
        >
          Mostrar toast
        </Button>
        <Menu.Root>
          <Menu.Trigger>
            <Button>Menu</Button>
          </Menu.Trigger>
          <Menu.Content>
            <Menu.Item>Reinstalar</Menu.Item>
            <Menu.Item>Abrir no Nexus</Menu.Item>
            <Menu.Item disabled>Mesclar variantes</Menu.Item>
            <Menu.Item>Remover</Menu.Item>
          </Menu.Content>
        </Menu.Root>
        <Popover.Root>
          <Popover.Trigger>
            <Button>Popover</Button>
          </Popover.Trigger>
          <Popover.Content className="max-w-64 p-3">
            <Typography variant="body-sm" color="muted-fg">
              Hardlinks exigem que mods e jogo estejam no mesmo volume.
            </Typography>
          </Popover.Content>
        </Popover.Root>
        <ContextMenu items={CONTEXT_ITEMS}>
          <div className="rounded-control border border-dashed border-border-strong px-3 py-1.5 text-sm text-fg-muted">
            Clique com o botão direito
          </div>
        </ContextMenu>
      </Inline>

      <div className="grid grid-cols-2 gap-4">
        <Stack gap="sm">
          <Progress.Root value={progress} aria-label="Implantação" />
          <Inline gap="sm">
            <Button size="sm" onClick={() => setProgress((p) => (p >= 100 ? 0 : p + 20))}>
              Avançar
            </Button>
            <Loader size="sm" label="Carregando" />
            <Loader size="sm" variant="dots" label="Carregando" />
          </Inline>
          <Stack gap="xs">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </Stack>
          <Stepper.Root value={step} onValueChange={setStep} interactive>
            <Stepper.Step index={0}>
              <Stepper.StepIndicator />
              <Stepper.StepLabel>Opções</Stepper.StepLabel>
            </Stepper.Step>
            <Stepper.Step index={1}>
              <Stepper.StepIndicator />
              <Stepper.StepLabel>Arquivos</Stepper.StepLabel>
            </Stepper.Step>
            <Stepper.Step index={2}>
              <Stepper.StepIndicator />
              <Stepper.StepLabel>Revisão</Stepper.StepLabel>
            </Stepper.Step>
          </Stepper.Root>
        </Stack>
        <Command items={COMMANDS} placeholder="Digite um comando" emptyMessage="Nenhum comando" />
      </div>

      <Modal.Root open={modal} onOpenChange={setModal}>
        <Modal.Content size="sm">
          <Modal.Header>
            <Modal.Title>Remover o mod?</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>Os arquivos do mod saem da próxima implantação. O archive continua em Downloads.</Modal.Body>
          <Modal.Footer>
            <Button emphasis="low" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button emphasis="high" intent="danger" onClick={() => setModal(false)}>
              Remover
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      <Drawer.Root open={drawer} onOpenChange={setDrawer}>
        <Drawer.Content side="right">
          <Drawer.Header>
            <Drawer.Title>Detalhes do mod</Drawer.Title>
            <Drawer.CloseButton />
          </Drawer.Header>
          <Drawer.Body>Versão 5.2 · 248 arquivos · instalado em 03/10.</Drawer.Body>
          <Drawer.Footer>
            <Button onClick={() => setDrawer(false)}>Fechar</Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer.Root>
    </Stack>
  );
}
