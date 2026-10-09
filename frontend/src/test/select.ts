import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Chooses an option of a dettmann-ui `Input.Select`. The v2 select is a
 * `combobox` button with a `listbox` (not a native `<select>`), so it is
 * opened and the option is clicked by its visible label.
 */
export async function chooseOption(user: UserEvent, combobox: HTMLElement, option: string | RegExp) {
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name: option }));
}
