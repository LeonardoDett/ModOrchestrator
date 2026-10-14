import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** The main navigation column (both levels, D120). */
export const sidebar = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

/**
 * Opens a screen of the active game: from the app level it first enters the
 * game through "Jump to" (D120), then clicks the item of the game menu.
 */
export async function openScreen(user: UserEvent, name: string | RegExp) {
  await waitFor(() => expect(sidebar()).toBeInTheDocument());
  if (!within(sidebar()).queryByRole("button", { name })) {
    const jump = await within(sidebar()).findByRole("group", { name: "Jump to" });
    await user.click(within(jump).getAllByRole("button")[0]!);
  }
  await user.click(await within(sidebar()).findByRole("button", { name }));
}

/** Opens the operations drawer through the Help menu of the top bar (D120). */
export async function openOperations(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Help" }));
  await user.click(await screen.findByRole("menuitem", { name: "Operations" }));
}
