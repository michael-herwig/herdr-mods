# Voxel Neon

A dark neon layout built from square blocks: every corner is square, every line is 2px, spaces are isometric cubes, and a small pixel city sits at the bottom of the sidebar with windows that fade on and off, a car on the road and a flyer in the sky. Text stays in the normal fonts; only the `HERDR` wordmark is pixel type.

![Voxel Neon](preview.png)

## What you see

Colors are the theme `themes/voxel-neon.json`: canvas `#08060f`, chrome `#0e0a1c`, terminal background `#0b0818`, text `#ece8ff`, borders `#2e2160` (stronger `#46349a`), accent magenta `#ff3bd4`, cyan `#2ee8ff`, lime `#b9ff45`, yellow `#ffe45c`.

Left to right:

- **Sidebar**, 358px (44 to 480px), background `chrome`, a 2px `border` line on its right.
  - **Brand row**, 46px, 2px line below: a 22px isometric cube in `accent` (three faces at 100%, 62% and 36%), the pixel wordmark `HERDR` (66 by 14px, `foreground`), then a search button and a fold-sidebar button (26px squares).
  - **Spaces**, 1.33 parts of the height: one row per space, grouped by machine, each with an 18px cube in the space's color, its name, and its tabs folded under it.
  - **Agents**, 0.67 parts: every agent with its status.
  - **Skyline**, 92px: the city (below).
  - **Footer**, 69px, 2px line above: `Settings` and `Add machine` rows, 28px each.
- **Work area.**
  - **Tab bar**, 42px, 2px line below: the tabs, then `Files` and `Changes` buttons, and window buttons where the system draws none.
  - **Panes**, 10px from the edges and from each other: each pane is a card with a 30px header, a 2px `border` frame that turns `accent` on the pane with the keyboard, square corners, terminal padding 14px by 12px.
  - **Files / Changes panel**, 368px (280 to 900px), on the right, hidden until opened from the tab bar.
  - **Status bar**, 28px, 2px line above.

The skyline, back to front: 1px stars (`muted`), a row of far towers (`hover`, 2px `border` top, some with a 2px red beacon), a flyer (14 by 5px, cyan body, yellow dome, red lamp), a row of near blocks (`raised`, a 3px top edge in `input` or neon, a 3px shaded right side, 4px windows in cyan, yellow, magenta, lime and blue), a 14px road (`canvas`, 2px line above, 8px lane marks every 22px), and a car (20 by 10px: magenta body, cyan cabin, yellow headlight, red tail light).

## How it behaves

- **Statuses** use the theme's colors everywhere they show: working `#2ee8ff`, blocked `#ffe45c`, done `#b9ff45`, idle `#8b82bd`. A working tab shows a spinning ring, a blocked or done one a 6px square.
- **The city moves.** About a quarter of the windows are steady; the others fade between 8% and 100% over 1.8 to 5.4 seconds, each on its own period. Stars twinkle, beacons blink (0.8 to 1.5 seconds), the flyer's lamp blinks every 0.6 seconds. The car drives left to right in 3px steps every 70ms, then stays off screen for about 4 seconds; the flyer crosses right to left every 110ms per step and stays away about 10 seconds.
- **A click on the city** stops it (the car parks, the flyer is gone, windows hold) or starts it again. The choice is kept (shared `voxel-neon.still`).
- The city is the same on every start, and grows or shrinks with the sidebar's width.
- Everything else behaves as in Herdr's default layout: a click on a space or agent goes there, right-click opens its menu, the fold button narrows the sidebar to a 44px rail, `Files` and `Changes` are remembered per space.

## Built from

- `layouts/voxel-neon.json`: `root` (row, `titlebar: none`, divider 2px) holds `sidebar` (column: `brand`, `sidebar-lists` (column: `spaces`, `agents`), `skyline`, `sidebar-footer`) and `work` (column: `tabs`, `work-body` (row, padding 10, gap 10: `main-col` (column: `main`, the tab block with the pane frame), `panel` (column, hidden: `panel-body`, a stack of `files` and `changes`)), `status-row` (row: `status`)).
- `layouts/voxel-neon.svg`: the 320 by 200 picture for the settings screen.
- `themes/voxel-neon.json`: named like the layout, so Settings offers it only here.
- `mods/voxel-neon`, written for this layout, placed three times by `props.role`: none (the brand row), `skyline`, `footer`. Art: `cube.svg`, `wordmark.svg`, `search.svg`, `sidebar.svg`, `settings.svg`, `plus.svg`.
- Seven clones of Herdr 0.1.16 mods, restyled: every `.rounded()` removed, every 1px and 1.5px line made 2px.
  - `voxel-spaces` (from the Over9k `nested-tabs` sidebar; MIT, `LICENSE-over9k`): cube avatars from `mods/voxel-neon/cube.svg`, six neon space colors.
  - `voxel-agents` (`agents`), `voxel-tabs` (`tabs-bar`), `voxel-pane` (`pane`), `voxel-status` (`status-bar`), `voxel-files` (`files`), `voxel-changes` (`changes`).
- Shipped mods used through their files or overlays: `workspace-chrome` (spinner and icons), `pane`, `files`, `changes` (icons), `picker`, `machine-add`, `menu`, `new-menu`.
- `herdr` functions in `voxel-neon`: `theme`, `run`, `props`, `window`, `shared`, `setShared`, `updates`, `layout`. Commands: `mod.open`, `app.settings`, `layout.resize`.
- Programs: `voxel-spaces` runs `hc`, `git`, and its `claude-info.py`, `codex-info.py` (Python) and `subagents.sh` to read agents' session files, here or on the space's machine. Nothing reaches the network.

## Watch out

- `.loop()` swings there and back, so it cannot drive a car one way, and every loop is symmetric. The vehicles ride an invisible `.frames()` spacer instead: a run of `█` that grows by one each tick (JetBrains Mono at 5px, about 3px a block, `opacity(0)`, `whitespace_nowrap`) inside an `h_flex` that pushes the vehicle along. Held at full length for the rest ticks, then it starts over.
- All motion is native (`loop`, `frames`): no timer, no re-render. The window still repaints about 30 times a second while the city shows; the click that stops it is there for that.
- Mods hard-code their corners. A square look needs the clones, and clones are never updated by Herdr: after a Herdr update, compare them with the shipped mods they came from.
- Popups, dialogs and toasts keep Herdr's rounded frame.
- The spaces and agents lists carry a `selectSpace` / `focusAgent` helper for the Terminal panel mod of this repository. Without that mod in the layout they are a plain `space.select` and `pane.focus`.
- One border color per element: a block's lit top edge and its shaded side are two elements.
- Beacons with one period blink in step; theirs differ by position.
- `mods/voxel-spaces` keeps its space-color choices in shared `space.colors`.
- Built and looked at on Windows at zoom 1.2. macOS traffic lights are placed (`traffic_lights: [12, 16]`) but not looked at.

## Done when

- `herdr-app check` passes for all eight mods, and after `layout.switch { "name": "voxel-neon" }`, `herdr-app status` lists no errors.
- No rounded corner in the sidebar, tab bar, panes, panels or status bar.
- The focused pane's frame is magenta, 2px.
- Two screenshots a second apart (`herdr-app shot`) show the car at different places, further right in the second.
- A click on the city stops the car; another starts it.
- Dragging the sidebar wider adds buildings.
