import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "../../utils/cn";

export interface MediaImageProps extends Omit<ComponentPropsWithoutRef<"img">, "onError"> {
  fallback?: ReactNode;
  aspect?: "auto" | "square" | "video" | "portrait" | "wide";
  fit?: "cover" | "contain" | "fill";
  radius?: "none" | "sm" | "md" | "lg";
  onLoadError?: (error: unknown) => void;
}

const aspectClasses = {
  auto: "",
  square: "aspect-square",
  video: "aspect-video",
  portrait: "aspect-[3/4]",
  wide: "aspect-[16/7]",
} as const;

const fitClasses = {
  cover: "object-cover",
  contain: "object-contain",
  fill: "object-fill",
} as const;

const radiusClasses = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
} as const;

/** Image primitive with deterministic Tailwind classes and an explicit failure state. */
export const MediaImage = forwardRef<HTMLImageElement, MediaImageProps>(function MediaImage(
  {
    aspect = "auto",
    fit = "cover",
    radius = "md",
    fallback,
    className,
    onLoadError,
    alt = "",
    ...props
  },
  ref,
) {
  const [failed, setFailed] = useState(false);
  const sharedClassName = cn(aspectClasses[aspect], radiusClasses[radius], className);

  if (failed) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={cn(
          "flex items-center justify-center bg-sunken text-fg-muted",
          sharedClassName,
        )}
      >
        {fallback ?? <ImageOff aria-hidden="true" className="h-6 w-6" />}
      </div>
    );
  }

  return (
    <img
      ref={ref}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onLoadError?.(event);
      }}
      className={cn("block max-w-full", fitClasses[fit], sharedClassName)}
      {...props}
    />
  );
});
