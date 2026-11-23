# herdr-mods

Two pieces for the [Herdr](https://herdr.dev) desktop app. Each folder is laid out like Herdr's home (`~/.config/herdr-app`) and stands alone.

| Piece | Kind | What it is |
|---|---|---|
| [`term-panel/`](term-panel/RECIPE.md) | mod | A terminal panel under the tab, as in VS Code: toggle it with a key, switch between the space's terminals in a list. Per space. |
| [`voxel-neon/`](voxel-neon/RECIPE.md) | layout | A square, neon look with an animated pixel city in the sidebar. |

Neither needs the other. Used together, the panel takes the layout's square corners and 2px lines.

## Adding one

Ask the agent in your Herdr window to add `term-panel` or `voxel-neon` from this repository. It reads the piece's `RECIPE.md`, copies the files into your home and fits them to your setup. By hand:

- **voxel-neon**: copy `layouts/`, `themes/` and `mods/` into `~/.config/herdr-app`, then `herdr-app do layout.switch '{"name":"voxel-neon"}'`.
- **term-panel**: copy `mods/term-panel`, add the two nodes from `layout-nodes.json` to a layout of your own (the panel under the tab block, the toggle beside the status bar), and merge `keys.json` under that layout's section.

`term-panel` runs `hc` and rewrites the shown layout's file; `voxel-neon`'s spaces list runs `hc`, `git` and its own Python and shell scripts. Read a piece before adding it: mods are trusted code.

## Checks

```sh
ocx pull                    # herdr-app, herdr-core and node, as locked in ocx.lock
ocx exec -- node scripts/check.mjs
```

`scripts/check.mjs` copies every piece into a throwaway home and has the pinned Herdr load and render each mod (`herdr-app check`), validates the layout (mods, ids, theme, preview), and type-checks the mods written here against the declarations of that Herdr version. CI runs the same on every push. `types/herdr.d.ts` is a copy of the file Herdr writes to its home; refresh it when `ocx.lock` moves to a new Herdr.

Mods are plain JavaScript: Herdr loads `mods/<name>/main.js` as it is, so what is in this repository is what runs.
