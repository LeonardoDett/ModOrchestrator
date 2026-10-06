# AI implementation contract

When an AI modifies Dettmann UI:

1. Read `README.md`.
2. Read `docs/decisions.md` and `docs/anti-patterns.md`.
3. Read the relevant Cursor skills.
4. Read the theme source before changing component styles.
5. Search for an existing component/pattern before creating a new one.
6. Preserve public APIs unless the task explicitly requests a breaking change.
7. Add or update tests for interaction contracts.
8. Run `.cursor/skills/dettmann-ui/ui-review/SKILL.md` before completion.
9. Record architectural changes in `docs/decisions.md`.

The AI should not infer missing design intent from a single screenshot. When intent is not documented, choose the smallest extension that preserves theme/composition contracts and document the decision.
