// Terminal panel: a toggleable panel under the tab, VS Code style. One terminal
// shows at a time; a list beside it switches between the space's terminals.
//
// The layout holds three copies of this mod, told apart by props.role:
//   "toggle"  the status bar button. Always shown, so it is also the controller:
//             it keeps the layout's terminal blocks in step with the live
//             terminals and answers the key commands.
//   "list"    the list beside the terminal (new, switch, close, hide).
//   "empty"   what the panel shows while the space has no terminal.
//
// Layout nodes it relies on: "term-panel" (the panel, hidden or shown),
// "term-view" (a stack: one terminal block per panel terminal, plus "term-empty").
//
// Every space has its own panel: open or closed as it was left there, on its own
// terminal. The layout has one panel, so it is turned to the space being shown.
// A change from a mod lands a frame after the one it reacted to, so following the
// active space (syncOpen) shows the new space with the old space's panel for one
// frame. Turning the panel in the same step as the switch has no such frame:
// the space keys below do, and so can any mod that switches spaces. What it needs:
//   shared "term-panel.open"      { <space id>: true | false }
//   shared "term-panel.selected"  { <space id>: <terminal address> }
//   the panel's block for an address is "term-" + address with every character
//   outside A-Z a-z 0-9 as "_"; "term-empty" for a space without a terminal.
// See turnTo().
//
// A panel terminal is a herdr-core terminal labelled termpanel.space=<space id>.
// It has no herdr.tab label, so it never becomes a tab or a pane.
//
// Key commands (keys.json): term-panel.toggle, .focus, .back, .new, .next,
// .prev, .kill; and the space keys with the panel turned in the same step:
// term-panel.space-next, .space-prev, .space-1 to .space-9.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  spaces, machines, terminals, panes, focused, layout, theme, run, hc, props,
  shared, setShared, appHome, nextCommand, notify, checking,
  readTextFile, writeTextFile,
} from "herdr";

const LABEL = "termpanel.space";
const PANEL = "term-panel";
const VIEW = "term-view";
const EMPTY = "term-empty";
const SELECTED = "term-panel.selected";
const OPEN = "term-panel.open";
const ICONS = "mods/term-panel";

// Shared by this build's copies: the controller's wake-up and each tab's last pane.
const bus = { dirty: false, wake: null, lastPane: {} };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const childId = (address) => `term-${address.replace(/[^A-Za-z0-9]/g, "_")}`;
const activeSpace = () => spaces().find((s) => s.active) ?? null;
const panelNodes = () => {
  const root = layout();
  return { panel: find(root, PANEL), view: find(root, VIEW) };
};

function panelTerminals() {
  return terminals()
    .filter((t) => t.state === "live" && t.labels?.[LABEL])
    .sort((a, b) => (a.created_ms ?? 0) - (b.created_ms ?? 0));
}

// The panel's frame decides its controls: a layout that squares the panel
// (radius 0, as Voxel Neon does) gets square rows and buttons, and its border's width.
function look() {
  const panel = panelNodes().panel;
  const square = panel?.radius === 0;
  return { corner: (radius) => (square ? 0 : radius), line: panel?.border?.width ?? 1 };
}

// A shared map by space id; empty until something is stored.
/** @returns {Record<string, any>} */
function record(key) {
  return /** @type {any} */ (shared(key)) ?? {};
}

const terminalsOf = (space) => (space ? panelTerminals().filter((t) => t.labels[LABEL] === space.id) : []);

// The terminal the panel shows for a space: the one picked last, else the newest.
function pick(space) {
  const list = terminalsOf(space);
  const chosen = record(SELECTED)[space?.id];
  return list.find((t) => t.address === chosen) ?? list[list.length - 1] ?? null;
}

function select(space, address) {
  const chosen = record(SELECTED);
  if (chosen[space.id] !== address) setShared(SELECTED, { ...chosen, [space.id]: address });
}

// Turns the panel to a space about to be shown: open or closed, on its terminal.
function turnTo(id) {
  const { panel, view } = panelNodes();
  if (!panel || !view) return;
  const address = record(SELECTED)[id];
  const child = address ? childId(address) : EMPTY;
  if (view.active !== child && (view.children ?? []).some((c) => c.id === child)) run("layout.select", { stack: VIEW, child });
  const open = Boolean(record(OPEN)[id]);
  if (open === Boolean(panel.hidden)) run(open ? "layout.show" : "layout.hide", { id: PANEL });
}

// Herdr's own space commands, after the panel is turned to where they will land.
function switchSpace(command) {
  const all = spaces();
  const at = all.findIndex((s) => s.active);
  const number = Number(command.slice(6));
  const target = command === "space-next" ? all[(at + 1) % all.length]
    : command === "space-prev" ? all[(at - 1 + all.length) % all.length]
    : all[number - 1];
  if (target && !target.active) turnTo(target.id);
  if (command === "space-next") run("space.next");
  else if (command === "space-prev") run("space.prev");
  else run("space.select", { index: number });
}

function shortFolder(cwd) {
  if (!cwd) return "";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function kick() {
  bus.dirty = true;
  bus.wake?.();
}

// Gives the panel's terminal the keyboard once the panel shows it.
async function focusTerminal(cx, address) {
  for (let i = 0; i < 60; i++) {
    const f = focused();
    if (f && !f.pane && f.terminal === address) return;
    const { panel, view } = panelNodes();
    if (!panel) return;
    if (!panel.hidden && view?.active === childId(address)) run("pane.focus", { terminal: address });
    await cx.sleep(50);
  }
}

async function newTerminal(cx) {
  const space = activeSpace();
  if (!space) return;
  const f = focused();
  const cwd = (f?.space === space.id && f.cwd) || space.folder || null;
  const args = ["run", "--bg", "--keep", "--rm", "--no-parent", "--no-notify", "--json", "--label", `${LABEL}=${space.id}`];
  if (space.machine) args.push("--on", space.machine);
  if (cwd) args.push("--cwd", cwd);
  let address = null, problem = null;
  try {
    const result = await hc(args);
    const out = JSON.parse(result.stdout.trim().split("\n").pop() || "{}");
    address = out.address ?? null;
    problem = out.error?.message ?? (address ? null : result.stderr.trim() || "herdr-core gave no terminal");
  } catch (error) {
    problem = String(error?.message ?? error);
  }
  if (!address) {
    notify({ title: "Terminal panel", body: problem, level: "error" });
    return;
  }
  select(space, address);
  run("layout.show", { id: PANEL });
  kick();
  await focusTerminal(cx, address);
}

// Shows the panel on the space's terminal, starting one when it has none.
async function openPanel(cx) {
  const space = activeSpace();
  if (!space) return;
  run("layout.show", { id: PANEL });
  const terminal = pick(space);
  if (terminal) await focusTerminal(cx, terminal.address);
  else await newTerminal(cx);
}

// Back to the tab: the pane that had the keyboard before the panel took it.
function focusTab() {
  const f = focused();
  if (!f || f.pane) return;
  const inTab = panes().filter((p) => p.tab === f.tab);
  const pane = inTab.find((p) => p.pane === bus.lastPane[f.tab]) ?? inTab[0];
  if (pane) run("pane.focus", { pane: pane.pane });
}

function hidePanel() {
  focusTab();
  run("layout.hide", { id: PANEL });
}

async function togglePanel(cx) {
  const { panel } = panelNodes();
  if (!panel) return;
  if (panel.hidden) await openPanel(cx);
  else hidePanel();
}

async function showTerminal(cx, space, address) {
  select(space, address);
  await focusTerminal(cx, address);
}

async function step(cx, by) {
  const space = activeSpace();
  const list = terminalsOf(space);
  if (list.length < 2) return;
  const at = list.findIndex((t) => t.address === pick(space)?.address);
  await showTerminal(cx, space, list[(at + by + list.length) % list.length].address);
}

function killTerminal(address) {
  run("terminal.kill", { terminal: address });
}

// Ends a terminal; when it had the keyboard, the space's next one takes it.
async function closeTerminal(cx, address) {
  const f = focused();
  const hadKeyboard = Boolean(f) && !f.pane && f.terminal === address;
  killTerminal(address);
  if (!hadKeyboard) return;
  for (let i = 0; i < 40 && panelTerminals().some((t) => t.address === address); i++) await cx.sleep(50);
  const next = pick(activeSpace());
  if (next && next.address !== address) await focusTerminal(cx, next.address);
}

export default class TermPanel extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "list";
    this.hover = null;
    this.lastSelect = null;
    this.orphans = {};
    this.space = undefined;
    this.pending = null;
    if (checking() || this.role !== "toggle") return;

    // The layout file follows the live terminals: one block per panel terminal.
    cx.spawn(async (cx) => {
      for (;;) {
        if (!bus.dirty) await new Promise((resolve) => { bus.wake = resolve; });
        bus.wake = null;
        bus.dirty = false;
        try {
          await this.writeLayout();
        } catch (error) {
          console.log(`term-panel: layout not written: ${error?.message ?? error}`);
          await cx.sleep(1500);
        }
        await cx.sleep(150);
        cx.notify();
      }
    });

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "toggle") await togglePanel(cx);
        else if (command === "focus") await openPanel(cx);
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

  blocksDiffer() {
    const { view } = panelNodes();
    if (!view) return false;
    const have = (view.children ?? []).map((c) => c.content?.terminal).filter(Boolean).sort();
    const want = panelTerminals().map((t) => t.address).sort();
    const hasEmpty = (view.children ?? []).some((c) => c.id === EMPTY);
    return !hasEmpty || have.length !== want.length || have.some((a, i) => a !== want[i]);
  }

  async writeLayout() {
    if (!panelNodes().view) return;
    const path = `${appHome()}/layouts/${shared("layout")}.json`;
    const text = await readTextFile(path);
    if (text === null) return;
    const tree = JSON.parse(text);
    const view = find(tree, VIEW);
    if (!view) return;
    const want = panelTerminals().map((t) => t.address);
    const before = JSON.stringify(view.children ?? []);
    const kept = (view.children ?? []).filter((c) => c.content?.terminal && want.includes(c.content.terminal));
    const known = kept.map((c) => c.content.terminal);
    const empty = (view.children ?? []).find((c) => c.id === EMPTY)
      ?? { id: EMPTY, type: "block", content: { mod: "term-panel", props: { role: "empty" } } };
    view.children = [
      empty,
      ...kept,
      ...want.filter((a) => !known.includes(a)).map((a) => ({ id: childId(a), type: "block", content: { terminal: a } })),
    ];
    if (JSON.stringify(view.children) === before) return;
    await writeTextFile(path, `${JSON.stringify(tree, null, 2)}\n`, text);
  }

  // A closed space's panel terminals end with it, as its panes do.
  endOrphans() {
    const all = spaces();
    if (!all.length) return;
    const seen = {};
    for (const terminal of panelTerminals()) {
      const id = terminal.labels[LABEL];
      const machine = id.includes("/") ? id.split("/")[0] : null;
      const ready = machines().some((m) => (m.name ?? null) === machine && m.layout === "ready");
      if (!ready || all.some((s) => s.id === id)) continue;
      seen[terminal.address] = (this.orphans[terminal.address] ?? 0) + 1;
      if (seen[terminal.address] >= 3) killTerminal(terminal.address);
    }
    this.orphans = seen;
  }

  // What closed spaces left behind in the shared state goes once their machine says they are gone.
  forgetClosed() {
    const all = spaces();
    if (!all.length) return;
    const gone = (id) => {
      const machine = id.includes("/") ? id.split("/")[0] : null;
      return machines().some((m) => (m.name ?? null) === machine && m.layout === "ready") && !all.some((s) => s.id === id);
    };
    for (const key of [OPEN, SELECTED]) {
      const stored = record(key);
      const dead = Object.keys(stored).filter(gone);
      if (dead.length) setShared(key, Object.fromEntries(Object.entries(stored).filter(([id]) => !dead.includes(id))));
    }
  }

  // The panel is open or closed per space. Arriving at a space sets the layout's
  // one flag to what that space had (closed if it never had a panel), unless
  // turnTo() already did; a change made while a space shows is recorded as that space's.
  syncOpen(space, panel) {
    if (!space) return;
    const open = !panel.hidden;
    const stored = record(OPEN);
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
        run(want ? "layout.show" : "layout.hide", { id: PANEL });
        return;
      }
    }
    // Until that lands, what the layout still says is not a choice.
    if (this.pending) {
      if (this.pending.want !== open && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (stored[space.id] !== open) setShared(OPEN, { ...stored, [space.id]: open });
  }

  // The panel follows the active space: open or closed, and on its terminal.
  // Called on every controller render.
  reconcile() {
    const { panel, view } = panelNodes();
    if (!panel || !view) return;
    const f = focused();
    if (f?.pane) bus.lastPane[f.tab] = f.pane;
    if (this.blocksDiffer()) kick();
    const space = activeSpace();
    this.syncOpen(space, panel);
    const terminal = pick(space);
    // Recorded even when it is only the newest, so turnTo() knows it before the space shows.
    if (terminal) select(space, terminal.address);
    const want = terminal ? childId(terminal.address) : EMPTY;
    if (view.active === want || !(view.children ?? []).some((c) => c.id === want)) return;
    const now = Date.now();
    if (this.lastSelect?.child === want && now - this.lastSelect.at < 400) return;
    this.lastSelect = { child: want, at: now };
    run("layout.select", { stack: VIEW, child: want });
  }

  iconButton(t, id, icon, onClick) {
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(look().corner(5))
      .text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(onClick).child(svg(`${ICONS}/${icon}.svg`).size(14));
  }

  renderToggle(t) {
    this.reconcile();
    const { panel } = panelNodes();
    const open = Boolean(panel) && !panel.hidden;
    // Plain text like the status bar's own entries: its mod already leaves 14px before this block.
    return h_flex().size_full().items_center().bg(t.chrome).border_t(look().line).border_color(t.border)
      .text_size(11.8)
      .child(
        h_flex().id("term-panel-toggle").h_full().flex_none().gap(5).items_center().cursor_pointer()
          .text_color(open ? t.foreground : t.muted)
          .hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { cx.spawn((cx) => togglePanel(cx)); })
          .child(svg(`${ICONS}/terminal.svg`).size(13))
          .child("Terminal"),
      );
  }

  renderEmpty(t) {
    return v_flex().size_full().items_center().justify_center().gap(10).bg(t.background).text_size(12.5).text_color(t.muted)
      .child("No terminal in this space")
      .child(
        h_flex().id("term-panel-first").h(26).px(10).gap(6).items_center().rounded(look().corner(6)).cursor_pointer()
          .border(1).border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { cx.spawn((cx) => newTerminal(cx)); })
          .child(svg(`${ICONS}/plus.svg`).size(13))
          .child("New terminal"),
      );
  }

  renderList(t) {
    const space = activeSpace();
    const list = terminalsOf(space);
    const shown = pick(space)?.address ?? null;
    const f = focused();
    const row = (terminal, index) => {
      const address = terminal.address;
      const on = address === shown;
      const hasKeyboard = on && f && !f.pane && f.terminal === address;
      const program = terminal.program;
      const name = terminal.name || program?.name || "shell";
      return h_flex().id(`term-row-${address}`).h(28).mx(4).px(8).gap(7).flex_none().items_center().rounded(look().corner(6)).cursor_pointer()
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
          el.child(this.iconButton(t, `term-kill-${address}`, "x", (_e, cx) => { cx.stop_propagation(); cx.spawn((cx) => closeTerminal(cx, address)); })));
    };
    return v_flex().size_full().min_w(0).bg(t.background).border_l(look().line).border_color(t.border).text_size(12.5)
      .child(
        h_flex().h(30).flex_none().pl(12).pr(6).gap(2).items_center().border_b(look().line).border_color(t.border)
          .child(div().flex_1().text_size(11).font_semibold().text_color(t.dim).child("TERMINALS"))
          .child(this.iconButton(t, "term-panel-new", "plus", (_e, cx) => { cx.spawn((cx) => newTerminal(cx)); }))
          .child(this.iconButton(t, "term-panel-hide", "chevron-down", () => hidePanel())),
      )
      .child(
        v_flex().id("term-panel-rows").flex_1().min_h(0).py(4).gap(2).overflow_y_scrollbar()
          .children(list.map(row))
          .when(list.length === 0, (el) => el.child(div().px(12).py(6).text_color(t.dim).child("None yet"))),
      );
  }

  render() {
    const t = theme();
    if (this.role === "toggle") return this.renderToggle(t);
    if (this.role === "empty") return this.renderEmpty(t);
    return this.renderList(t);
  }
}
