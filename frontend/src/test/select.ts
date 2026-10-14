import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Chooses an option of a dettmann-ui `Input.Select`. The v2 select is a
 * `combobox` button with a `listbox` (not a native `<select>`), so it is
 * opened and the option is clicked by its visible label.
 */
export async function chooseOption(user: UserEvent, combobox: HTMLElement, option: string | RegExp) {
  await user.click(combobox);
  // Scoped to the select's own listbox: the page may have other listboxes.
  const id = combobox.getAttribute("aria-controls");
  const listbox = id ? document.getElementById(id) : null;
  const scope = listbox ? within(listbox) : screen;
  await user.click(await scope.findByRole("option", { name: option }));
}
