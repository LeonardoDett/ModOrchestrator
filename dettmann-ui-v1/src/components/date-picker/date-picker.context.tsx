import { createStrictContext } from "../../utils/create-strict-context";

export interface DatePickerContextValue {
  /** Selected date */
  value: Date | null;
  /** Set selected date */
  onChange: (date: Date | null) => void;
  /** Currently viewed month */
  viewDate: Date;
  /** Set view date */
  setViewDate: (date: Date) => void;
  /** Whether picker is open */
  isOpen: boolean;
  /** Set open state */
  setIsOpen: (open: boolean) => void;
  /** Min selectable date */
  minDate?: Date;
  /** Max selectable date */
  maxDate?: Date;
  /** Disabled state */
  disabled: boolean;
  /** Date format for display */
  format: string;
  /** Locale */
  locale?: Locale;
}

import type { Locale } from "date-fns";

export const [DatePickerProvider, useDatePickerContext] =
  createStrictContext<DatePickerContextValue>("DatePicker");
