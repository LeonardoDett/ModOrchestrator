import type {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  ElementType,
  ReactElement,
  Ref,
} from "react";

/**
 * Polymorphic component types for the `as` prop pattern.
 *
 * These types allow components to accept an `as` prop that changes
 * the rendered element while maintaining proper TypeScript inference
 * for the element's native props.
 *
 * @example
 * ```tsx
 * // Define a polymorphic Button component
 * type ButtonProps<E extends ElementType = "button"> = PolymorphicComponentProps<
 *   E,
 *   { variant?: "primary" | "secondary" }
 * >;
 *
 * function Button<E extends ElementType = "button">({
 *   as,
 *   variant = "primary",
 *   children,
 *   ...props
 * }: ButtonProps<E>) {
 *   const Component = as || "button";
 *   return <Component {...props}>{children}</Component>;
 * }
 *
 * // Usage - TypeScript correctly infers props based on `as`
 * <Button>Click me</Button>                    // type="submit" is valid
 * <Button as="a" href="/path">Link</Button>    // href is valid, type is not
 * <Button as="div">Div button</Button>         // div props are valid
 * ```
 */

/**
 * Props that define the `as` prop for polymorphic components.
 */
export type AsProp<E extends ElementType> = {
  /** The element type to render as */
  as?: E;
};

/**
 * Extracts the ref type for a given element type.
 */
export type PolymorphicRef<E extends ElementType> = Ref<
  E extends keyof HTMLElementTagNameMap
    ? HTMLElementTagNameMap[E]
    : E extends keyof SVGElementTagNameMap
      ? SVGElementTagNameMap[E]
      : Element
>;

/**
 * Props to omit from the element props when merging with custom props.
 */
type PropsToOmit<E extends ElementType, P> = keyof (AsProp<E> & P);

/**
 * Polymorphic component props without ref.
 * Use this for components that don't need to forward refs.
 */
export type PolymorphicComponentProps<
  E extends ElementType,
  Props = object,
> = (Props & AsProp<E>) &
  Omit<ComponentPropsWithoutRef<E>, PropsToOmit<E, Props>>;

/**
 * Polymorphic component props with ref.
 * Use this for components that need to forward refs.
 */
export type PolymorphicComponentPropsWithRef<
  E extends ElementType,
  Props = object,
> = PolymorphicComponentProps<E, Props> & {
  ref?: PolymorphicRef<E>;
};

/**
 * Type for a polymorphic component function.
 * Useful for typing the component itself.
 */
export type PolymorphicComponent<
  DefaultElement extends ElementType,
  Props = object,
> = <E extends ElementType = DefaultElement>(
  props: PolymorphicComponentPropsWithRef<E, Props>
) => ReactElement | null;

/**
 * Infer the element type from a polymorphic component's props.
 */
export type InferPolymorphicElement<
  E extends ElementType,
  Props extends AsProp<ElementType>,
> = Props extends { as: infer As }
  ? As extends ElementType
    ? As
    : E
  : E;

/*
 * ============================================================================
 * USAGE EXAMPLES
 * ============================================================================
 *
 * 1. SIMPLE POLYMORPHIC COMPONENT (no ref forwarding)
 *
 *    type BoxProps<E extends ElementType = "div"> = PolymorphicComponentProps<
 *      E,
 *      { padding?: "sm" | "md" | "lg" }
 *    >;
 *
 *    function Box<E extends ElementType = "div">({
 *      as,
 *      padding,
 *      ...props
 *    }: BoxProps<E>) {
 *      const Component = as || "div";
 *      const paddingClass = { sm: "p-2", md: "p-4", lg: "p-6" }[padding ?? "md"];
 *      return <Component className={paddingClass} {...props} />;
 *    }
 *
 *    // Valid usages:
 *    <Box padding="md">Content</Box>
 *    <Box as="section" padding="lg">Section</Box>
 *    <Box as="a" href="/link" padding="sm">Link</Box>  // href is typed!
 *
 *
 * 2. POLYMORPHIC COMPONENT WITH REF
 *
 *    type TypographyProps<E extends ElementType = "p"> = PolymorphicComponentPropsWithRef<
 *      E,
 *      { variant?: "heading" | "body" }
 *    >;
 *
 *    const Typography = forwardRef(function Typography<E extends ElementType = "p">(
 *      { as, variant, ...props }: TypographyProps<E>,
 *      ref: PolymorphicRef<E>
 *    ) {
 *      const Component = as || "p";
 *      return <Component ref={ref} {...props} />;
 *    }) as PolymorphicComponent<"p", { variant?: "heading" | "body" }>;
 *
 *    // With ref:
 *    const headingRef = useRef<HTMLHeadingElement>(null);
 *    <Typography as="h1" ref={headingRef}>Heading</Typography>
 *
 * ============================================================================
 */
