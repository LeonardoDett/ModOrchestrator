/**
 * Native props owned exclusively by `Input.Root`.
 * Miolo components omit these so passing them on Field/Select/Combobox/Textarea
 * is a TypeScript error instead of a silent no-op.
 */
export type InputRootOwnedNativeProps =
  | "id"
  | "name"
  | "value"
  | "defaultValue"
  | "onChange"
  | "disabled";
