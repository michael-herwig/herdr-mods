// Copies the built pieces into a Herdr home, so a window runs what this
// repository builds.
//
//   node scripts/install.ts [piece ...]     default: every piece
//
// The home is HERDR_APP_HOME, else ~/.config/herdr-app. Herdr reloads a mod the
// moment its files change.
//
// What is copied:
//   mods/     always: each mod folder's files are replaced (files Herdr wrote
//             there, gpui-kit.d.ts and jsconfig.json, stay)
//   themes/   always
//   layouts/  the preview picture always; the layout's JSON only when the home
//             has no layout of that name. A layout in a home is its owner's:
//             they resize it and add blocks to it (the drawer's, for one).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, pieces } from "./repo.ts";

const home = process.env.HERDR_APP_HOME ?? path.join(os.homedir(), ".config", "herdr-app");
if (!fs.existsSync(home)) {
  console.error(`no Herdr home at ${home} (start Herdr once, or set HERDR_APP_HOME)`);
  process.exit(1);
}

const wanted = process.argv.slice(2);
const known = pieces();
for (const piece of wanted) {
  if (!known.includes(piece)) {
    console.error(`unknown piece "${piece}" (there are: ${known.join(", ")})`);
    process.exit(1);
  }
}

const copyFiles = (from: string, to: string) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyFiles(path.join(from, entry.name), path.join(to, entry.name));
    else fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
  }
};

for (const piece of wanted.length ? wanted : known) {
  const source = path.join(ROOT, piece);
  for (const mod of fs.readdirSync(path.join(source, "mods"))) {
    if (!fs.existsSync(path.join(source, "mods", mod, "main.js"))) {
      console.error(`${piece}/mods/${mod} is not built: run \`task build\``);
      process.exit(1);
    }
    copyFiles(path.join(source, "mods", mod), path.join(home, "mods", mod));
    console.log(`mod     ${mod}`);
  }
  if (fs.existsSync(path.join(source, "themes"))) {
    copyFiles(path.join(source, "themes"), path.join(home, "themes"));
    for (const theme of fs.readdirSync(path.join(source, "themes"))) console.log(`theme   ${theme}`);
  }
  const layouts = path.join(source, "layouts");
  if (!fs.existsSync(layouts)) continue;
  fs.mkdirSync(path.join(home, "layouts"), { recursive: true });
  for (const file of fs.readdirSync(layouts)) {
    const target = path.join(home, "layouts", file);
    if (file.endsWith(".json") && fs.existsSync(target)) {
      console.log(`layout  ${file} kept as it is in the home`);
      continue;
    }
    fs.copyFileSync(path.join(layouts, file), target);
    console.log(`layout  ${file}`);
  }
}
console.log(`installed into ${home}`);
