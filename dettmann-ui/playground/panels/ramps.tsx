import { CATEGORY_COLORS, COLOR_INTENTS, Stack, Typography, type Mode, type ResolvedTheme, type RoleName } from "../../src";

const INTENT_LABELS: Record<string, string> = {
  brand: "Marca",
  accent: "Accent",
  info: "Informação",
  success: "Sucesso",
  warning: "Aviso",
  danger: "Perigo",
};

const GROUPS: { title: string; roles: RoleName[] }[] = [
  { title: "Superfícies (60%)", roles: ["canvas", "surface", "raised", "sunken"] },
  { title: "Texto", roles: ["fg", "fg-muted", "fg-subtle", "fg-disabled"] },
  { title: "Bordas", roles: ["border-subtle", "border", "border-strong"] },
  {
    title: "Estrutura (30%)",
    roles: ["structure", "structure-fg", "structure-border", "selected", "track", "fill-neutral", "fill-neutral-hover"],
  },
  {
    title: "Ênfase (10%)",
    roles: [
      "emphasis-fill",
      "emphasis-fill-hover",
      "emphasis-fill-pressed",
      "on-emphasis",
      "emphasis-subtle",
      "emphasis-text",
      "emphasis-border",
      "focus",
    ],
  },
  ...COLOR_INTENTS.map((x) => ({
    title: INTENT_LABELS[x] ?? x,
    roles: [`${x}-fill`, `${x}-fill-hover`, `${x}-fill-pressed`, `on-${x}`, `${x}-subtle`, `${x}-text`, `${x}-border`] as RoleName[],
  })),
  { title: "Paleta categórica: pontos", roles: CATEGORY_COLORS.map((c) => `category-${c}-dot` as RoleName) },
  { title: "Paleta categórica: fundo sutil", roles: CATEGORY_COLORS.map((c) => `category-${c}-subtle` as RoleName) },
  { title: "Paleta categórica: texto", roles: CATEGORY_COLORS.map((c) => `category-${c}-text` as RoleName) },
];

/** Amostra de cada papel do modo, pintada pela variável do escopo e rotulada com o hex gerado. */
export function Ramps({ theme, mode }: { theme: ResolvedTheme; mode: Mode }) {
  const values = theme[mode];
  return (
    <Stack gap="md">
      {GROUPS.map((group) => (
        <Stack key={group.title} gap="xs">
          <Typography variant="caption" className="font-semibold text-fg-muted">
            {group.title}
          </Typography>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {group.roles.map((role) => (
              <div key={role} className="flex min-w-0 flex-col gap-1">
                <div
                  className="h-9 rounded-control border border-border-subtle"
                  style={{ background: `var(--ui-${role})` }}
                  title={role}
                />
                <span className="truncate text-caption text-fg" title={role}>
                  {role}
                </span>
                <span className="font-mono text-caption text-fg-subtle">{values[role]}</span>
              </div>
            ))}
          </div>
        </Stack>
      ))}
    </Stack>
  );
}
