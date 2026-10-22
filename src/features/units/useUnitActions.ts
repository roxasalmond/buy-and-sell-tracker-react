import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan } from "../../data/writes";
import type { PlanResult } from "../../domain/plan";
import type { TransactionRecord, UnitRecord } from "../../domain/schemas";
import { planDeleteUnit, planEditUnit, planRestoreUnit } from "../../domain/unitChanges";
import type { EditUnitInput, UnitReversal } from "../../domain/unitChanges";
import { toLocalDateString } from "../../lib/dates";
import type { Notice } from "../notice";

export interface UnitActions {
  busy: boolean;
  onEdit: (unit: UnitRecord) => void;
  onDelete: (unit: UnitRecord) => void;
  onRestore: (unit: UnitRecord) => void;
}

/** Edit / delete / restore for units in stock. Owns the open edit dialog. */
export function useUnitActions(records: readonly TransactionRecord[], setNotice: (n: Notice | null) => void) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<UnitRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const context = () => (user?.email ? { today: toLocalDateString(), now: Date.now(), email: user.email } : null);

  async function reverse(
    make: (ctx: NonNullable<ReturnType<typeof context>>) => PlanResult<UnitReversal>,
    done: string,
  ) {
    const ctx = context();
    if (!ctx) return setNotice({ ok: false, text: "You are signed out. Please sign in again." });
    if (busy) return;
    setBusy(true);
    const result = await executePlan(make(ctx), (r) => ({ patches: [r.unitPatch, ...r.expensePatches] }));
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: done } : { ok: false, text: result.message });
  }

  /** Used by the edit dialog; returns an error message, or null when saved (and closes it). */
  async function saveEdit(unit: UnitRecord, input: EditUnitInput): Promise<string | null> {
    const ctx = context();
    if (!ctx) return "You are signed out. Please sign in again.";
    if (busy) return "Please wait, still saving.";
    setBusy(true);
    const result = await executePlan(planEditUnit(unit, records, input, ctx), (r) => ({
      patches: [r.unitPatch, ...(r.expensePatch ? [r.expensePatch] : [])],
    }));
    setBusy(false);
    if (!result.ok) return result.message;
    setNotice({ ok: true, text: `${unit.transactionId} updated.` });
    setEditing(null);
    return null;
  }

  const actions: UnitActions = {
    busy,
    onEdit: (unit) => {
      setNotice(null);
      setEditing(unit);
    },
    onDelete: (unit) => {
      const message =
        `Delete ${unit.transactionId} (${unit.name})?\n\n` +
        "Its purchase expense is deleted too, so the cost goes back to the available fund. You can restore it later.";
      if (!window.confirm(message)) return;
      setNotice(null);
      void reverse((ctx) => planDeleteUnit(unit, records, ctx), `${unit.transactionId} deleted. ${unit.name} is no longer in stock.`);
    },
    onRestore: (unit) => {
      setNotice(null);
      void reverse((ctx) => planRestoreUnit(unit, records, ctx), `${unit.transactionId} restored.`);
    },
  };

  return { actions, editing, closeEdit: () => setEditing(null), saveEdit };
}
