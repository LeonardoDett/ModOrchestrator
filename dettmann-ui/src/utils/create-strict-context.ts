import { createContext, useContext, type Context, type Provider } from "react";

/**
 * Creates a strict context that throws a descriptive error when used outside its provider.
 *
 * @param name - The name of the component family (e.g., "Input", "Modal")
 * @param rootComponentName - Optional custom name for the root component (defaults to `${name}.Root`)
 *
 * @returns A tuple of [Provider, useContext hook]
 *
 * @example
 * ```tsx
 * // Create context for Input family
 * const [InputProvider, useInputContext] = createStrictContext<InputContextValue>("Input");
 *
 * // In Input.Root
 * function InputRoot({ children, ...props }) {
 *   const value = { id: useId(), disabled: props.disabled };
 *   return <InputProvider value={value}>{children}</InputProvider>;
 * }
 *
 * // In Input.Label - throws if used outside Input.Root
 * function InputLabel({ children }) {
 *   const { id } = useInputContext("Label");
 *   return <label htmlFor={id}>{children}</label>;
 * }
 * ```
 */
export function createStrictContext<T>(
  name: string,
  rootComponentName?: string
): [Provider<T>, (consumerName: string) => T] {
  const Context = createContext<T | undefined>(undefined);

  const rootName = rootComponentName ?? `${name}.Root`;

  function useStrictContext(consumerName: string): T {
    const context = useContext(Context as Context<T | undefined>);

    if (context === undefined) {
      throw new Error(
        `${name}.${consumerName} must be used within ${rootName}. ` +
          `Wrap your ${name}.${consumerName} component inside a ${rootName}.`
      );
    }

    return context;
  }

  return [Context.Provider as Provider<T>, useStrictContext];
}

/**
 * Creates a strict context with an optional scope for nested contexts.
 * Useful when the same component family might be nested (e.g., nested menus).
 *
 * @param name - The name of the component family
 * @param defaultValue - Optional default value (if provided, no error is thrown)
 *
 * @example
 * ```tsx
 * const [MenuProvider, useMenuContext] = createOptionalContext<MenuContextValue>("Menu");
 *
 * // Won't throw if used outside provider, returns undefined
 * const context = useMenuContext("Item"); // MenuContextValue | undefined
 * ```
 */
export function createOptionalContext<T>(
  name: string
): [Provider<T | undefined>, (consumerName: string) => T | undefined] {
  const Context = createContext<T | undefined>(undefined);

  function useOptionalContext(_consumerName: string): T | undefined {
    return useContext(Context);
  }

  return [Context.Provider, useOptionalContext];
}
