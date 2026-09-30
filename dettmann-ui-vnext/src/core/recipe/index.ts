/**
 * Small internal variant/slot recipe engine.
 *
 * Public component APIs keep strongly typed variant props while the runtime
 * depends only on plain objects and strings. This replaces the external
 * styling recipe runtime used by the previous version of the library.
 */

export type RecipeValue = string | readonly string[] | undefined | null;
export type VariantValue = string | number | boolean | null | undefined;
type VariantMap = Record<string, Record<string, RecipeValue | Record<string, RecipeValue>>>;
type SlotMap = Record<string, RecipeValue>;

type StringToBoolean<T> = T extends "true" | "false" ? boolean : T;

type VariantInput<V extends VariantMap> = {
  [K in keyof V]?: StringToBoolean<keyof V[K]> | null;
} & { className?: string; class?: string };

type RecipeCondition<V extends VariantMap> = Partial<{
  [K in keyof V]: VariantValue | readonly VariantValue[];
}> & { class?: RecipeValue; className?: RecipeValue };

type RecipeConfig<V extends VariantMap> = {
  variants?: V;
  defaultVariants?: { [K in keyof V]?: StringToBoolean<keyof V[K]> | null };
  compoundVariants?: readonly RecipeCondition<V>[];
};

export type VariantProps<T> = T extends { __variantProps?: infer P } ? P : never;

function normalize(value: RecipeValue): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.join(" ");
}

function keyFor(value: VariantValue): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return String(value);
}

function resolveVariants(config: RecipeConfig<any>, props: Record<string, VariantValue>) {
  const variants = (config.variants ?? {}) as Record<string, Record<string, unknown>>;
  const defaults = config.defaultVariants ?? {};
  const active: Record<string, VariantValue> = {};
  for (const name of Object.keys(variants)) {
    active[name] = props[name] !== undefined ? props[name] : (defaults as Record<string, VariantValue>)[name];
  }

  const classes: string[] = [];
  const slotPatches: Record<string, string[]> = {};

  for (const [variantName, values] of Object.entries(variants)) {
    const activeValue = active[variantName];
    if (activeValue === undefined || activeValue === null) continue;
    const entry = values[keyFor(activeValue)];
    if (!entry) continue;
    if (typeof entry === "string" || Array.isArray(entry)) {
      classes.push(normalize(entry as RecipeValue));
      continue;
    }
    for (const [slot, value] of Object.entries(entry)) {
      (slotPatches[slot] ??= []).push(normalize(value as RecipeValue));
    }
  }

  for (const compound of config.compoundVariants ?? []) {
    const matches = Object.entries(compound).every(([key, expected]) => {
      if (key === "class" || key === "className") return true;
      const actual = active[key];
      if (Array.isArray(expected)) return expected.some((candidate) => keyFor(candidate) === keyFor(actual));
      return keyFor(expected as VariantValue) === keyFor(actual);
    });
    if (!matches) continue;
    const classValue = compound.class ?? compound.className;
    if (classValue) classes.push(normalize(classValue));
  }

  return { classes: classes.filter(Boolean).join(" "), slotPatches };
}

export function tv<V extends VariantMap = {}>(config: RecipeConfig<V> & { base?: RecipeValue; slots?: never }) {
  type Props = VariantInput<V>;
  const recipe = ((props: Props = {}) => {
    const resolved = resolveVariants(config as RecipeConfig<any>, props as Record<string, VariantValue>);
    return [normalize(config.base), resolved.classes, props.class, props.className].filter(Boolean).join(" ");
  }) as ((props?: Props) => string) & { __variantProps?: Props };
  return recipe;
}

export function tvSlots<V extends VariantMap = {}, S extends SlotMap = SlotMap>(config: RecipeConfig<V> & { slots: S; base?: never }) {
  type Props = VariantInput<V>;
  type Result = { [K in keyof S]: (extra?: string | { className?: string; class?: string }) => string } & { __variantProps?: Props };

  const result: Record<string, (extra?: string | { className?: string; class?: string }) => string> = {};
  for (const slot of Object.keys(config.slots)) {
    result[slot] = (extra) => {
      const props = (result as { __props?: Props }).__props ?? ({} as Props);
      const resolved = resolveVariants(config as RecipeConfig<any>, props as Record<string, VariantValue>);
      const extras = typeof extra === "string" ? extra : extra?.class ?? extra?.className;
      return [normalize(config.slots[slot]), ...(resolved.slotPatches[slot] ?? []), extras].filter(Boolean).join(" ");
    };
  }

  Object.defineProperty(result, "__variantProps", { value: undefined, enumerable: false });

  // Slot recipes need to remember props between the recipe invocation and the
  // slot accessor calls. The previous implementation exposed a callable object;
  // we preserve that shape with a non-enumerable property on the result.
  const callable = ((props: Props = {}) => {
    (result as { __props?: Props }).__props = props;
    return result as unknown as Result;
  }) as unknown as Result & ((props?: Props) => Result);

  return callable;
}

export function defineRecipe<V extends VariantMap = {}>(config: RecipeConfig<V> & { base?: RecipeValue; slots?: never }): ReturnType<typeof tv<V>>;
export function defineRecipe<V extends VariantMap = {}, S extends SlotMap = SlotMap>(config: RecipeConfig<V> & { slots: S; base?: never }): ReturnType<typeof tvSlots<V, S>>;
export function defineRecipe(config: any): any {
  return config.slots ? tvSlots(config) : tv(config);
}
