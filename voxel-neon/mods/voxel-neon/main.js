// Voxel Neon: the theme's own blocks in the sidebar. props.role picks one:
//   (none)      the brand row: cube, pixel wordmark, search, fold the sidebar.
//   "footer"    Settings and Add machine.
//   "skyline"   the city above the footer: windows that fade on and off, a car
//               on the road, a flyer behind the towers. A click stops or starts
//               the motion (shared "voxel-neon.still").
//
// Everything that moves is native (`loop`, `frames`): no timer, no re-render.
// `loop` swings there and back, so it can't drive a car one way. The vehicles
// ride a `frames` spacer instead: an invisible run of blocks that grows by one
// each tick and pushes the car along its lane.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

const ART = "mods/voxel-neon";
const STILL = "voxel-neon.still";
const ROAD = 14;
const STEP_FONT = 5; // the spacer's text size; one block is about 3px wide
const STEP = 3;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// The same city on every start: a seeded generator, not Math.random.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Buildings for a strip `width` wide. Lights are indexes into the theme's neon colors.
function city(width) {
  const far = [], near = [], stars = [];
  let next = seeded(7);
  for (let x = 0; x < width; ) {
    const w = 16 + Math.floor(next() * 5) * 4;
    const h = 34 + Math.floor(next() * 10) * 4;
    far.push({ x, w, h, beacon: h >= 62 });
    x += w + 4;
  }
  next = seeded(23);
  for (let x = 6; x < width; ) {
    const w = 14 + Math.floor(next() * 5) * 4;
    const h = 16 + Math.floor(next() * 10) * 4;
    const windows = [];
    for (let wy = 6; wy + 4 <= h - 4; wy += 9) {
      for (let wx = 4; wx + 4 <= w - 6; wx += 7) {
        if (next() > 0.42) continue;
        windows.push({ x: wx, y: wy, light: Math.floor(next() * 5), period: 1800 + Math.floor(next() * 9) * 450, steady: next() < 0.25, rising: next() < 0.5 });
      }
    }
    near.push({ x, w, h, windows, lit: next() < 0.2 ? Math.floor(next() * 2) : null });
    x += w + 3;
  }
  next = seeded(51);
  for (let x = 10; x < width; x += 22 + Math.floor(next() * 30)) {
    stars.push({ x, y: 3 + Math.floor(next() * 22), period: next() < 0.4 ? 2400 + Math.floor(next() * 6) * 500 : null });
  }
  return { far, near, stars };
}

// One more block per tick, then held off the far edge for `rest` ticks.
function ride(distance, rest) {
  const steps = Math.ceil(distance / STEP) + 10;
  const list = [];
  for (let i = 1; i <= steps; i++) list.push("█".repeat(i));
  for (let i = 0; i < rest; i++) list.push(list[steps - 1]);
  return list;
}

export default class VoxelNeon extends View {
  init() {
    this.role = props()?.role ?? "brand";
    this.width = 280;
    this.built = null;
  }

  button(t, id, label, action) {
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }

  renderBrand(t) {
    const collapsed = narrow();
    return h_flex().size_full().bg(t.chrome).border_b(2).border_color(t.border).pl(collapsed ? 6 : 12).pr(10).gap(4).items_center()
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(10).items_center()
        .child(svg(`${ART}/cube.svg`).size(22).flex_none().text_color(t.accent))
        .child(svg(`${ART}/wordmark.svg`).w(66).h(14).flex_none().text_color(t.foreground))))
      .when(!collapsed, el => el.child(this.button(t, "search", svg(`${ART}/search.svg`).size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button(t, "sidebar-toggle", svg(`${ART}/sidebar.svg`).size(15), toggleSidebar)));
  }

  renderFooter(t) {
    const collapsed = narrow();
    const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center()
      .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
      .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(`${ART}/${icon}.svg`).size(14))
      .when(!collapsed, el => el.child(label));
    const ready = div().size(6).bg(t.accent);
    return v_flex().size_full().bg(t.chrome).border_t(2).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
      .when(collapsed, el => el.px(0).items_center())
      .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
        .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
      .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
  }

  // Drives right along the road.
  car(t) {
    return div().relative().w(20).h(10).flex_none()
      .child(div().absolute().left(5).top(0).w(9).h(4).bg(t.ansi6))
      .child(div().absolute().left(0).top(4).w(20).h(4).bg(t.accent))
      .child(div().absolute().left(18).top(4).size(2).bg(t.ansi3))
      .child(div().absolute().left(0).top(4).size(2).bg(t.ansi1))
      .child(div().absolute().left(3).top(8).w(4).h(2).bg(t.foreground))
      .child(div().absolute().left(13).top(8).w(4).h(2).bg(t.foreground));
  }

  // Flies left, behind the near towers.
  flyer(t, moving) {
    const lamp = div().absolute().left(0).top(2).size(2).bg(t.ansi1);
    return div().relative().w(14).h(5).flex_none()
      .child(div().absolute().left(4).top(0).w(5).h(2).bg(t.ansi3))
      .child(div().absolute().left(0).top(2).w(14).h(2).bg(t.ansi6))
      .child(moving ? lamp.loop("opacity", { from: 1, to: 0.1, period: 600 }) : lamp)
      .child(div().absolute().left(11).top(4).w(3).h(1).bg(t.ansi5));
  }

  spacer(frames, ms) {
    return div().flex_none().opacity(0).whitespace_nowrap().font_family("JetBrains Mono").text_size(STEP_FONT).frames(frames, ms);
  }

  renderSkyline(t) {
    const still = Boolean(shared(STILL));
    const width = Math.max(60, Math.ceil(this.width / 40) * 40);
    if (this.built?.width !== width) {
      this.built = { width, ...city(width + 40), drive: ride(width + 30, 55), fly: ride(width + 24, 90) };
    }
    const { far, near, stars, drive, fly } = this.built;
    const neon = [t.ansi6, t.ansi3, t.accent, t.ansi2, t.ansi4];
    const glow = (el, from, to, period) => (still ? el.opacity(from) : el.loop("opacity", { from, to, period }));

    const star = (s) => {
      const dot = div().absolute().left(s.x).top(s.y).size(1).bg(t.muted);
      return s.period ? glow(dot, 0.9, 0.15, s.period) : dot.opacity(0.5);
    };
    const tower = (b) => div().absolute().left(b.x).bottom(ROAD).w(b.w).h(b.h).bg(t.hover).border_t(2).border_color(t.border)
      .when(b.beacon, el => el.child(glow(div().absolute().left(Math.floor(b.w / 2) - 1).top(-5).size(2).bg(t.ansi1), 1, 0.05, 800 + (b.x % 5) * 170)));
    const block = (b) => div().absolute().left(b.x).bottom(ROAD).w(b.w).h(b.h).bg(t.raised)
      .border_t(3).border_color(b.lit === null ? t.input : neon[b.lit * 2])
      .child(div().absolute().right(0).top(0).bottom(0).w(3).bg(t.canvas))
      .children(b.windows.map((w) => {
        const pane = div().absolute().left(w.x).top(w.y).size(4).bg(neon[w.light]);
        if (w.steady) return pane;
        return w.rising ? glow(pane, 0.08, 1, w.period) : glow(pane, 1, 0.08, w.period);
      }));

    return div().id("skyline").relative().size_full().overflow_hidden().bg(t.chrome).cursor_pointer()
      .tooltip(still ? "Start the city" : "Stop the city")
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .on_click(() => setShared(STILL, !still))
      .children(stars.map(star))
      .children(far.map(tower))
      .when(!still, el => el.child(
        h_flex().absolute().right(-17).top(20).w(2400).h(5).justify_end().items_center()
          .child(this.flyer(t, true)).child(this.spacer(fly, 110))))
      .children(near.map(block))
      .child(div().absolute().left(0).right(0).bottom(0).h(ROAD).bg(t.canvas).border_t(2).border_color(t.border))
      .children(Array.from({ length: Math.ceil(width / 22) + 1 }, (_, i) => div().absolute().left(i * 22).bottom(5).w(8).h(2).bg(t.input)))
      .child(still
        ? div().absolute().left(34).bottom(1).child(this.car(t))
        : h_flex().absolute().left(-24).bottom(1).w(2400).h(10).items_end()
          .child(this.spacer(drive, 70)).child(this.car(t)));
  }

  render() {
    const t = theme();
    if (this.role === "footer") return this.renderFooter(t);
    if (this.role === "skyline") return this.renderSkyline(t);
    return this.renderBrand(t);
  }
}
