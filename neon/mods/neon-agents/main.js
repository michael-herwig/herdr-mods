// Built from src/neon-agents/main.ts: change it there, then `task build`.
// https://github.com/michael-herwig/herdr-mods
//
// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
//
// @ts-nocheck: cloned from Herdr 0.1.16's `agents` mod and restyled for Neon. It stays close to
// what Herdr ships so a later version can be compared with it; `herdr-app check` is its test.


// src/neon-agents/main.ts
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run as run2, theme, shared as shared2, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout as layout2 } from "herdr";

// src/lib/drawer-link.ts
import { run, shared } from "herdr";

// src/lib/layout.ts
import { layout } from "herdr";
function find(node2, id) {
  if (node2?.id === id) return node2;
  for (const child of node2?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
var node = (id) => find(layout(), id);

// src/lib/drawer-link.ts
var DRAWER = "drawer";
var DRAWER_VIEW = "drawer-view";
var DRAWER_EMPTY = "drawer-empty";
var DRAWER_OPEN = "drawer.open";
var DRAWER_SELECTED = "drawer.selected";
var drawerBlock = (address) => `drawer-term-${address.replace(/[^A-Za-z0-9]/g, "_")}`;
function bySpace(key) {
  return shared(key) ?? {};
}
function turnDrawerTo(spaceId) {
  const panel = node(DRAWER);
  const view = node(DRAWER_VIEW);
  if (!panel || !view) return;
  const address = bySpace(DRAWER_SELECTED)[spaceId];
  const child = address ? drawerBlock(address) : DRAWER_EMPTY;
  if (view.active !== child && (view.children ?? []).some((c) => c.id === child)) run("layout.select", { stack: DRAWER_VIEW, child });
  const open = Boolean(bySpace(DRAWER_OPEN)[spaceId]);
  if (open === Boolean(panel.hidden)) run(open ? "layout.show" : "layout.hide", { id: DRAWER });
}

// src/neon-agents/main.ts
function focusAgent(a) {
  turnDrawerTo(a.space);
  run2("pane.focus", { pane: a.pane });
}
function find2(node2, id) {
  if (node2?.id === id) return node2;
  for (const child of node2?.children ?? []) {
    const found = find2(child, id);
    if (found) return found;
  }
  return null;
}
var narrow = () => (find2(layout2(), "sidebar")?.size?.px ?? Infinity) < 160;
function toggleSidebar() {
  const width = find2(layout2(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run2("layout.resize", { id: "sidebar", px: narrow() ? shared2("sidebar.width") ?? 268 : window()?.platform === "macos" ? 76 : 44 });
}
var clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();
function leadPanes(all) {
  const leads = /* @__PURE__ */ new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || !current.program?.agent && (p.program?.agent || !current.focused && p.focused)) leads.set(p.tab, p);
  }
  return leads;
}
function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
var RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
var kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
var SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" }
];
var sortOf = () => SORTS.find((s) => s.id === shared2("agents.sort")) ?? SORTS[0];
var SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
var SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };
function duration(ms) {
  const m = Math.floor(ms / 6e4);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
var Agents = class extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = /* @__PURE__ */ new Set();
    try {
      this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    } catch {
      this.changed = {};
    }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try {
      this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    } catch {
      this.pendingPins = [];
    }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = /* @__PURE__ */ new Set();
    cx.timer.every(3e4, (cx2) => cx2.notify());
  }
  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 864e5) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }
  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run2("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }
  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }
  rank(a) {
    return RANK[a.status] ?? 0;
  }
  sortMenu(t) {
    const on = sortOf().id;
    return v_flex().w_full().p(5).bg(t.popover).text_size(12.8).child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents")).children(SORTS.map((s) => h_flex().id(`sort-${s.id}`).h(31).px(8).gap(9).items_center().text_color(t.foreground).hover((el) => el.bg(t.hover)).on_click(() => {
      setShared("agents.sort", s.id);
      closeOverlay(props().overlay);
    }).child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted)).child(div().flex_1().child(s.label)).when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }
  peek(addr) {
    run2("terminal.peek", { terminal: addr });
  }
  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"])
      ];
    });
  }
  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex().id(`sub-${k.address}`).pl(39).pr(8).h(26).flex_none().gap(0).items_center().text_size(12.5).when(on, (el) => el.bg(t.raised)).hover((s2) => s2.bg(t.hover)).on_click(() => this.listed.has(k.address) ? run2("pane.focus", { terminal: k.address }) : this.peek(k.address)).children(s.lines.map((l) => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none().when(Boolean(l), (el) => el.border_l(2).border_color(t.input)).when(l === "└" || l === "├", (el) => el.border_b(2)))).when(Boolean(pic), (el) => el.child(div().mr(8).child(pic))).child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address)).child(this.status(t, { status: st }, compact));
  }
  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (a.status === "idle") return div().size(7).mx(3).flex_none().border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().bg(a.status === "done" ? color : t.dim + "00");
  }
  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = /* @__PURE__ */ new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));
    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => (RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m, null);
      const open = !this.folded.has(a.address);
      return div().id(`fold-${a.address}`).h(18).px(3).gap(3).flex().items_center().text_size(11).text_color(open ? t.dim : t[top] ?? t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx2) => {
        cx2.stop_propagation();
        open ? this.folded.add(a.address) : this.folded.delete(a.address);
        cx2.notify();
      }).child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none()).when(!open, (el) => el.child(String(subs.length)));
    };
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const labels = new Map(list.map((a) => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : a.title || a.program?.name || ""];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) {
      const k = `${a.space_name}\0${detail.get(a.address) ?? ""}`;
      seen[k] = (seen[k] ?? 0) + 1;
    }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\0`] > 1) detail.set(a.address, label(a));
    }
    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex().id(`ag-${a.address}`).h(26).px(8).flex_none().items_center().gap(4).hover((s) => s.bg(t.hover)).on_click(() => focusAgent(a)).child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1))).child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div().id(`pin-${a.address}`).flex_none().p(2).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(isPinned ? "Unpin" : "Pin to the top").on_click((_e, cx2) => {
        cx2.stop_propagation();
        run2("terminal.pin", { terminal: a.address, pinned: !isPinned });
        this.hovered = null;
        cx2.notify();
      }).child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex().id(`ag-${a.address}`).px(8).h(30).flex_none().items_center().gap(9).when(a.focused, (el) => el.bg(t.selected)).cursor_pointer().hover((s) => s.bg(t.hover)).on_hover((on, cx2) => {
        if (on) this.hovered = a.address;
        else if (this.hovered === a.address) this.hovered = null;
        cx2.notify();
      }).on_click(() => focusAgent(a)).when(Boolean(pic), (el) => el.child(div().id(`agent-fold-${a.address}`).when(subs.length > 0, (el2) => el2.on_click((_e, cx2) => {
        cx2.stop_propagation();
        this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
        cx2.notify();
      })).child(pic))).child(h_flex().flex_1().min_w(0).gap(5).items_center().child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name)).when(full && Boolean(more), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${more}`)))).when(Boolean(machine), (el) => el.child(div().text_size(10).text_color(t.dim).child(machine))).when(subs.length > 0, (el) => el.child(fold(a, subs))).when(this.hovered === a.address, (el) => el.child(pin)).when(this.hovered !== a.address && Boolean(when), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when)))).child(this.status(t, a, byPriority && !isPinned));
    };
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => (RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m, null);
      return h_flex().id(g.id).px(8).pt(8).h(30).flex_none().gap(6).items_center().text_size(11).font_medium().cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx2) => {
        open ? this.folded.add(g.id) : this.folded.delete(g.id);
        cx2.notify();
      }).child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label)).when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length)))).child(div().flex_1()).when(!open, (el) => el.when(!byPriority && top && top !== "idle", (el2) => el2.child(this.status(t, { status: top }, true))).child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed ? list.flatMap(withKids) : groups.flatMap((g) => [header(g), ...this.folded.has(g.id) ? [] : g.members.flatMap(withKids)]);
    return v_flex().size_full().min_h(0).bg(t.chrome).border_t(2).border_color(t.border).text_size(13).when(
      !collapsed,
      (el) => el.child(
        h_flex().px(16).h(41).pt(14).pb(5).flex_none().items_center().justify_between().child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents")).child(
          div().id("ag-sort").text_size(11).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(() => openOverlay({ mod: "neon-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } })).tooltip(`Sort agents: ${sort.label}`).child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14))
        )
      )
    ).when(
      list.length === 0 && !collapsed,
      (el) => el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not."))
    ).child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows)).when(
      collapsed,
      (el) => el.child(
        h_flex().h(28).items_center().justify_center().child(
          div().id("collapse").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(toggleSidebar).child("»")
        )
      )
    );
  }
};
export {
  Agents as default
};
