// Reads a database export and checks it. Reads files only; never connects to Firebase.
//   npm run reconcile -- <export.json>                 consistency checks and the five figures
//   npm run reconcile -- <before.json> <after.json>    also lists every record that changed
// Keep real exports OUTSIDE the repo folder (the repo is public).
import { readFileSync } from "node:fs";
import { diffExports, reconcile } from "../src/domain/reconcile";
import type { ExportFile } from "../src/domain/reconcile";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath) {
  console.error("Usage: npm run reconcile -- <export.json> [<later-export.json>]");
  process.exit(2);
}

const load = (path: string): ExportFile => JSON.parse(readFileSync(path, "utf8")) as ExportFile;
const peso = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function report(label: string, file: ExportFile): number {
  const r = reconcile(file);
  console.log(`\n=== ${label}`);
  console.log(`Records: ${r.recordCount}   Counter: ${r.counter ?? "missing"}`);
  console.log(`Fund ${peso(r.summary.fund)} | Inventory ${peso(r.summary.inventory)} | Installment units ${peso(r.summary.installmentValue)} | Income ${peso(r.summary.income)} | Divided ${peso(r.summary.divided)}`);
  for (const e of r.parseErrors) console.log(`UNREADABLE ${e.key}: ${e.message}`);
  for (const p of r.problems) console.log(`PROBLEM  ${p.txn}  [${p.code}]  ${p.message}`);
  console.log(`Known and understood: ${r.known.length}   New problems: ${r.problems.length}   Unreadable: ${r.parseErrors.length}`);
  return r.problems.length + r.parseErrors.length;
}

let bad = report(beforePath, load(beforePath));

if (afterPath) {
  const after = load(afterPath);
  bad += report(afterPath, after);
  const changes = diffExports(load(beforePath), after);
  console.log(`\n=== Changes from the first file to the second: ${changes.length}`);
  for (const c of changes) {
    console.log(`${c.kind.toUpperCase().padEnd(8)} ${c.txn}  (${c.type})`);
    for (const f of c.fields) console.log(`           ${f}`);
  }
}

process.exit(bad > 0 ? 1 : 0);
