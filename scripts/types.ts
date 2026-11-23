// Writes types/gpui-kit.d.ts: the declarations of gpui-kit and gpui-base for
// the Herdr version ocx.toml pins. Herdr writes that file next to any mod it
// loads, so a stub mod is loaded once in a throwaway home.
//
// The file is not committed (Herdr says so in its first line: a committed copy
// could only be a stale one). types/herdr.d.ts is: Herdr only writes it into
// the home of a running window. Refresh it from ~/.config/herdr-app/herdr.d.ts
// when ocx.lock moves to a new Herdr.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./repo.ts";

const target = path.join(ROOT, "types", "gpui-kit.d.ts");
const stamp = path.join(ROOT, "node_modules", ".herdr-types-version");

const version = spawnSync("herdr-app", ["--version"], { encoding: "utf8" });
if (version.status !== 0) {
  console.error("herdr-app is not on PATH: run through `ocx exec -- task types`");
  process.exit(1);
}
const current = version.stdout.trim();
if (fs.existsSync(target) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === current) process.exit(0);

const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-types-"));
const stub = path.join(home, "mods", "stub");
fs.mkdirSync(stub, { recursive: true });
fs.writeFileSync(path.join(stub, "mod.json"), '{ "place": "none" }\n');
fs.writeFileSync(path.join(stub, "main.js"), 'import { View, div } from "gpui-kit";\nexport default class Stub extends View { render() { return div(); } }\n');
const result = spawnSync("herdr-app", ["check", stub], { env: { ...process.env, HERDR_APP_HOME: home }, encoding: "utf8", timeout: 120000 });
const written = path.join(stub, "gpui-kit.d.ts");
if (result.status !== 0 || !fs.existsSync(written)) {
  console.error(`herdr-app check wrote no gpui-kit.d.ts:\n${result.stdout}${result.stderr}`);
  process.exit(1);
}
fs.copyFileSync(written, target);
fs.mkdirSync(path.dirname(stamp), { recursive: true });
fs.writeFileSync(stamp, current);
fs.rmSync(home, { recursive: true, force: true });
console.log(`types/gpui-kit.d.ts written from ${current}`);
