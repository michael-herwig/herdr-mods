// What ties a layout, the drawer mod and any mod that switches spaces together:
// the drawer's layout nodes, its shared state, and turning it to a space.
//
// The drawer is per space, but a layout has one panel. A change a mod makes with
// run() while rendering lands one frame after the frame it reacted to, so a mod
// that only follows the active space shows the new space with the old space's
// panel for one frame. Turning the panel in the same step as the switch has no
// such frame: call turnDrawerTo(id) right before the command that shows the space.
// Without the drawer in the layout it does nothing.

import { run, shared } from "herdr";
import { node } from "./layout.ts";

/** The panel: a row, hidden or shown. */
export const DRAWER = "drawer";
/** In it, a stack: one terminal block per drawer terminal, plus DRAWER_EMPTY. */
export const DRAWER_VIEW = "drawer-view";
/** What the stack shows while the space has no terminal. */
export const DRAWER_EMPTY = "drawer-empty";
/** Shared: { <space id>: true | false }. */
export const DRAWER_OPEN = "drawer.open";
/** Shared: { <space id>: <terminal address> }. */
export const DRAWER_SELECTED = "drawer.selected";

/** The id of the layout block that shows a drawer terminal. */
export const drawerBlock = (address: string): string => `drawer-term-${address.replace(/[^A-Za-z0-9]/g, "_")}`;

/** A shared map by space id; empty until something is stored. */
export function bySpace<T>(key: string): Record<string, T> {
  return (shared(key) as Record<string, T> | null | undefined) ?? {};
}

/** Turns the drawer to a space about to be shown: open or closed, on its terminal. */
export function turnDrawerTo(spaceId: string): void {
  const panel = node(DRAWER);
  const view = node(DRAWER_VIEW);
  if (!panel || !view) return;
  const address = bySpace<string>(DRAWER_SELECTED)[spaceId];
  const child = address ? drawerBlock(address) : DRAWER_EMPTY;
  if (view.active !== child && (view.children ?? []).some((c) => c.id === child)) run("layout.select", { stack: DRAWER_VIEW, child });
  const open = Boolean(bySpace<boolean>(DRAWER_OPEN)[spaceId]);
  if (open === Boolean(panel.hidden)) run(open ? "layout.show" : "layout.hide", { id: DRAWER });
}
