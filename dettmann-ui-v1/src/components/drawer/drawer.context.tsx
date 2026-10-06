"use client";

import { createStrictContext } from "../../utils/create-strict-context";

export type DrawerSide = "left" | "right" | "top" | "bottom";

export interface DrawerContextValue {
  /** Whether the drawer is open */
  open: boolean;
  /** Change open state (`false` closes) */
  onOpenChange: (open: boolean) => void;
  /** Unique ID for the drawer */
  drawerId: string;
  /** ID for the title (aria-labelledby) */
  titleId: string;
  /** ID for the description (aria-describedby) */
  descriptionId: string;
  /** Whether clicking the backdrop closes the drawer */
  closeOnBackdropClick: boolean;
  /** Whether pressing Escape closes the drawer */
  closeOnEscape: boolean;
}

export const [DrawerProvider, useDrawerContext] =
  createStrictContext<DrawerContextValue>("Drawer");
