// Builds every mod: src/<mod>/main.ts and what it imports from src/ become one
// <piece>/mods/<mod>/main.js, the file Herdr loads. The built file is committed,
// because a piece is copied into a Herdr home as it is.
//
//   node scripts/build.ts          write the files
//   node scripts/build.ts --check  write nothing; fail when a committed file is stale
//
// The output is the same bytes on every machine (LF, UTF-8, no paths from this
// machine), which is what makes --check meaningful.

import fs from "node:fs";
import { build } from "esbuild";
import { ROOT, mods, rel } from "./repo.ts";

const check = process.argv.includes("--check");
const REPOSITORY = "https://github.com/michael-herwig/herdr-mods";

// The comment block that opens a source file says what the mod is. esbuild
// drops comments, so it is carried over as the built file's banner.
function header(source: string): string {
  const lines: string[] = [];
  for (const line of fs.readFileSync(source, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("//")) break;
    lines.push(line);
  }
  return lines.join("\n");
}

const stale: string[] = [];
for (const mod of mods()) {
  if (!fs.existsSync(mod.source)) {
    console.error(`${rel(mod.folder)}: no source at ${rel(mod.source)}`);
    process.exit(1);
  }
  const banner = [
    `// Built from ${rel(mod.source)}: change it there, then \`task build\`.`,
    `// ${REPOSITORY}`,
    "//",
    header(mod.source),
    "",
  ].join("\n");
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [rel(mod.source)],
    outfile: rel(mod.built),
    bundle: true,
    // gpui-kit, gpui-base, herdr and the runtime's built-ins stay imports; only src/ is bundled.
    packages: "external",
    format: "esm",
    platform: "neutral",
    target: "es2022",
    charset: "utf8",
    legalComments: "none",
    banner: { js: banner },
    tsconfig: "tsconfig.json",
    write: false,
    logLevel: "warning",
  });
  const text = result.outputFiles[0].text.replace(/\r\n/g, "\n");
  const committed = fs.existsSync(mod.built) ? fs.readFileSync(mod.built, "utf8") : null;
  if (committed === text) continue;
  if (check) stale.push(rel(mod.built));
  else {
    fs.writeFileSync(mod.built, text);
    console.log(`built ${rel(mod.built)}`);
  }
}

if (stale.length) {
  console.error(`stale, not what src/ builds:\n${stale.map((file) => `  ${file}`).join("\n")}\nRun \`task build\` and commit the result.`);
  process.exit(1);
}
if (check) console.log(`${mods().length} built files match src/`);
