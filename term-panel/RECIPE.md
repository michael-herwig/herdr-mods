# Terminal panel

A terminal panel under the tab, as in VS Code. One key or a click on `Terminal` in the status bar slides it in below the panes; it shows one terminal at a time, and a list on its right switches between the terminals of the space, starts new ones and closes them. Every space has its own panel: its own terminals, the one it shows, and whether it is open, also after a restart.

![Terminal panel](preview.png)

## What you see

- **The panel**, under the tab's panes, 320px high (drag its top edge: 120 to 900px). Hidden until asked for. Background `background`, a 1px `border` frame.
  - **Left, the terminal**: a live terminal of the space, full size.
  - **Right, the list**, 230px wide (150 to 420px), a 1px `border` line on its left.
    - A 30px header: `TERMINALS` (11px, semibold, `dim`), then a `+` button (new terminal) and a chevron-down button (hide the panel). Buttons are 22px squares, 5px corners, `dim`, `hover` background and `foreground` on hover.
    - One 28px row per terminal, 12.5px text: a 2px by 14px marker, the program's icon, `<number>  <name>` (the program's name, `shell` for a shell), then its folder's last two parts in `dim`. The shown terminal's row has the `selected` background and `foreground` text, the others `muted`. An `x` button appears on the shown row and on a hovered row.
    - `None yet` in `dim` while the space has no terminal.
  - While the space has no terminal the left side says `No terminal in this space` (`muted`) over a `New terminal` button (26px high, 1px `border`, 6px corners).
- **The toggle**, in the status bar: a terminal icon and `Terminal`, 11.8px, `muted`, `foreground` while the panel is open or the pointer is on it. Its block is 82px wide.

A layout that squares the panel (`"radius": 0` on the `term-panel` node) gets square rows and buttons, and the lines take the width of the node's border.

## How it behaves

- `ctrl-'` toggles the panel. Opening it gives the keyboard to the space's terminal, and starts one if the space has none. Hiding it gives the keyboard back to the pane that had it.
- `ctrl-shift-'` shows the panel, starts a new terminal and gives it the keyboard. It starts in the focused pane's folder, on the space's machine.
- `ctrl-shift-down` puts the keyboard in the panel, `ctrl-shift-up` back in the tab.
- A click on a row shows that terminal and gives it the keyboard. The marker on the row is `accent` while that terminal has the keyboard.
- The `x` ends a terminal. If it had the keyboard, the space's next terminal gets it.
- A panel terminal is not a tab and not a pane: it never shows in the tab bar or the sidebar. It keeps running while the panel is hidden, while another space shows, and when the window closes.
- Closing a space ends its panel terminals (within about 15 seconds).
- **Per space.** Each space remembers whether its panel is open and which terminal it shows. A space that never had a panel starts closed. Switching spaces turns the panel to the space arrived at.
- **No frame of the wrong panel.** With the space keys below, the panel changes in the same frame as the space. Any other way of switching (a click in a sidebar that doesn't know the panel, a toast) is followed one frame later: for about 17ms the new space shows with the old space's panel.
- Agent statuses do not change how anything here looks.

## Built from

- One mod, `mods/term-panel`, placed three times, told apart by `props.role`:
  - `toggle`: the status bar button. It is always shown, so it is also the controller: it writes the layout's terminal blocks, answers the key commands and follows the active space.
  - `list`: the list beside the terminal.
  - `empty`: what the panel shows while the space has no terminal.
- Layout nodes (`layout-nodes.json` has both, ready to paste):
  - `term-panel`, a `row`, `hidden`, 320px, placed in a `column` under the block that shows `{ "tab": "active" }`. Its children: `term-view`, a `stack` holding `term-empty` (the mod, role `empty`) and later one terminal block per panel terminal; and `term-list` (the mod, role `list`).
  - `term-toggle`, a block with role `toggle`, 82px, placed in a `row` next to the status bar's block.
  - The mod finds these by id. Other names do not work.
- A panel terminal is a herdr-core terminal started with `hc run --bg --keep --rm --no-parent --no-notify --json --label termpanel.space=<space id>` (plus `--on <machine>` and `--cwd`). It has no `herdr.tab` label, which is what keeps it out of the tabs.
- A layout shows a terminal only through a block, so the controller keeps the layout file in step: it reads `layouts/<shown layout>.json`, sets `term-view`'s children to `term-empty` plus one `{ "terminal": "<address>" }` block per live panel terminal (id `term-` + the address with every character outside `A-Z a-z 0-9` as `_`), and writes it back with `writeTextFile(path, text, expected)` so a concurrent edit is not lost. It never uses `layout.set`, which would wipe the layout's clicks.
- Shared state: `term-panel.open` `{ <space id>: true | false }`, `term-panel.selected` `{ <space id>: <terminal address> }`. Entries of closed spaces are dropped once their machine is `ready` and no longer lists them.
- `herdr` functions: `spaces`, `machines`, `terminals`, `panes`, `focused`, `layout`, `theme`, `run`, `hc`, `props`, `shared`, `setShared`, `appHome`, `nextCommand`, `notify`, `checking`, `readTextFile`, `writeTextFile`.
- Commands: `layout.show`, `layout.hide`, `layout.select`, `pane.focus`, `terminal.kill`, `space.next`, `space.prev`, `space.select`.
- Mod commands (`keys.json`, in the section of the layout that holds the panel): `term-panel.toggle`, `.focus`, `.back`, `.new`, `.next`, `.prev`, `.kill`, and the space keys `term-panel.space-next`, `.space-prev`, `.space-1` to `.space-9`. The space keys turn the panel to the target space (`turnTo`) and then run Herdr's own space command in the same step.
- Art: `terminal.svg`, `plus.svg`, `x.svg`, `chevron-down.svg`, 16px line icons tinted with the text color.
- It runs a program (`hc`), and it reads and writes one file outside its folder: the shown layout's JSON.

## Watch out

- A mod cannot place itself. Someone adds the two nodes to a layout; shipped layouts are read-only, so clone one first (`layout.clone`).
- `keys.json` here uses the section `layout:my-layout`. Rename it to the layout that holds the panel. Not `global`: mod commands only reach a shown copy, and in a layout without the panel `alt-1` would do nothing.
- A change a mod makes with `run()` while rendering lands one frame after the frame it reacted to. That is where the one wrong frame comes from, and why following the active space is only the fallback. A mod that switches spaces can spare it: before `space.select`, read the two shared maps above and run `layout.select { stack: "term-view", child }` and `layout.show` or `layout.hide { id: "term-panel" }` in the same handler.
- At a start the active space can be a stand-in until every machine has answered. The controller waits for `machines()` to have none `loading` before it trusts the active space; without that a start flips the panel to the wrong space's state.
- At a start the layout's own saved clicks already show the panel as the last space left it. Do not default to open or closed and correct later.
- The layout file is rewritten whenever a panel terminal starts or ends, so it holds addresses of this machine's terminals. Strip `term-view` back to `term-empty` before sharing a layout.
- `init()` runs for real under `herdr-app check`: the controller returns early when `checking()`.
- `focused().pane` is null while a layout terminal block has the keyboard; `pane.focus { terminal }` is how the panel's terminal gets it, and it only works once the panel is shown and the stack is on that terminal, so the mod retries for up to 3 seconds.
- A terminal on another machine paints about 60ms after its block shows.
- `.next`, `.prev` and `.kill` have no default keys.

## Done when

- `herdr-app check mods/term-panel` passes and `herdr-app status` lists no errors.
- `ctrl-'` in a space without a panel terminal opens the panel with a new shell that has the keyboard; `ctrl-'` again hides it and typing reaches the pane again.
- `ctrl-shift-'` twice gives two rows; a click on row 1 shows that terminal.
- The terminals are in `hc ls` with the label `termpanel.space`, and not in the tab bar.
- Open the panel in space A, go to space B: closed. Back to A: open, on the same terminal. Restart the app: the same.
- With `alt-2` bound to `term-panel.space-2`, switching from a space with the panel open to one with it closed never shows the panel in the new space.
- Close a space that has panel terminals: within 15 seconds they are gone from `hc ls`.
