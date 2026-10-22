// Builds scripts/reconcile.ts and runs it, passing your arguments through untouched
// (paths with spaces work on Windows). Used by: npm run reconcile -- <file> [<file>]
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

await build({
  entryPoints: ["scripts/reconcile.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".reconcile-out.mjs",
  logLevel: "error",
});
const run = spawnSync(process.execPath, [".reconcile-out.mjs", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(run.status ?? 1);
