import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan } from "../../data/writes";
import type { PlanResult } from "../../domain/plan";
import type { FundReturn, TransactionRecord, UnitRecord } from "../../domain/schemas";
import { planRedoSale, planUndoSale } from "../../domain/saleUndo";
import type { SaleReversal } from "../../domain/saleUndo";
import { toLocalDateString } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import type { Notice } from "../notice";

export interface SaleUndoActions {
  busy: boolean;
  onUndo: (unit: UnitRecord) => void;
  onRedo: (fundReturn: FundReturn & { key: string }) => void;
}

/** Undo a sale from the Sold tab, redo it from the deleted fund-return in the Funds tab. */
export function useSaleUndo(records: readonly TransactionRecord[], setNotice: (n: Notice | null) => void): SaleUndoActions {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function run(make: (ctx: { today: string; now: number; email: string }) => PlanResult<SaleReversal>, done: string) {
    if (!user?.email) return setNotice({ ok: false, text: "You are signed out. Please sign in again." });
    if (busy) return;
    setBusy(true);
    const ctx = { today: toLocalDateString(), now: Date.now(), email: user.email };
    const result = await executePlan(make(ctx), (r) => ({ patches: [r.unitPatch, ...r.ledgerPatches] }));
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: done } : { ok: false, text: result.message });
  }

  return {
    busy,
    onUndo: (unit) => {
      const message =
        `Undo the sale of ${unit.transactionId} (${unit.name}, sold for ${formatPeso(unit.soldFor ?? 0)})?\n\n` +
        "The unit goes back to Available Units, and the profit and fund return from this sale are removed. " +
        "You can redo it from the deleted row in the Funds tab.";
      if (!window.confirm(message)) return;
      setNotice(null);
      void run((ctx) => planUndoSale(unit, records, ctx), `Sale of ${unit.transactionId} undone. ${unit.name} is back in Available Units.`);
    },
    onRedo: (fundReturn) => {
      setNotice(null);
      const unit = records.find((r): r is UnitRecord => r.type === "unit" && r.key === fundReturn.unitId);
      void run((ctx) => planRedoSale(fundReturn, unit, records, ctx), `Sale of ${fundReturn.unitName} restored.`);
    },
  };
}
