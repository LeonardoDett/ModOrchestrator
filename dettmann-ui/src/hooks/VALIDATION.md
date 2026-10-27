# Hooks Validation Guide

Since automated tests are in Etapa 8, this document explains how to manually validate the hooks.

## useControllableState

This hook handles both controlled and uncontrolled component state.

### Test 1: Uncontrolled Mode

Create a component that uses `defaultValue`:

```tsx
function TestUncontrolled() {
  const [value, setValue] = useControllableState({
    defaultValue: "initial",
    onChange: (v) => console.log("onChange:", v),
  });

  return (
    <div>
      <p>Value: {value}</p>
      <button onClick={() => setValue("changed")}>Change</button>
    </div>
  );
}
```

**Expected behavior:**
- Initial render shows "initial"
- Clicking button changes to "changed"
- Console logs "onChange: changed"
- Value persists after re-render

### Test 2: Controlled Mode

Create a component where parent controls the value:

```tsx
function TestControlled() {
  const [parentValue, setParentValue] = useState("parent-controlled");

  return <ChildComponent value={parentValue} onChange={setParentValue} />;
}

function ChildComponent({ value, onChange }) {
  const [internalValue, setInternalValue] = useControllableState({
    value,
    onChange,
  });

  return (
    <div>
      <p>Value: {internalValue}</p>
      <button onClick={() => setInternalValue("child-changed")}>Change</button>
    </div>
  );
}
```

**Expected behavior:**
- Initial render shows "parent-controlled"
- Clicking button calls parent's setParentValue
- Parent re-renders, passing new value down
- Value updates to "child-changed"

### Test 3: Switching Mode Warning

Switching between controlled/uncontrolled should warn:

```tsx
function TestSwitching() {
  const [useControlled, setUseControlled] = useState(false);
  const [value, setValue] = useState("controlled");

  return (
    <div>
      <button onClick={() => setUseControlled(!useControlled)}>Toggle Mode</button>
      <ChildComponent
        value={useControlled ? value : undefined}
        defaultValue="uncontrolled"
        onChange={setValue}
      />
    </div>
  );
}
```

**Expected behavior:**
- Clicking "Toggle Mode" should log a warning to console about switching between controlled and uncontrolled modes

## createStrictContext

### Test: Error When Used Outside Provider

```tsx
const [DemoProvider, useDemoContext] = createStrictContext<{ id: string }>("Demo");

function DemoItem() {
  const { id } = useDemoContext("Item"); // This should throw!
  return <div>{id}</div>;
}

// This will throw:
// "Demo.Item must be used within Demo.Root. Wrap your Demo.Item component inside a Demo.Root."
<DemoItem />
```

**Expected behavior:**
- Error is thrown with message: "Demo.Item must be used within Demo.Root..."
- Error message clearly identifies which component is missing which provider
