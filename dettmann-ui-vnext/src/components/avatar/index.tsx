"use client";

import { Children, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { defineRecipe, type VariantProps } from "../../core/recipe";
import { cn } from "../../utils/cn";
import { intentData } from "../../theme/emphasis";
import type { CategoryColor, Intent } from "../../theme/engine";

const avatarVariants = defineRecipe({
  slots: {
    wrapper: "relative inline-flex shrink-0",
    root: "relative inline-flex h-full w-full items-center justify-center overflow-hidden bg-sunken",
    image: "h-full w-full object-cover",
    fallback: "flex h-full w-full items-center justify-center font-semibold uppercase leading-none",
    status: "absolute rounded-pill ring-2 ring-canvas",
  },
  variants: {
    size: {
      "2xs": { wrapper: "h-5 w-5", fallback: "text-[0.5625rem]", status: "h-1.5 w-1.5 bottom-0 right-0" },
      xs: { wrapper: "h-6 w-6", fallback: "text-[0.625rem]", status: "h-1.5 w-1.5 bottom-0 right-0" },
      sm: { wrapper: "h-8 w-8", fallback: "text-xs", status: "h-2 w-2 bottom-0 right-0" },
      md: { wrapper: "h-10 w-10", fallback: "text-sm", status: "h-2.5 w-2.5 bottom-0 right-0" },
      lg: { wrapper: "h-12 w-12", fallback: "text-base", status: "h-3 w-3 bottom-0.5 right-0.5" },
      xl: { wrapper: "h-16 w-16", fallback: "text-lg", status: "h-3.5 w-3.5 bottom-0.5 right-0.5" },
      "2xl": { wrapper: "h-20 w-20", fallback: "text-xl", status: "h-4 w-4 bottom-1 right-1" },
      "3xl": { wrapper: "h-24 w-24", fallback: "text-3xl tracking-tight", status: "h-4 w-4 bottom-1 right-1" },
    },
    /** `circle`: pessoa. `square`: monograma de uma coisa (jogo, projeto, origem). */
    shape: {
      circle: { root: "rounded-pill" },
      square: { root: "rounded-control" },
    },
    /** Border style */
    border: {
      none: {},
      ring: { root: "ring-2 ring-canvas ring-offset-2 ring-offset-canvas" },
    },
    status: {
      online: { status: "bg-success-fill" },
      offline: { status: "bg-sunken" },
      busy: { status: "bg-danger-fill" },
    },
    /** Pintura das iniciais: `low` fundo sutil e texto da cor; `high` fundo sólido. */
    paint: {
      plain: { fallback: "bg-sunken text-fg-muted" },
      low: { fallback: "bg-intent-subtle text-intent-text" },
      high: { fallback: "bg-intent-fill text-on-intent" },
    },
  },
  defaultVariants: {
    size: "md",
    shape: "circle",
    border: "none",
    paint: "plain",
  },
});

type AvatarVariants = VariantProps<typeof avatarVariants>;

interface AvatarProps extends ComponentPropsWithoutRef<"span">, Omit<AvatarVariants, "paint"> {
  /** Image source URL */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Fallback text (usually initials, up to three letters) */
  fallback?: string;
  /** Loading behavior for the image */
  loading?: "eager" | "lazy";
  /** Presence indicator */
  status?: "online" | "offline" | "busy";
  /** Cor das iniciais por intent (dentro de um `ThemeScope`, `brand` é a cor do escopo). */
  intent?: Intent;
  /** Cor das iniciais pela paleta categórica; exclusiva com `intent`. */
  color?: CategoryColor;
  /** `low` (padrão com cor): fundo sutil. `high`: fundo sólido. */
  emphasis?: "low" | "high";
  /** Nome acessível. Com ele o avatar vira uma imagem nomeada e as iniciais ficam ocultas para leitores de tela. */
  label?: string;
}

/**
 * Avatar shows an image or initials: round for people, square for things (a game's
 * monogram). Color comes from an intent or the category palette, never a raw value.
 *
 * @example
 * ```tsx
 * <Avatar src="/avatar.jpg" alt="John Doe" fallback="JD" />
 * <Avatar shape="square" fallback="SSE" intent="brand" emphasis="high" label="Skyrim Special Edition" />
 * <Avatar shape="square" size="3xl" fallback="SSE" intent="brand" label="Skyrim Special Edition" />
 * <Avatar shape="square" size="sm" fallback="VX" color="blue" label="Vortex" />
 * ```
 */
function AvatarRoot({
  className,
  src,
  alt,
  fallback,
  loading = "lazy",
  size,
  shape,
  border,
  status,
  intent,
  color,
  emphasis,
  label,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const colored = intent !== undefined || color !== undefined;
  const paint = colored ? (emphasis ?? "low") : "plain";

  const { wrapper, root, image, fallback: fallbackClass, status: statusClass } = avatarVariants({
    size,
    shape,
    border,
    status,
    paint,
  });

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

  const named = label !== undefined;

  return (
    <span
      className={cn(wrapper(), className)}
      {...(named ? { role: "img", "aria-label": label } : {})}
      {...props}
    >
      <span className={root()}>
        {showImage && (
          <img
            src={src}
            alt={named ? "" : (alt ?? "")}
            loading={loading}
            onError={() => setImageError(true)}
            className={image()}
          />
        )}
        {!showImage && (
          <span
            className={fallbackClass()}
            aria-hidden={named || undefined}
            {...(color !== undefined ? { "data-category": color } : intentData(intent))}
          >
            {initials}
          </span>
        )}
      </span>
      {status ? <span data-status={status} className={statusClass()} aria-hidden="true" /> : null}
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
          className={cn("relative rounded-pill ring-2 ring-canvas", index > 0 && "-ml-2")}
          style={{ zIndex: index + 1 }}
        >
          {child}
        </span>
      ))}
      {extra > 0 ? (
        <Avatar
          fallback={`+${extra}`}
          size={size}
          className="relative -ml-2 rounded-pill ring-2 ring-canvas"
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
