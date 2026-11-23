// Drawer: a terminal panel under the tab that slides in and out, VS Code style.
// One terminal shows at a time; a list beside it switches between the space's
// terminals.
//
// The layout holds three copies of this mod, told apart by props.role:
//   "toggle"  the status bar button. Always shown, so it is also the controller:
//             it keeps the layout's terminal blocks in step with the live
//             terminals, answers the key commands and follows the active space.
//   "list"    the list beside the terminal (new, switch, close, hide).
//   "empty"   what the drawer shows while the space has no terminal.
//
// Layout nodes it relies on: "drawer" (the panel, hidden or shown) and
// "drawer-view" (a stack: "drawer-empty" plus one terminal block per drawer
// terminal, id "drawer-term-" + the address with every character outside
// A-Z a-z 0-9 as "_").
//
// Every space has its own drawer: open or closed as it was left there, on its
// own terminal (shared "drawer.open" and "drawer.selected", both by space id).
// The layout has one panel, so it is turned to the space being shown. A change a
// mod makes lands a frame after the one it reacted to, so following the active
// space (syncOpen) shows the new space with the old space's drawer for one
// frame. Turning it in the same step as the switch has no such frame: the space
// keys below do that, and so can any mod that switches spaces (turnDrawerTo).
//
// A drawer terminal is a herdr-core terminal labelled drawer.space=<space id>.
// It has no herdr.tab label, so it never becomes a tab or a pane.
//
// Key commands (keys.json): drawer.toggle, .focus, .back, .new, .next, .prev,
// .kill; and the space keys with the drawer turned in the same step:
// drawer.space-next, .space-prev, .space-1 to .space-9.

import { View, div, svg, image } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  spaces, machines, terminals, panes, focused, run, hc, props,
  shared, setShared, appHome, nextCommand, notify, checking,
  readTextFile, writeTextFile,
} from "herdr";
import type { SpaceInfo } from "herdr";
import { find, node } from "../lib/layout.ts";
import type { LayoutNode } from "../lib/layout.ts";
import { colors } from "../lib/theme.ts";
import type { Theme } from "../lib/theme.ts";
import { DRAWER, DRAWER_VIEW, DRAWER_EMPTY, DRAWER_OPEN, DRAWER_SELECTED, bySpace, drawerBlock, turnDrawerTo } from "../lib/drawer-link.ts";

type Terminal = ReturnType<typeof terminals>[number];
type Role = "toggle" | "list" | "empty";

const LABEL = "drawer.space";
const ICONS = "mods/drawer";

// Shared by this build's copies: the controller's wake-up and each tab's last pane.
const bus: { dirty: boolean; wake: (() => void) | null; lastPane: Record<string, string> } = { dirty: false, wake: null, lastPane: {} };

const activeSpace = (): SpaceInfo | null => spaces().find((s) => s.active) ?? null;
const message = (error: unknown): string => String((error as { message?: unknown })?.message ?? error);

function drawerTerminals(): Terminal[] {
  return terminals()
    .filter((t) => t.state === "live" && t.labels?.[LABEL])
    .sort((a, b) => (a.created_ms ?? 0) - (b.created_ms ?? 0));
}

// The panel's frame decides its controls: a layout that squares the panel
// (radius 0) gets square rows and buttons, and its border's width.
function look(): { corner: (radius: number) => number; line: number } {
  const panel = node(DRAWER);
  const square = panel?.radius === 0;
  return { corner: (radius) => (square ? 0 : radius), line: panel?.border?.width ?? 1 };
}

const terminalsOf = (space: SpaceInfo | null): Terminal[] => (space ? drawerTerminals().filter((t) => t.labels[LABEL] === space.id) : []);

// The terminal the drawer shows for a space: the one picked last, else the newest.
function pick(space: SpaceInfo | null): Terminal | null {
  const list = terminalsOf(space);
  const chosen = space ? bySpace<string>(DRAWER_SELECTED)[space.id] : null;
  return list.find((t) => t.address === chosen) ?? list[list.length - 1] ?? null;
}

function select(space: SpaceInfo, address: string): void {
  const chosen = bySpace<string>(DRAWER_SELECTED);
  if (chosen[space.id] !== address) setShared(DRAWER_SELECTED, { ...chosen, [space.id]: address });
}

// Herdr's own space commands, after the drawer is turned to where they will land.
function switchSpace(command: string): void {
  const all = spaces();
  const at = all.findIndex((s) => s.active);
  const number = Number(command.slice(6));
  const target = command === "space-next" ? all[(at + 1) % all.length]
    : command === "space-prev" ? all[(at - 1 + all.length) % all.length]
    : all[number - 1];
  if (target && !target.active) turnDrawerTo(target.id);
  if (command === "space-next") run("space.next");
  else if (command === "space-prev") run("space.prev");
  else run("space.select", { index: number });
}

function shortFolder(cwd: string | null | undefined): string {
  if (!cwd) return "";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function kick(): void {
  bus.dirty = true;
  bus.wake?.();
}

// Gives the drawer's terminal the keyboard once the drawer shows it.
async function focusTerminal(cx: AsyncContext, address: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const f = focused();
    if (f && !f.pane && f.terminal === address) return;
    const panel = node(DRAWER);
    if (!panel) return;
    if (!panel.hidden && node(DRAWER_VIEW)?.active === drawerBlock(address)) run("pane.focus", { terminal: address });
    await cx.sleep(50);
  }
}

async function newTerminal(cx: AsyncContext): Promise<void> {
  const space = activeSpace();
  if (!space) return;
  const f = focused();
  const cwd = (f?.space === space.id && f.cwd) || space.folder || null;
  const args = ["run", "--bg", "--keep", "--rm", "--no-parent", "--no-notify", "--json", "--label", `${LABEL}=${space.id}`];
  if (space.machine) args.push("--on", space.machine);
  if (cwd) args.push("--cwd", cwd);
  let address: string | null = null;
  let problem: string | null = null;
  try {
    const result = await hc(args);
    const out = JSON.parse(result.stdout.trim().split("\n").pop() || "{}");
    address = out.address ?? null;
    problem = out.error?.message ?? (address ? null : result.stderr.trim() || "herdr-core gave no terminal");
  } catch (error) {
    problem = message(error);
  }
  if (!address) {
    notify({ title: "Drawer", body: problem, level: "error" });
    return;
  }
  select(space, address);
  run("layout.show", { id: DRAWER });
  kick();
  await focusTerminal(cx, address);
}

// Shows the drawer on the space's terminal, starting one when it has none.
async function openDrawer(cx: AsyncContext): Promise<void> {
  const space = activeSpace();
  if (!space) return;
  run("layout.show", { id: DRAWER });
  const terminal = pick(space);
  if (terminal) await focusTerminal(cx, terminal.address);
  else await newTerminal(cx);
}

// Back to the tab: the pane that had the keyboard before the drawer took it.
function focusTab(): void {
  const f = focused();
  if (!f || f.pane) return;
  const inTab = panes().filter((p) => p.tab === f.tab);
  const pane = inTab.find((p) => p.pane === bus.lastPane[f.tab]) ?? inTab[0];
  if (pane) run("pane.focus", { pane: pane.pane });
}

function hideDrawer(): void {
  focusTab();
  run("layout.hide", { id: DRAWER });
}

async function toggleDrawer(cx: AsyncContext): Promise<void> {
  const panel = node(DRAWER);
  if (!panel) return;
  if (panel.hidden) await openDrawer(cx);
  else hideDrawer();
}

async function showTerminal(cx: AsyncContext, space: SpaceInfo, address: string): Promise<void> {
  select(space, address);
  await focusTerminal(cx, address);
}

async function step(cx: AsyncContext, by: number): Promise<void> {
  const space = activeSpace();
  const list = terminalsOf(space);
  if (list.length < 2) return;
  const at = list.findIndex((t) => t.address === pick(space)?.address);
  await showTerminal(cx, space, list[(at + by + list.length) % list.length].address);
}

function killTerminal(address: string): void {
  run("terminal.kill", { terminal: address });
}

// Ends a terminal; when it had the keyboard, the space's next one takes it.
async function closeTerminal(cx: AsyncContext, address: string): Promise<void> {
  const f = focused();
  const hadKeyboard = Boolean(f) && !f.pane && f.terminal === address;
  killTerminal(address);
  if (!hadKeyboard) return;
  for (let i = 0; i < 40 && drawerTerminals().some((t) => t.address === address); i++) await cx.sleep(50);
  const next = pick(activeSpace());
  if (next && next.address !== address) await focusTerminal(cx, next.address);
}

// True once a space's machine has answered and no longer lists it.
function gone(id: string, all: SpaceInfo[]): boolean {
  const machine = id.includes("/") ? id.split("/")[0] : null;
  return machines().some((m) => (m.name ?? null) === machine && m.layout === "ready") && !all.some((s) => s.id === id);
}

export default class Drawer extends View {
  role: Role;
  /** The list row under the pointer. */
  hover: string | null;
  lastSelect: { child: string; at: number } | null;
  /** How many checks in a row found a terminal's space gone. */
  orphans: Record<string, number>;
  /** The space the layout's panel was last turned to; undefined until the first sync. */
  space: string | undefined;
  /** A show or hide on its way to the layout. */
  pending: { want: boolean; until: number } | null;

  init(_props: unknown, cx: AsyncContext): void {
    this.role = props()?.role ?? "list";
    this.hover = null;
    this.lastSelect = null;
    this.orphans = {};
    this.space = undefined;
    this.pending = null;
    if (checking() || this.role !== "toggle") return;

    // The layout file follows the live terminals: one block per drawer terminal.
    cx.spawn(async (cx) => {
      for (;;) {
        if (!bus.dirty) await new Promise<void>((resolve) => { bus.wake = resolve; });
        bus.wake = null;
        bus.dirty = false;
        try {
          await this.writeLayout();
        } catch (error) {
          console.log(`drawer: layout not written: ${message(error)}`);
          await cx.sleep(1500);
        }
        await cx.sleep(150);
        cx.notify();
      }
    });

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "toggle") await toggleDrawer(cx);
        else if (command === "focus") await openDrawer(cx);
        else if (command === "back") focusTab();
        else if (command === "new") await newTerminal(cx);
        else if (command === "next") await step(cx, 1);
        else if (command === "prev") await step(cx, -1);
        else if (/^space-(next|prev|[1-9])$/.test(command)) switchSpace(command);
        else if (command === "kill") {
          const terminal = pick(activeSpace());
          if (terminal) await closeTerminal(cx, terminal.address);
        }
        cx.notify();
      }
    });

    cx.timer.every(5000, () => {
      this.endOrphans();
      this.forgetClosed();
      if (this.blocksDiffer()) kick();
    });
  }

  blocksDiffer(): boolean {
    const view = node(DRAWER_VIEW);
    if (!view) return false;
    const have = (view.children ?? []).map((c) => c.content?.terminal).filter(Boolean).sort();
    const want = drawerTerminals().map((t) => t.address as string).sort();
    const hasEmpty = (view.children ?? []).some((c) => c.id === DRAWER_EMPTY);
    return !hasEmpty || have.length !== want.length || have.some((a, i) => a !== want[i]);
  }

  // A layout shows a terminal only through a block, so the shown layout's file gets
  // one per drawer terminal. Written with the text that was read as the expected
  // one: an edit made in between is not lost, the write fails and is tried again.
  async writeLayout(): Promise<void> {
    if (!node(DRAWER_VIEW)) return;
    const path = `${appHome()}/layouts/${shared("layout")}.json`;
    const text = await readTextFile(path);
    if (text === null) return;
    const tree: LayoutNode = JSON.parse(text);
    const view = find(tree, DRAWER_VIEW);
    if (!view) return;
    const want = drawerTerminals().map((t) => t.address as string);
    const before = JSON.stringify(view.children ?? []);
    const kept = (view.children ?? []).filter((c) => c.content?.terminal && want.includes(c.content.terminal));
    const known = kept.map((c) => c.content.terminal);
    const empty: LayoutNode = (view.children ?? []).find((c) => c.id === DRAWER_EMPTY)
      ?? { id: DRAWER_EMPTY, type: "block", content: { mod: "drawer", props: { role: "empty" } } };
    view.children = [
      empty,
      ...kept,
      ...want.filter((a) => !known.includes(a)).map((a): LayoutNode => ({ id: drawerBlock(a), type: "block", content: { terminal: a } })),
    ];
    if (JSON.stringify(view.children) === before) return;
    await writeTextFile(path, `${JSON.stringify(tree, null, 2)}\n`, text);
  }

  // A closed space's drawer terminals end with it, as its panes do.
  endOrphans(): void {
    const all = spaces();
    if (!all.length) return;
    const seen: Record<string, number> = {};
    for (const terminal of drawerTerminals()) {
      if (!gone(terminal.labels[LABEL], all)) continue;
      seen[terminal.address] = (this.orphans[terminal.address] ?? 0) + 1;
      if (seen[terminal.address] >= 3) killTerminal(terminal.address);
    }
    this.orphans = seen;
  }

  // What closed spaces left behind in the shared state goes with them.
  forgetClosed(): void {
    const all = spaces();
    if (!all.length) return;
    for (const key of [DRAWER_OPEN, DRAWER_SELECTED]) {
      const stored = bySpace<unknown>(key);
      const dead = Object.keys(stored).filter((id) => gone(id, all));
      if (dead.length) setShared(key, Object.fromEntries(Object.entries(stored).filter(([id]) => !dead.includes(id))));
    }
  }

  // The drawer is open or closed per space. Arriving at a space sets the layout's
  // one flag to what that space had (closed if it never had a drawer), unless
  // turnDrawerTo() already did; a change made while a space shows is recorded as
  // that space's.
  syncOpen(space: SpaceInfo | null, panel: LayoutNode): void {
    if (!space) return;
    const open = !panel.hidden;
    const stored = bySpace<boolean>(DRAWER_OPEN);
    if (space.id !== this.space) {
      const first = this.space === undefined;
      // At a start the shown space can be a stand-in until every machine has answered.
      if (first && machines().some((m) => m.layout === "loading")) return;
      this.space = space.id;
      this.pending = null;
      // A start finds the layout as this space left it: without a record, that is the record.
      const want = first && !(space.id in stored) ? open : Boolean(stored[space.id]);
      if (want !== open) {
        this.pending = { want, until: Date.now() + 1000 };
        run(want ? "layout.show" : "layout.hide", { id: DRAWER });
        return;
      }
    }
    // Until that lands, what the layout still says is not a choice.
    if (this.pending) {
      if (this.pending.want !== open && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (stored[space.id] !== open) setShared(DRAWER_OPEN, { ...stored, [space.id]: open });
  }

  // The drawer follows the active space: open or closed, and on its terminal.
  // Called on every controller render.
  reconcile(): void {
    const panel = node(DRAWER);
    const view = node(DRAWER_VIEW);
    if (!panel || !view) return;
    const f = focused();
    if (f?.pane) bus.lastPane[f.tab] = f.pane;
    if (this.blocksDiffer()) kick();
    const space = activeSpace();
    this.syncOpen(space, panel);
    const terminal = pick(space);
    // Recorded even when it is only the newest, so turnDrawerTo() knows it before the space shows.
    if (terminal) select(space, terminal.address);
    const want = terminal ? drawerBlock(terminal.address) : DRAWER_EMPTY;
    if (view.active === want || !(view.children ?? []).some((c) => c.id === want)) return;
    const now = Date.now();
    if (this.lastSelect?.child === want && now - this.lastSelect.at < 400) return;
    this.lastSelect = { child: want, at: now };
    run("layout.select", { stack: DRAWER_VIEW, child: want });
  }

  iconButton(t: Theme, id: string, icon: string, onClick: (event: unknown, cx: Context) => void): Element {
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(look().corner(5))
      .text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(onClick).child(svg(`${ICONS}/${icon}.svg`).size(14));
  }

  renderToggle(t: Theme): Element {
    this.reconcile();
    const panel = node(DRAWER);
    const open = Boolean(panel) && !panel.hidden;
    // Plain text like the status bar's own entries: its mod already leaves 14px before this block.
    return h_flex().size_full().items_center().bg(t.chrome).border_t(look().line).border_color(t.border)
      .text_size(11.8)
      .child(
        h_flex().id("drawer-toggle").h_full().flex_none().gap(5).items_center().cursor_pointer()
          .text_color(open ? t.foreground : t.muted)
          .hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { cx.spawn((cx) => toggleDrawer(cx)); })
          .child(svg(`${ICONS}/terminal.svg`).size(13))
          .child("Terminal"),
      );
  }

  renderEmpty(t: Theme): Element {
    return v_flex().size_full().items_center().justify_center().gap(10).bg(t.background).text_size(12.5).text_color(t.muted)
      .child("No terminal in this space")
      .child(
        h_flex().id("drawer-first").h(26).px(10).gap(6).items_center().rounded(look().corner(6)).cursor_pointer()
          .border(1).border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { cx.spawn((cx) => newTerminal(cx)); })
          .child(svg(`${ICONS}/plus.svg`).size(13))
          .child("New terminal"),
      );
  }

  renderList(t: Theme): Element {
    const space = activeSpace();
    const list = terminalsOf(space);
    const shown = pick(space)?.address ?? null;
    const f = focused();
    const row = (terminal: Terminal, index: number): Element => {
      const address: string = terminal.address;
      const on = address === shown;
      const hasKeyboard = on && f && !f.pane && f.terminal === address;
      const program = terminal.program;
      const name = terminal.name || program?.name || "shell";
      return h_flex().id(`drawer-row-${address}`).h(28).mx(4).px(8).gap(7).flex_none().items_center().rounded(look().corner(6)).cursor_pointer()
        .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(on ? t.selected : t.hover))
        .on_hover((hovered, cx) => { this.hover = hovered ? address : this.hover === address ? null : this.hover; cx.notify(); })
        .on_click((_e, cx) => { cx.spawn((cx) => showTerminal(cx, space, address)); })
        .child(div().w(2).h(14).flex_none().rounded(look().corner(1)).bg(hasKeyboard ? t.accent : on ? t.selected : t.background))
        .when(Boolean(program?.icon), (el) =>
          el.child(program.tint ? svg(program.icon).size(13).flex_none() : image(program.icon).w(13).h(13).flex_none()))
        .child(div().flex_none().max_w(110).truncate().child(`${index + 1}  ${name}`))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(shortFolder(terminal.cwd)))
        .when(on || this.hover === address, (el) =>
          el.child(this.iconButton(t, `drawer-kill-${address}`, "x", (_e, cx) => { cx.stop_propagation(); cx.spawn((cx) => closeTerminal(cx, address)); })));
    };
    return v_flex().size_full().min_w(0).bg(t.background).border_l(look().line).border_color(t.border).text_size(12.5)
      .child(
        h_flex().h(30).flex_none().pl(12).pr(6).gap(2).items_center().border_b(look().line).border_color(t.border)
          .child(div().flex_1().text_size(11).font_semibold().text_color(t.dim).child("TERMINALS"))
          .child(this.iconButton(t, "drawer-new", "plus", (_e, cx) => { cx.spawn((cx) => newTerminal(cx)); }))
          .child(this.iconButton(t, "drawer-hide", "chevron-down", () => hideDrawer())),
      )
      .child(
        v_flex().id("drawer-rows").flex_1().min_h(0).py(4).gap(2).overflow_y_scrollbar()
          .children(list.map(row))
          .when(list.length === 0, (el) => el.child(div().px(12).py(6).text_color(t.dim).child("None yet"))),
      );
  }

  render(): Element {
    const t = colors();
    if (this.role === "toggle") return this.renderToggle(t);
    if (this.role === "empty") return this.renderEmpty(t);
    return this.renderList(t);
  }
}
