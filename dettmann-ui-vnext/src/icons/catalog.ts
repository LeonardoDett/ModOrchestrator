import type { AnimatedIconComponent } from "./types";
import { ChevronDownIcon } from "./glyphs/chevron-down";
import { ChevronUpIcon } from "./glyphs/chevron-up";
import { ChevronLeftIcon } from "./glyphs/chevron-left";
import { ChevronRightIcon } from "./glyphs/chevron-right";
import { ChevronFirstIcon } from "./glyphs/chevron-first";
import { ChevronLastIcon } from "./glyphs/chevron-last";
import { ArrowUpIcon } from "./glyphs/arrow-up";
import { ArrowDownIcon } from "./glyphs/arrow-down";
import { ArrowUpDownIcon } from "./glyphs/arrow-up-down";
import { XIcon } from "./glyphs/x";
import { PlusIcon } from "./glyphs/plus";
import { MinusIcon } from "./glyphs/minus";
import { CheckIcon } from "./glyphs/check";
import { CheckCheckIcon } from "./glyphs/check-check";
import { MoreHorizontalIcon } from "./glyphs/more-horizontal";
import { MenuIcon } from "./glyphs/menu";
import { SearchIcon } from "./glyphs/search";
import { FilterIcon } from "./glyphs/filter";
import { SettingsIcon } from "./glyphs/settings";
import { HomeIcon } from "./glyphs/home";
import { PanelLeftOpenIcon } from "./glyphs/panel-left-open";
import { PanelLeftCloseIcon } from "./glyphs/panel-left-close";

/** Todos os glifos animados da biblioteca (base das propriedades em `icon-catalog.test.tsx`). */
export const CATALOG: readonly AnimatedIconComponent[] = [
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  XIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  CheckCheckIcon,
  MoreHorizontalIcon,
  MenuIcon,
  SearchIcon,
  FilterIcon,
  SettingsIcon,
  HomeIcon,
  PanelLeftOpenIcon,
  PanelLeftCloseIcon,
];
