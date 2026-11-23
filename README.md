# herdr-mods

Two pieces for the [Herdr](https://herdr.dev) desktop app. Each folder is laid out like Herdr's home (`~/.config/herdr-app`) and stands alone.

| Piece | Kind | What it is |
|---|---|---|
| [`drawer/`](drawer/RECIPE.md) | mod | A terminal panel under the tab, as in VS Code: one key slides it in, a list switches between the space's terminals. Every space has its own. |
| [`neon/`](neon/RECIPE.md) | layout | A square, neon look with an animated pixel city in the sidebar. |

Neither needs the other. Used together, the drawer takes the layout's square corners and 2px lines, and the layout's lists switch spaces without a frame of the wrong drawer.

## Adding one

Ask the agent in your Herdr window to add `drawer` or `neon` from this repository. It reads the piece's `RECIPE.md`, copies the files into your home and fits them to your setup. By hand:

- **neon**: copy `neon/layouts/`, `neon/themes/` and `neon/mods/` into `~/.config/herdr-app`, then `herdr-app do layout.switch '{"name":"neon"}'`.
- **drawer**: copy `drawer/mods/drawer`, add the two nodes from `drawer/layout-nodes.json` to a layout of your own (the panel under the tab block, the toggle beside the status bar), and merge `drawer/keys.json` under that layout's section.

Nothing has to be built for that: every mod's `main.js` is committed.

Mods are trusted code, so read a piece before adding it. `drawer` runs `hc` and rewrites the shown layout's file. `neon`'s spaces list runs `hc`, `git` and its own Python and shell scripts.

## Working on them

Tools come from [ocx](https://ocx.sh): `ocx.toml` pins task, node, pnpm, Herdr itself (`herdr-app`, `herdr-core`) and the lint tools, `ocx.lock` locks them. Nothing else has to be installed.

```sh
ocx pull                      # the tools, as locked
ocx exec -- task setup        # pnpm install, git hooks (prek)
ocx exec -- task build        # src/<mod>/main.ts -> <piece>/mods/<mod>/main.js
ocx exec -- task verify       # everything CI runs
ocx exec -- task install      # copy the built pieces into your Herdr home
```

How it is laid out:

- `src/<mod>/main.ts` is a mod's source, `src/lib/` what mods share. `task build` bundles each mod with what it imports from `src/` into one `main.js` (esbuild; `gpui-kit`, `gpui-base` and `herdr` stay imports), next to the mod's `mod.json` and art in its piece.
- The built `main.js` is committed, because Herdr loads that file and a piece is copied as it is. `task build:check` fails when a committed file is not what `src/` builds; the pre-commit hook and CI both run it.
- `drawer` and `neon` are written here and type-checked strictly. The `neon-*` mods are clones of Herdr's own, restyled; they stay close to their origin and are not type-checked.
- `task check` validates every piece (JSON, layout, the files a mod names) and has the pinned Herdr load and render each mod in a throwaway home (`herdr-app check`).
- `task typecheck` checks against the declarations of the pinned Herdr. `types/gpui-kit.d.ts` is generated from it; `types/herdr.d.ts` is a copy of the file Herdr writes to its home, to refresh when `ocx.lock` moves to a new Herdr.
- `task secrets` runs gitleaks over the history and the tree; the pre-commit hook runs it over what is staged.
- `task install` replaces the mods and themes in your home with the built ones. A layout is only copied when your home has none of that name, since a layout in a home is yours to resize and extend.

## License

[Apache-2.0](LICENSE). The `neon-*` mods derive from mods shipped with Herdr (Apache-2.0); `neon-spaces` and two of its scripts derive from the Over9k nested-tabs sidebar (MIT). See [NOTICE](NOTICE).
