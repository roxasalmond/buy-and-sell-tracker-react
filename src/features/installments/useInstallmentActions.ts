import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan } from "../../data/writes";
import { planDeleteInstallment, planRecordPayment, planRestoreInstallment } from "../../domain/installment";
import type { PlanReversal } from "../../domain/installment";
import type { PlanResult } from "../../domain/plan";
import type { InstallmentRecord, TransactionRecord, UnitRecord } from "../../domain/schemas";
import { toLocalDateString } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import type { Notice } from "../notice";

export interface InstallmentActions {
  busy: boolean;
  onHistory: (plan: InstallmentRecord) => void;
  /** Undefined while saving is switched off. */
  onPayment?: ((plan: InstallmentRecord) => void) | undefined;
  onDelete?: ((plan: InstallmentRecord) => void) | undefined;
  onRestore?: ((plan: InstallmentRecord) => void) | undefined;
}

export type PaymentOutcome = { status: "saved" } | { status: "cancelled" } | { status: "error"; message: string };

/** Record payment and payment history for installment plans. */
export function useInstallmentActions(records: readonly TransactionRecord[], setNotice: (n: Notice | null) => void) {
  const { user } = useAuth();
  const [paying, setPaying] = useState<InstallmentRecord | null>(null);
  const [history, setHistory] = useState<InstallmentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  async function savePayment(plan: InstallmentRecord, amount: number): Promise<PaymentOutcome> {
    if (!user?.email) return { status: "error", message: "You are signed out. Please sign in again." };
    if (busy) return { status: "cancelled" };

    const ctx = { today: toLocalDateString(), now: Date.now(), email: user.email };
    const unit = records.find((r): r is UnitRecord => r.type === "unit" && r.key === plan.unitId);

    let planned = planRecordPayment(plan, unit, amount, ctx);
    if (!planned.ok && planned.reason === "overpayment-needs-confirmation") {
      // Same rule as the old app: an overpayment raises the total price, but only after a yes.
      if (!window.confirm(planned.message)) return { status: "cancelled" };
      planned = planRecordPayment(plan, unit, amount, ctx, { confirmedOverpayment: true });
    }

    setBusy(true);
    const result = await executePlan(planned, (r) => ({
      create: r.create,
      patches: [r.installmentPatch, ...(r.unitPatch ? [r.unitPatch] : [])],
    }));
    setBusy(false);

    if (!result.ok) return { status: "error", message: result.message };

    const { split, completes } = result.result;
    const parts = [`Payment of ${formatPeso(amount)} recorded on ${plan.transactionId}.`];
    if (split.capital > 0) parts.push(`${formatPeso(split.capital)} recovers cost.`);
    if (split.profit > 0) parts.push(`${formatPeso(split.profit)} is profit (${formatPeso(split.profit / 2)} to each partner).`);
    if (completes) parts.push("The plan is fully paid and the unit moved to Sold.");
    setNotice({ ok: true, text: parts.join(" ") });
    setPaying(null);
    return { status: "saved" };
  }

  /** Delete or restore a whole plan with its payment rows, in one save. */
  async function reverse(
    plan: InstallmentRecord,
    make: (unit: UnitRecord | undefined, ctx: { today: string; now: number; email: string }) => PlanResult<PlanReversal>,
    done: string,
  ) {
    if (!user?.email) return setNotice({ ok: false, text: "You are signed out. Please sign in again." });
    if (busy) return;
    const ctx = { today: toLocalDateString(), now: Date.now(), email: user.email };
    const unit = records.find((r): r is UnitRecord => r.type === "unit" && r.key === plan.unitId);
    setBusy(true);
    const result = await executePlan(make(unit, ctx), (r) => ({
      patches: [r.planPatch, ...r.ledgerPatches, ...(r.unitPatch ? [r.unitPatch] : [])],
    }));
    setBusy(false);
    setNotice(result.ok ? { ok: true, text: done } : { ok: false, text: result.message });
  }

  const actions: InstallmentActions = {
    busy,
    onHistory: (plan) => setHistory(plan),
    onPayment: (plan) => {
      setNotice(null);
      setPaying(plan);
    },
    onDelete: (plan) => {
      const message =
        `Delete installment ${plan.transactionId} (${plan.unitName})?\n\n` +
        "This also deletes all of its payments and puts the unit back in Available Units. " +
        "The fund and income cards will go back to what they were before the plan. You can restore it later.";
      if (!window.confirm(message)) return;
      setNotice(null);
      void reverse(plan, (unit, ctx) => planDeleteInstallment(plan, records, unit, ctx), `${plan.transactionId} deleted. The unit is back in Available Units.`);
    },
    onRestore: (plan) => {
      setNotice(null);
      void reverse(plan, (unit, ctx) => planRestoreInstallment(plan, records, unit, ctx), `${plan.transactionId} restored.`);
    },
  };

  return { actions, paying, closePayment: () => setPaying(null), history, closeHistory: () => setHistory(null), savePayment };
}
