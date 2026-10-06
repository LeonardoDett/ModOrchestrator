import { DatePickerRoot } from "./date-picker.root";
import { DatePickerTrigger } from "./date-picker.trigger";
import { DatePickerPanel } from "./date-picker.panel";
import { DatePickerPopover, DatePickerInput } from "./date-picker";
import { DatePickerField } from "./date-picker.field";

/**
 * DatePicker is a compound component for selecting dates.
 *
 * @example
 * ```tsx
 * // Form miolo — value/onChange only on Input.Root (ISO `yyyy-MM-dd`)
 * <Input.Root name="birthdate" fullWidth value={date} onChange={setDate}>
 *   <Input.Label>Birth Date</Input.Label>
 *   <Input.Box padding="none">
 *     <DatePicker.Field placeholder="Select date..." />
 *   </Input.Box>
 * </Input.Root>
 *
 * // Custom trigger without the Input family
 * <DatePicker.Root value={date} onChange={setDate}>
 *   <DatePicker.Popover>
 *     <DatePicker.Trigger>
 *       <Button>{date ? format(date, "PP") : "Select date"}</Button>
 *     </DatePicker.Trigger>
 *   </DatePicker.Popover>
 * </DatePicker.Root>
 * ```
 */
export const DatePicker = {
  /** Root provider */
  Root: DatePickerRoot,
  /** Trigger wrapper (use with custom button) */
  Trigger: DatePickerTrigger,
  /** Calendar panel */
  Panel: DatePickerPanel,
  /** Floating wrapper that handles positioning */
  Popover: DatePickerPopover,
  /** Input-styled trigger for custom composition */
  Input: DatePickerInput,
  /** Form miolo: Root + Popover + Input for use inside Input.Root/Box */
  Field: DatePickerField,
};
