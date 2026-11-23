// What the scripts know about the repository's shape.
//
// A piece is a top-level folder laid out like Herdr's home (mods/, and for a
// layout also layouts/ and themes/). A mod's source is src/<mod>/main.ts; its
// built main.js is committed at <piece>/mods/<mod>/main.js, next to mod.json
// and the mod's art.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface Mod {
  name: string;
  piece: string;
  /** src/<mod>/main.ts */
  source: string;
  /** <piece>/mods/<mod> */
  folder: string;
  /** <piece>/mods/<mod>/main.js */
  built: string;
}

export function pieces(): string[] {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, entry.name, "mods")))
    .map((entry) => entry.name)
    .sort();
}

export function mods(): Mod[] {
  return pieces().flatMap((piece) =>
    fs.readdirSync(path.join(ROOT, piece, "mods")).sort().map((name) => {
      const folder = path.join(ROOT, piece, "mods", name);
      return { name, piece, folder, source: path.join(ROOT, "src", name, "main.ts"), built: path.join(folder, "main.js") };
    }));
}

export const rel = (file: string): string => path.relative(ROOT, file).replaceAll("\\", "/");

export function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
