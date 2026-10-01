"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Upload } from "lucide-react";
import { defineRecipe } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { Typography } from "../../primitives/typography";
import { FeaturedIcon } from "../../components/featured-icon";
import { Button } from "../../components/button";
import { Alert } from "../../components/alert";
import { List } from "../../components/list";

const dropzoneVariants = defineRecipe({
  base: [
    "rounded-xl border border-dashed border-border bg-surface",
    "transition-colors duration-fast ease-default",
  ].join(" "),
  variants: {
    dragging: {
      true: "border-secondary bg-secondary-subtle",
      false: "",
    },
    disabled: {
      true: "pointer-events-none text-fg-subtle",
      false: "",
    },
    size: {
      default: "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
      compact: "flex flex-row items-center gap-4 px-4 py-3 text-left",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    const lower = token.toLowerCase();
    if (lower.endsWith("/*")) {
      const prefix = lower.slice(0, -1);
      return file.type.toLowerCase().startsWith(prefix);
    }
    if (lower.startsWith(".")) {
      return name.endsWith(lower);
    }
    return file.type.toLowerCase() === lower;
  });
}

interface FileDropzoneProps extends Omit<ComponentPropsWithoutRef<"div">, "onChange"> {
  /** Called with accepted files only, after validation (never a DOM event) */
  onFilesChange?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  maxFiles?: number;
  /** Maximum size per file in bytes */
  maxSize?: number;
  title?: string;
  hint?: string;
  browseLabel?: string;
  /** `compact` is a horizontal row (avatar/logo pickers) */
  size?: "default" | "compact";
  /**
   * Replaces the hidden file input: the host opens its own picker (e.g. a
   * desktop shell dialog that returns absolute paths).
   */
  onBrowse?: () => void;
  /** Extra actions rendered next to the browse button. */
  actions?: ReactNode;
  /**
   * Whether the zone lists accepted files and rejections itself (default
   * true). Hosts that receive drops elsewhere (native shells) turn it off.
   */
  showSelection?: boolean;
  /** Controlled highlight, for drags the host detects itself. */
  dragging?: boolean;
}

/**
 * FileDropzone picks files via drop or dialog. Validates accept/maxSize/maxFiles before onFilesChange.
 */
export function FileDropzone({
  onFilesChange,
  accept,
  multiple = false,
  disabled = false,
  maxFiles,
  maxSize,
  hint = "SVG, PNG, JPG or GIF",
  title = "Drop files here",
  browseLabel = "Browse files",
  size = "default",
  onBrowse,
  actions,
  showSelection = true,
  dragging: draggingProp,
  className,
  ...props
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const emit = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const nextErrors: string[] = [];
    const accepted: File[] = [];

    for (const file of incoming) {
      if (!fileMatchesAccept(file, accept)) {
        nextErrors.push(`${file.name} is not an accepted type.`);
        continue;
      }
      if (maxSize != null && file.size > maxSize) {
        nextErrors.push(`${file.name} is larger than the maximum size.`);
        continue;
      }
      accepted.push(file);
    }

    let next = multiple ? accepted : accepted.slice(0, 1);
    const limit = maxFiles ?? (multiple ? undefined : 1);
    if (limit != null && next.length > limit) {
      nextErrors.push(`You can add at most ${limit} file${limit === 1 ? "" : "s"}.`);
      next = next.slice(0, limit);
    }

    setErrors(nextErrors);
    if (next.length === 0) return;
    setFiles(next);
    onFilesChange?.(next);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    emit(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    emit(event.target.files);
    event.target.value = "";
  };

  const previewItems = files.map((file, index) => ({
    id: `${file.name}-${file.size}-${index}`,
    name: file.name,
    size: file.size,
  }));

  return (
    <div className={cn("flex flex-col gap-3", className)} {...props}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={dropzoneVariants({ dragging: dragging || Boolean(draggingProp), disabled, size })}
      >
        <FeaturedIcon icon={Upload} color="neutral" size={size === "compact" ? "md" : "lg"} />
        <div className="space-y-1">
          <Typography variant="body-sm" className="text-fg font-medium">
            {title}
          </Typography>
          <Typography variant="caption" color="muted-fg">
            {hint}
          </Typography>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => (onBrowse ? onBrowse() : inputRef.current?.click())}
        >
          {browseLabel}
        </Button>
        {actions}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleChange}
        />
      </div>

      {showSelection && errors.length > 0 ? (
        <Alert.Root variant="danger">
          <Alert.Title>Some files were rejected</Alert.Title>
          <Alert.Description>{errors.join(" ")}</Alert.Description>
        </Alert.Root>
      ) : null}

      {showSelection && previewItems.length > 0 ? (
        <List.Root
          items={previewItems}
          selectionMode="none"
          getItemKey={(item) => item.id}
          renderItem={(item) => (
            <List.Item>
              <span className="truncate">{item.name}</span>
            </List.Item>
          )}
        />
      ) : null}
    </div>
  );
}
