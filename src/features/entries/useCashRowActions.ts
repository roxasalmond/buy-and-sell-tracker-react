import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan } from "../../data/writes";
import { planDeleteCashRow, planEditCashRow, planRestoreCashRow } from "../../domain/cashRowChanges";
import type { CashChange, CashRow } from "../../domain/cashRowChanges";
import type { PlanResult } from "../../domain/plan";
import { toLocalDateString } from "../../lib/dates";
import type { Notice } from "../notice";

export interface CashRowActions {
  busy: boolean;
  onEdit: (row: CashRow) => void;
  onDelete: (row: CashRow) => void;
  onRestore: (row: CashRow) => void;
}

/** Edit / delete / restore for fund and remit rows. Owns the open edit dialog and the status message. */
export function useCashRowActions(setNotice: (notice: Notice | null) => void) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<CashRow | null>(null);
  const [busy, setBusy] = useState(false);

  const context = () =>
    user?.email ? { today: toLocalDateString(), now: Date.now(), email: user.email } : null;

  /** Returns an error message, or null when saved. */
  async function run(make: (ctx: NonNullable<ReturnType<typeof context>>) => PlanResult<CashChange>, done: string) {
    const ctx = context();
    if (!ctx) return "You are signed out. Please sign in again.";
    if (busy) return "Please wait, still saving.";
    setBusy(true);
    const result = await executePlan(make(ctx), (r) => ({ patches: [r.patch] }));
    setBusy(false);
    if (!result.ok) return result.message;
    setNotice({ ok: true, text: done });
    return null;
  }

  async function report(error: Promise<string | null>) {
    const message = await error;
    if (message) setNotice({ ok: false, text: message });
  }

  const actions: CashRowActions = {
    busy,
    onEdit: (row) => {
      setNotice(null);
      setEditing(row);
    },
    onDelete: (row) => {
      if (!window.confirm("Are you sure you want to delete this transaction?")) return;
      setNotice(null);
      void report(run((ctx) => planDeleteCashRow(row, ctx), `${row.transactionId} deleted.`));
    },
    onRestore: (row) => {
      setNotice(null);
      void report(run((ctx) => planRestoreCashRow(row, ctx), `${row.transactionId} restored.`));
    },
  };

  /** Used by the edit dialog; closes it when the save works. */
  async function saveEdit(row: CashRow, input: { amount: number; date: string }) {
    const error = await run((ctx) => planEditCashRow(row, input, ctx), `${row.transactionId} updated.`);
    if (!error) setEditing(null);
    return error;
  }

  return { actions, editing, closeEdit: () => setEditing(null), saveEdit };
}
