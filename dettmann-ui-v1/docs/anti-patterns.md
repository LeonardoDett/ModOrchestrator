# Anti-patterns

Do not add raw brand colors to a component.

Do not create a new variant because one screen needs a different spacing value; use composition/layout primitives first.

Do not turn a neutral container into a colorful card merely because the screen feels empty.

Do not put data fetching, persistence or routing inside a reusable component.

Do not make semantic colors decorative.

Do not use color as the only signal for selection, errors, warnings or conflicts.

Do not add a dependency for a small deterministic behavior that can be reliably expressed with React/browser APIs.

Do not use a monolithic “everything component” with dozens of booleans when a composed API is clearer.
