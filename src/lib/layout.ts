// The shown layout, as a mod reads it.

import { layout } from "herdr";

/** A node of a layout tree: the fields the mods here read. */
export interface LayoutNode {
  id?: string;
  type?: "block" | "row" | "column" | "stack";
  hidden?: boolean;
  /** A stack's shown child. */
  active?: string;
  radius?: number;
  border?: { width?: number; color?: string };
  size?: { px?: number; weight?: number };
  content?: { mod?: string; props?: Record<string, unknown>; terminal?: string };
  children?: LayoutNode[];
}

export function find(node: LayoutNode | null | undefined, id: string): LayoutNode | null {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

/** The shown layout's node of that id, or null. */
export const node = (id: string): LayoutNode | null => find(layout() as LayoutNode, id);
