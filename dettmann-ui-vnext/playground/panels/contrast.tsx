import { useMemo } from "react";
import { Badge, Inline, Stack, Table, Typography, type Mode, type ResolvedTheme } from "../../src";
import { contrastReport, type ContrastKind } from "../../src/theme/engine";

const KIND_LABELS: Record<ContrastKind, string> = {
  text: "texto",
  "text-secondary": "texto secundário",
  "text-meta": "metadado",
  "on-fill": "sobre preenchimento",
  "intent-text": "texto de intent",
  "control-border": "borda de controle",
  focus: "foco",
};

/** Pares de contraste medidos no modo; reprovações primeiro. */
export function useContrast(theme: ResolvedTheme, mode: Mode) {
  return useMemo(() => {
    const rows = contrastReport(theme[mode], theme.config.contrast);
    rows.sort((a, b) => Number(a.pass) - Number(b.pass));
    return { rows, passed: rows.filter((r) => r.pass).length };
  }, [theme, mode]);
}

export function ContrastPanel({ theme, mode }: { theme: ResolvedTheme; mode: Mode }) {
  const { rows, passed } = useContrast(theme, mode);
  return (
    <Stack gap="sm">
      <Inline gap="sm">
        <Typography variant="body-sm" color="muted-fg">
          {passed} de {rows.length} pares atingem a meta ({theme.config.contrast === "high" ? "contraste alto" : "contraste padrão"}).
        </Typography>
      </Inline>
      <div className="max-h-96 overflow-auto rounded-card">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Amostra</Table.Head>
              <Table.Head>Texto / fundo</Table.Head>
              <Table.Head>Razão</Table.Head>
              <Table.Head>Meta</Table.Head>
              <Table.Head>APCA</Table.Head>
              <Table.Head>
                <span className="sr-only">Resultado</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={`${r.fg}/${r.bg}`} data-testid={r.pass ? "contrast-pass" : "contrast-fail"}>
                <Table.Cell>
                  <span
                    className="inline-flex h-7 w-10 items-center justify-center rounded-chip border border-border-subtle text-sm font-semibold"
                    style={{ color: `var(--ui-${r.fg})`, background: `var(--ui-${r.bg})` }}
                  >
                    Aa
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span className="font-mono text-caption text-fg">
                      {r.fg} / {r.bg}
                    </span>
                    <span className="text-caption text-fg-subtle">{KIND_LABELS[r.kind]}</span>
                  </div>
                </Table.Cell>
                <Table.Cell className="font-mono tabular-nums">{r.ratio.toFixed(2)}:1</Table.Cell>
                <Table.Cell className="font-mono tabular-nums text-fg-muted">≥ {r.target}</Table.Cell>
                <Table.Cell className="font-mono tabular-nums text-fg-muted">
                  {r.apca !== undefined ? `Lc ${r.apca.toFixed(0)} / ${r.apcaTarget}` : "–"}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="sm" emphasis="medium" intent={r.pass ? "success" : "danger"} aria-label={r.pass ? "Passa" : "Reprova"}>
                    {r.pass ? "✓" : "✗"}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Stack>
  );
}
