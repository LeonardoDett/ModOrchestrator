import { useState } from "react";
import {
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  Inline,
  Indicator,
  Input,
  Kbd,
  Radio,
  SegmentedControl,
  Stack,
  StatusToggle,
  Switch,
  Tag,
} from "../../src";
import { DownloadIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from "../../src/icons";

const CATEGORIES = [
  { value: "tex", label: "Texturas", description: "Retexturas e upscales" },
  { value: "ui", label: "Interface" },
  { value: "combat", label: "Combate" },
  { value: "quests", label: "Missões" },
  { value: "audio", label: "Áudio", disabled: true },
];

const VIEWS = [
  { value: "list", label: "Lista" },
  { value: "grid", label: "Grade" },
  { value: "tree", label: "Árvore" },
] as const;

const TOGGLE_LABELS = { on: "Ativo", off: "Inativo", unavailable: "Não instalado", busy: "Instalando" };

/** Controles e entradas da onda 1 do redesenho (D-033), com as variações novas (D-034). */
export function ControlsPanel() {
  const [view, setView] = useState<(typeof VIEWS)[number]["value"]>("list");
  const [category, setCategory] = useState("ui");
  const [categories, setCategories] = useState<string[]>(["tex", "combat", "quests"]);
  const [secret, setSecret] = useState("nexus-api-key-1234");
  const [name, setName] = useState("");
  const [count, setCount] = useState("4");
  const [enabled, setEnabled] = useState(true);

  return (
    <Stack gap="lg">
      <Inline gap="sm" wrap>
        <Button emphasis="high" startIcon={<DownloadIcon size="sm" />}>
          Implantar
        </Button>
        <Button startIcon={<PlusIcon size="sm" />}>Adicionar</Button>
        <Button emphasis="low">Cancelar</Button>
        <Button emphasis="low" intent="danger" startIcon={<TrashIcon size="sm" />}>
          Excluir
        </Button>
        <Button loading>Salvando</Button>
        <Button disabled>Indisponível</Button>
        <ButtonGroup>
          <Button size="sm">Dia</Button>
          <Button size="sm">Semana</Button>
          <Button size="sm">Mês</Button>
        </ButtonGroup>
      </Inline>

      <Inline gap="md" wrap>
        <SegmentedControl aria-label="Visualização" options={VIEWS} value={view} onChange={setView} size="sm" />
        <Checkbox label="Somente ativos" defaultChecked />
        <Checkbox label="Parcial" indeterminate />
        <Checkbox label="Bloqueado" disabled />
        <Switch label="Atualizar sozinho" checked={enabled} onCheckedChange={setEnabled} />
        <StatusToggle state={enabled ? "on" : "off"} label="SkyUI" stateLabels={TOGGLE_LABELS} onCheckedChange={setEnabled} />
        <StatusToggle state="unavailable" label="SKSE" stateLabels={TOGGLE_LABELS} />
        <StatusToggle state="busy" label="USSEP" stateLabels={TOGGLE_LABELS} />
      </Inline>

      <Radio.Group name="deploy-mode" aria-label="Modo de implantação" defaultValue="link" orientation="horizontal">
        <Radio.Item value="link" label="Hardlink" />
        <Radio.Item value="copy" label="Cópia" />
        <Radio.Item value="sym" label="Symlink" />
      </Radio.Group>

      <Inline gap="sm" wrap>
        <Badge>Neutro</Badge>
        <Badge emphasis="high">Novo</Badge>
        <Badge intent="success">Ativo</Badge>
        <Badge intent="warning">Conflito</Badge>
        <Badge emphasis="low" intent="danger">
          Quebrado
        </Badge>
        <Tag>Textura</Tag>
        <Tag intent="info" value="4k" onRemove={() => {}} removeLabel="Remover 4K">
          4K
        </Tag>
        <Tag emphasis="low" intent="warning">
          Órfão
        </Tag>
        <Indicator icon={TriangleAlertIcon} intent="warning" label="3 conflitos" count={3} />
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </Inline>

      <div className="grid grid-cols-2 gap-4">
        <Input.Root name="name" value={name} onChange={setName} fullWidth>
          <Input.Label>Nome do perfil</Input.Label>
          <Input.Box>
            <Input.Field placeholder="Ex.: Sobrevivência" />
          </Input.Box>
          <Input.HelperText>Aparece no seletor de perfis.</Input.HelperText>
        </Input.Root>
        <Input.Root name="name-error" value="perfil/1" onChange={() => {}} error="Não use barras no nome." fullWidth>
          <Input.Label>Com erro</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
          <Input.Error />
        </Input.Root>
        <Input.Root name="category" value={category} onChange={setCategory} fullWidth>
          <Input.Label>Categoria</Input.Label>
          <Input.Box>
            <Input.Select options={CATEGORIES} placeholder="Escolha…" />
          </Input.Box>
        </Input.Root>
        <Input.Root name="categories" value={categories} onChange={setCategories} fullWidth>
          <Input.Label>Categorias (múltipla)</Input.Label>
          <Input.Box>
            <Input.Select multiple options={CATEGORIES} placeholder="Escolha…" moreLabel={(n) => `mais ${n}`} />
          </Input.Box>
        </Input.Root>
        <Input.Root name="secret" value={secret} onChange={setSecret} fullWidth>
          <Input.Label>Chave da API</Input.Label>
          <Input.Box>
            <Input.Password autoComplete="off" revealLabel="Mostrar valor" hideLabel="Ocultar valor" />
          </Input.Box>
        </Input.Root>
        <Input.Root name="count" value={count} onChange={setCount} fullWidth>
          <Input.Label>Backups mantidos</Input.Label>
          <Input.Box>
            <Input.Number min={0} max={10} incrementLabel="Aumentar" decrementLabel="Diminuir" />
          </Input.Box>
        </Input.Root>
        <Input.Root name="disabled" value="Somente leitura" onChange={() => {}} disabled fullWidth>
          <Input.Label>Desabilitado</Input.Label>
          <Input.Box>
            <Input.Field />
          </Input.Box>
        </Input.Root>
      </div>
    </Stack>
  );
}
