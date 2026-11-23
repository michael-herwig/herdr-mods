// Built from src/neon-status/main.ts: change it there, then `task build`.
// https://github.com/michael-herwig/herdr-mods
//
// @ts-nocheck: cloned from Herdr 0.1.16's `status-bar` mod and restyled for Neon. It stays close to
// what Herdr ships so a later version can be compared with it; `herdr-app check` is its test.


// src/neon-status/main.ts
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys } from "herdr";
var WorkspaceStatus = class extends View {
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }
  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const list = agents();
    const needs = list.filter((a) => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().pl(14).pr(15).gap(16).items_center().bg(t.chrome).border_t(2).border_color(t.border).text_size(11.8).text_color(t.muted).child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer")).when(Boolean(space?.branch), (el) => el.child(label("branch", space.branch))).child(h_flex().gap(6).items_center().child(div().size(6).bg(t.dim)).child(`${list.length} agents`).when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`)))).child(div().flex_1()).child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
};
export {
  WorkspaceStatus as default
};
