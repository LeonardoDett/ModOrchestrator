import { useCallback, useEffect, useRef, useState } from "react";

type UseControllableStateParams<T> = {
  /** Controlled value (if provided, component is controlled) */
  value?: T;
  /** Default value for uncontrolled mode */
  defaultValue?: T;
  /** Callback when value changes */
  onChange?: (value: T) => void;
  /** Fallback value if neither value nor defaultValue is provided */
  fallbackValue?: T;
};

/**
 * Hook that handles both controlled and uncontrolled component state.
 *
 * - If `value` is provided, the component is controlled (state comes from parent)
 * - If only `defaultValue` is provided, the component is uncontrolled (manages own state)
 * - `onChange` is called in both modes when the value changes
 *
 * @example
 * ```tsx
 * // Controlled usage (parent manages state)
 * const [value, setValue] = useState("hello");
 * <Input value={value} onChange={setValue} />
 *
 * // Uncontrolled usage (component manages own state)
 * <Input defaultValue="hello" onChange={(v) => console.log(v)} />
 *
 * // Inside the Input component:
 * function Input({ value, defaultValue, onChange }) {
 *   const [internalValue, setInternalValue] = useControllableState({
 *     value,
 *     defaultValue,
 *     onChange,
 *   });
 *
 *   return <input value={internalValue} onChange={(e) => setInternalValue(e.target.value)} />;
 * }
 * ```
 */
export function useControllableState<T>({
  value: controlledValue,
  defaultValue,
  onChange,
  fallbackValue,
}: UseControllableStateParams<T>): [T, (value: T | ((prev: T) => T)) => void] {
  const isControlled = controlledValue !== undefined;
  const isControlledRef = useRef(isControlled);

  // Warn if switching between controlled/uncontrolled (development only)
  useEffect(() => {
    if (isControlledRef.current !== isControlled) {
      console.warn(
        `A component is changing from ${
          isControlledRef.current ? "controlled" : "uncontrolled"
        } to ${isControlled ? "controlled" : "uncontrolled"}. ` +
          "Components should not switch from controlled to uncontrolled (or vice versa). " +
          "Decide between using a controlled or uncontrolled value for the lifetime of the component."
      );
    }
  }, [isControlled]);

  // Internal state for uncontrolled mode
  const [uncontrolledValue, setUncontrolledValue] = useState<T>(() => {
    if (defaultValue !== undefined) return defaultValue;
    if (fallbackValue !== undefined) return fallbackValue;
    return undefined as T;
  });

  // The actual value (controlled or uncontrolled)
  const value = isControlled ? controlledValue : uncontrolledValue;

  // Setter that handles both modes
  const setValue = useCallback(
    (nextValue: T | ((prev: T) => T)) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (prev: T) => T)(value)
          : nextValue;

      // In uncontrolled mode, update internal state
      if (!isControlled) {
        setUncontrolledValue(resolvedValue);
      }

      // Always call onChange if provided
      onChange?.(resolvedValue);
    },
    [isControlled, value, onChange]
  );

  return [value, setValue];
}

/*
 * ============================================================================
 * MANUAL TESTING GUIDE
 * ============================================================================
 *
 * Since automated tests are in Etapa 8, here's how to manually validate
 * this hook works correctly in both controlled and uncontrolled modes:
 *
 * 1. UNCONTROLLED MODE TEST
 *    Create a component that uses defaultValue:
 *
 *    function TestUncontrolled() {
 *      const [value, setValue] = useControllableState({
 *        defaultValue: "initial",
 *        onChange: (v) => console.log("onChange:", v),
 *      });
 *
 *      return (
 *        <div>
 *          <p>Value: {value}</p>
 *          <button onClick={() => setValue("changed")}>Change</button>
 *        </div>
 *      );
 *    }
 *
 *    Expected behavior:
 *    - Initial render shows "initial"
 *    - Clicking button changes to "changed"
 *    - Console logs "onChange: changed"
 *    - Value persists after re-render
 *
 * 2. CONTROLLED MODE TEST
 *    Create a component that passes value prop:
 *
 *    function TestControlled() {
 *      const [parentValue, setParentValue] = useState("parent-controlled");
 *
 *      return (
 *        <ChildComponent
 *          value={parentValue}
 *          onChange={setParentValue}
 *        />
 *      );
 *    }
 *
 *    function ChildComponent({ value, onChange }) {
 *      const [internalValue, setInternalValue] = useControllableState({
 *        value,
 *        onChange,
 *      });
 *
 *      return (
 *        <div>
 *          <p>Value: {internalValue}</p>
 *          <button onClick={() => setInternalValue("child-changed")}>Change</button>
 *        </div>
 *      );
 *    }
 *
 *    Expected behavior:
 *    - Initial render shows "parent-controlled"
 *    - Clicking button calls parent's setParentValue
 *    - Parent re-renders, passing new value down
 *    - Value updates to "child-changed"
 *
 * 3. SWITCHING MODE WARNING TEST
 *    In development, switching between controlled/uncontrolled should warn:
 *
 *    function TestSwitching() {
 *      const [useControlled, setUseControlled] = useState(false);
 *      const [value, setValue] = useState("controlled");
 *
 *      return (
 *        <div>
 *          <button onClick={() => setUseControlled(!useControlled)}>Toggle Mode</button>
 *          <ChildComponent
 *            value={useControlled ? value : undefined}
 *            defaultValue="uncontrolled"
 *            onChange={setValue}
 *          />
 *        </div>
 *      );
 *    }
 *
 *    Expected behavior:
 *    - Clicking "Toggle Mode" should log a warning to console about
 *      switching between controlled and uncontrolled modes
 *
 * ============================================================================
 */
