import { InputRoot } from "./input.root";
import { InputLabel } from "./input.label";
import { InputBox } from "./input.box";
import { InputField } from "./input.field";
import { InputTextarea } from "./input.textarea";
import { InputSelect, type SelectOption } from "./input.select";
import { InputCombobox, type ComboboxOption } from "./input.combobox";
import { InputMultiSelect } from "./input.multi-select";
import { InputPin } from "./input.pin";
import { InputHelperText } from "./input.helper-text";
import { InputError } from "./input.error";

/**
 * Input is a compound component for building form inputs.
 *
 * @example
 * ```tsx
 * // Text input — value/onChange only on Root (plain string, never a DOM event)
 * <Input.Root name="email" fullWidth value={email} onChange={setEmail}>
 *   <Input.Label>Email</Input.Label>
 *   <Input.Box>
 *     <Input.Field type="email" placeholder="Enter email" />
 *   </Input.Box>
 *   <Input.HelperText>We'll never share your email.</Input.HelperText>
 *   <Input.Error />
 * </Input.Root>
 *
 * // Select — same Root contract; do not pass value/onChange on the miolo
 * <Input.Root name="country" fullWidth value={country} onChange={setCountry}>
 *   <Input.Label floating>Country</Input.Label>
 *   <Input.Box>
 *     <Input.Select options={countryOptions} />
 *   </Input.Box>
 *   <Input.Error />
 * </Input.Root>
 * ```
 */
export const Input = {
  /** Root container that provides context */
  Root: InputRoot,
  /** Label for the input */
  Label: InputLabel,
  /** Visual container with border and focus states */
  Box: InputBox,
  /** Text input field */
  Field: InputField,
  /** Textarea miolo (same family context as Field) */
  Textarea: InputTextarea,
  /** Native select dropdown */
  Select: InputSelect,
  /** Searchable combobox dropdown */
  Combobox: InputCombobox,
  /** Multi-value searchable select (Root value is string[]) */
  MultiSelect: InputMultiSelect,
  /** OTP / verification code slots */
  Pin: InputPin,
  /** Helper text below the input */
  HelperText: InputHelperText,
  /** Error message display */
  Error: InputError,
};

export type { SelectOption, ComboboxOption };
