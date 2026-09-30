# Cursor Prompt — Final Dettmann UI Review

Do not change application business logic.

Read:

1. `README.md`
2. `docs/ai-contract.md`
3. `docs/decisions.md`
4. `docs/anti-patterns.md`
5. `.cursor/skills/dettmann-ui/theme-first/SKILL.md`
6. `.cursor/skills/dettmann-ui/composition/SKILL.md`
7. `.cursor/skills/dettmann-ui/component-authoring/SKILL.md`
8. `.cursor/skills/dettmann-ui/ui-review/SKILL.md`

Review every changed UI file.

Check:

- the light and dark theme use the same semantic contract;
- 60/30/10 remains visible at the screen-composition level;
- no raw product colors were introduced;
- no dynamic Tailwind class interpolation was introduced;
- focus, keyboard interaction, disabled, empty and error states are represented;
- overlay components trap and restore focus;
- complex layouts use composition instead of duplicated markup;
- reusable components have controlled/uncontrolled state where appropriate;
- product logic remains outside Dettmann UI;
- tests describe the important interaction contract.

Do not fix visual problems by adding screen-local color overrides before checking the theme source.

At the end, report only concrete findings and changes made.
