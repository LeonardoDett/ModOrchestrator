import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Gallery.List wraps the cells without adding a box, so they join the Root grid.
 *
 * @example
 * ```tsx
 * <Gallery.List>
 *   <img alt="" src="/a.jpg" />
 *   <img alt="" src="/b.jpg" />
 * </Gallery.List>
 * ```
 */
export function GalleryList({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("contents", className)} {...props} />;
}
