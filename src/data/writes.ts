import { push, ref, update } from "firebase/database";
import type { PlanResult } from "../domain/plan";
import { db } from "../lib/firebase";
import { reserveIds } from "./ids";
import { buildUpdates } from "./multiPath";
import type { WriteSet } from "./multiPath";

/**
 * Writes are OFF unless VITE_ENABLE_WRITES=true. This keeps a half-finished flow from
 * touching the real books: turn it on only against the emulator or a test project.
 */
export const writesEnabled = import.meta.env.VITE_ENABLE_WRITES === "true";

/** A fresh push key for a new row, made before saving (used when another row must point at it). */
export function newTransactionKey(): string {
  const key = push(ref(db, "transactions")).key;
  if (!key) throw new Error("Could not create a record key");
  return key;
}

export type ExecuteResult<R> = { ok: true; result: R } | { ok: false; message: string };

/**
 * Run a plan: reserve exactly the ids it needs, let it build the rows, save everything in
 * one multi-path update. A refusal from the plan comes back with its own message.
 */
export async function executePlan<R>(
  plan: PlanResult<R>,
  toWrites: (result: R) => WriteSet,
): Promise<ExecuteResult<R>> {
  if (!plan.ok) return { ok: false, message: plan.message };
  if (!writesEnabled) {
    return { ok: false, message: "Saving is switched off in this version (VITE_ENABLE_WRITES is not true)." };
  }

  try {
    // Edits, deletes and restores create no rows, so they need no ids.
    const ids = plan.idCount > 0 ? await reserveIds(plan.idCount) : [];
    const result = plan.build(ids);
    const updates = buildUpdates(toWrites(result), newTransactionKey);
    await update(ref(db), updates);
    return { ok: true, result };
  } catch (error) {
    console.error("Save failed:", error);
    return { ok: false, message: "Could not save. Nothing was recorded. Please try again." };
  }
}
