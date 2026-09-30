"use client";

import { Children, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { toneData, type Tone } from "../../theme/tone";

const avatarVariants = defineRecipe({
  slots: {
    wrapper: "relative inline-flex shrink-0",
    root: [
      "relative inline-flex h-full w-full items-center justify-center",
      "overflow-hidden rounded-full",
      "bg-muted",
    ].join(" "),
    image: "h-full w-full object-cover",
    fallback: [
      "flex h-full w-full items-center justify-center",
      "bg-muted text-fg-muted font-medium uppercase",
    ].join(" "),
    status: "absolute rounded-full ring-2 ring-page",
  },
  variants: {
    size: {
      xs: {
        wrapper: "h-6 w-6",
        fallback: "text-xs",
        status: "h-1.5 w-1.5 bottom-0 right-0",
      },
      sm: {
        wrapper: "h-8 w-8",
        fallback: "text-xs",
        status: "h-2 w-2 bottom-0 right-0",
      },
      md: {
        wrapper: "h-10 w-10",
        fallback: "text-sm",
        status: "h-2.5 w-2.5 bottom-0 right-0",
      },
      lg: {
        wrapper: "h-12 w-12",
        fallback: "text-base",
        status: "h-3 w-3 bottom-0.5 right-0.5",
      },
      xl: {
        wrapper: "h-16 w-16",
        fallback: "text-lg",
        status: "h-3.5 w-3.5 bottom-0.5 right-0.5",
      },
      "2xl": {
        wrapper: "h-20 w-20",
        fallback: "text-xl",
        status: "h-4 w-4 bottom-1 right-1",
      },
    },
    /** Border style */
    border: {
      none: {},
      ring: {
        root: "ring-2 ring-page ring-offset-2 ring-offset-page",
      },
    },
    status: {
      online: { status: "bg-success" },
      offline: { status: "bg-muted" },
      busy: { status: "bg-danger" },
    },
  },
  defaultVariants: {
    size: "md",
    border: "none",
  },
});

type AvatarVariants = VariantProps<typeof avatarVariants>;

interface AvatarProps extends ComponentPropsWithoutRef<"span">, AvatarVariants {
  /** Image source URL */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Fallback text (usually initials) */
  fallback?: string;
  /** Loading behavior for the image */
  loading?: "eager" | "lazy";
  /** Presence indicator */
  status?: "online" | "offline" | "busy";
  tone?: Tone;
}

/**
 * Avatar component for displaying user profile images.
 *
 * @example
 * ```tsx
 * // With image
 * <Avatar src="/avatar.jpg" alt="John Doe" fallback="JD" />
 *
 * // Fallback only
 * <Avatar fallback="AB" />
 *
 * // Different sizes
 * <Avatar src="/avatar.jpg" size="lg" />
 * <Avatar src="/avatar.jpg" size="xs" />
 *
 * // With border
 * <Avatar src="/avatar.jpg" border="ring" />
 * ```
 */
function AvatarRoot({
  className,
  src,
  alt,
  fallback,
  loading = "lazy",
  size,
  border,
  status,
  tone,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const {
    wrapper,
    root,
    image,
    fallback: fallbackClass,
    status: statusClass,
  } = avatarVariants({ size, border, status });

  const showImage = Boolean(src) && !imageError;

  // Generate initials from alt text if no fallback provided
  const initials =
    fallback ??
    alt
      ?.split(" ")
      .map((word) => word[0])
      .slice(0, 2)
      .join("") ??
    "?";

  return (
    <span className={cn(wrapper(), className)} {...props}>
      <span className={root()}>
        {showImage && (
          <img
            src={src}
            alt={alt ?? ""}
            loading={loading}
            onError={() => setImageError(true)}
            className={image()}
          />
        )}
        {!showImage && (
          <span
            className={cn(fallbackClass(), tone && "bg-tone-subtle text-tone-text")}
            {...toneData(tone)}
          >
            {initials}
          </span>
        )}
      </span>
      {status ? (
        <span data-status={status} className={statusClass()} aria-hidden="true" />
      ) : null}
    </span>
  );
}

interface AvatarGroupProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Visible avatars before overflow */
  max?: number;
  size?: AvatarVariants["size"];
}

function AvatarGroup({ children, max = 4, size = "sm", className, ...props }: AvatarGroupProps) {
  const items = Children.toArray(children);
  const visible = items.slice(0, max);
  const extra = items.length - max;

  return (
    <div className={cn("isolate flex items-center py-0.5", className)} {...props}>
      {visible.map((child, index) => (
        <span
          key={index}
          className={cn("relative rounded-full shadow-xs", index > 0 && "-ml-2")}
          style={{ zIndex: index + 1 }}
        >
          {child}
        </span>
      ))}
      {extra > 0 ? (
        <Avatar
          fallback={`+${extra}`}
          size={size}
          className="relative -ml-2 rounded-full shadow-xs"
          style={{ zIndex: visible.length + 1 }}
        />
      ) : null}
    </div>
  );
}

/**
 * Avatar displays a user image or initials. `Avatar.Group` stacks children with overflow.
 */
export const Avatar = Object.assign(AvatarRoot, { Group: AvatarGroup });
