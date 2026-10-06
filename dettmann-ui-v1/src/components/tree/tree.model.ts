/**
 * Batch selection of a tree (checkboxes). The selection holds leaf ids
 * only: a branch is checked when every leaf below it is, indeterminate when
 * some are, and toggling a branch toggles all of its leaves. Disabled leaves
 * are never changed by a branch toggle.
 */

export interface CheckableNode {
  id: string;
  children?: readonly CheckableNode[];
  disabled?: boolean;
}

export type TreeCheckState = "checked" | "unchecked" | "indeterminate";

/** Leaf ids below node (the node itself when it is a leaf). */
export function treeLeafIds(node: CheckableNode, includeDisabled = false): string[] {
  if (!node.children?.length) return includeDisabled || !node.disabled ? [node.id] : [];
  return node.children.flatMap((child) => treeLeafIds(child, includeDisabled));
}

export function treeCheckState(node: CheckableNode, checked: ReadonlySet<string>): TreeCheckState {
  const leaves = treeLeafIds(node, true);
  const on = leaves.filter((id) => checked.has(id)).length;
  if (on === 0) return "unchecked";
  return on === leaves.length ? "checked" : "indeterminate";
}

/** Next selection after toggling node: unchecked or partial → all, all → none. */
export function toggleTreeCheck(node: CheckableNode, checked: ReadonlySet<string>): Set<string> {
  const next = new Set(checked);
  const leaves = treeLeafIds(node);
  const all = leaves.length > 0 && leaves.every((id) => next.has(id));
  for (const id of leaves) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}
