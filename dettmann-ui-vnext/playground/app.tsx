import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Badge,
  BudgetInspector,
  Button,
  Card,
  DEFAULT_PRESET,
  Inline,
  PRESETS,
  Stack,
  ThemeProvider,
  ThemeScope,
  Typography,
  createTheme,
  type Mode,
  type PresetId,
  type ResolvedTheme,
  type ThemeConfig,
} from "../src";
import { ThemeEditor } from "./panels/theme-editor";
import { Ramps } from "./panels/ramps";
import { ContrastPanel, useContrast } from "./panels/contrast";
import { SampleScreen } from "./panels/sample-screen";
import { MotionDemo } from "./panels/motion-demo";
import { ExportPanel } from "./panels/export";

/** Id fixo do tema editado: injetado em runtime, nunca colide com um preset. */
const PLAYGROUND_ID = "playground";
/** Tema da moldura do playground (editor e cabeçalho), estável enquanto se edita. */
const CHROME_THEME = "graphite";

const fromPreset = (id: PresetId): ThemeConfig => ({ ...(JSON.parse(JSON.stringify(PRESETS[id])) as ThemeConfig), id: PLAYGROUND_ID });

const MODE_TITLES: Record<Mode, string> = { light: "Claro", dark: "Escuro" };

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card.Root>
      <Card.Header>
        <Typography variant="heading-6" color="fg">
          {title}
        </Typography>
      </Card.Header>
      <Card.Body>{children}</Card.Body>
    </Card.Root>
  );
}

function ModeColumn({ config, theme, mode }: { config: ThemeConfig; theme: ResolvedTheme; mode: Mode }) {
  const { rows, passed } = useContrast(theme, mode);
  const failed = rows.length - passed;
  return (
    <section data-testid="mode-column" aria-label={`Modo ${MODE_TITLES[mode].toLowerCase()}`} className="min-w-0">
      <ThemeScope theme={config} mode={mode} className="flex flex-col gap-4 rounded-panel bg-canvas p-4 text-fg">
        <Inline justify="between">
          <Typography variant="heading-5" color="fg">
            {MODE_TITLES[mode]}
          </Typography>
          <Badge intent={failed === 0 ? "success" : "danger"}>
            {failed === 0 ? `Contraste ${passed}/${rows.length}` : `${failed} pares reprovados`}
          </Badge>
        </Inline>
        <SampleScreen />
        <Panel title="Rampas">
          <Ramps theme={theme} mode={mode} />
        </Panel>
        <Panel title="Contraste">
          <ContrastPanel theme={theme} mode={mode} />
        </Panel>
      </ThemeScope>
    </section>
  );
}

/** Playground de tema: edição ao vivo, claro e escuro lado a lado, contraste, movimento e orçamento. */
export default function App() {
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET);
  const [draft, setDraft] = useState<ThemeConfig>(() => fromPreset(DEFAULT_PRESET));
  const [config, setConfig] = useState<ThemeConfig>(draft);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);

  // Só configs válidas chegam ao `ThemeScope` (em dev ele lança); o rascunho fica no editor.
  const update = (next: ThemeConfig) => {
    setDraft(next);
    try {
      createTheme(next);
      setConfig(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const loadPreset = (id: PresetId) => {
    setPresetId(id);
    update(fromPreset(id));
  };

  const theme = useMemo(() => createTheme(config), [config]);

  return (
    <ThemeProvider theme={CHROME_THEME} defaultMode="light">
      <ThemeScope theme={CHROME_THEME} mode="light" className="min-h-screen bg-canvas font-sans text-fg">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3">
          <Stack gap="none">
            <Typography variant="heading-6" color="fg">
              Playground dettmann-ui
            </Typography>
            <Typography variant="caption" color="muted-fg">
              Edite o tema e compare claro e escuro ao vivo.
            </Typography>
          </Stack>
          <Button size="sm" emphasis="low" aria-expanded={editorOpen} onClick={() => setEditorOpen((v) => !v)}>
            {editorOpen ? "Ocultar editor" : "Mostrar editor"}
          </Button>
        </header>
        <div className="flex items-start">
          {editorOpen && (
            <aside
              aria-label="Editor de tema"
              className="sticky top-[3.75rem] flex h-[calc(100vh-3.75rem)] w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4"
            >
              {error && (
                <Alert.Root variant="danger" role="alert">
                  <Alert.Title>Config inválida</Alert.Title>
                  <Alert.Description className="break-words font-mono text-caption">{error}</Alert.Description>
                </Alert.Root>
              )}
              {theme.warnings.length > 0 && (
                <Alert.Root variant="warning" role="status">
                  <Alert.Title>Avisos do motor</Alert.Title>
                  {theme.warnings.map((w) => (
                    <Alert.Description key={w} className="font-mono text-caption">
                      {w}
                    </Alert.Description>
                  ))}
                </Alert.Root>
              )}
              <ThemeEditor draft={draft} presetId={presetId} onPresetChange={loadPreset} onChange={update} />
              <ExportPanel config={config} />
            </aside>
          )}
          <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              {(["light", "dark"] as const).map((mode) => (
                <ModeColumn key={mode} config={config} theme={theme} mode={mode} />
              ))}
            </div>
            <ThemeScope theme={config} mode="light" className="rounded-panel bg-canvas p-4 text-fg">
              <Panel title="Movimento">
                <MotionDemo />
              </Panel>
            </ThemeScope>
          </main>
        </div>
        <BudgetInspector />
      </ThemeScope>
    </ThemeProvider>
  );
}
