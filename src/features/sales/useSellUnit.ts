import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan } from "../../data/writes";
import { planImmediateSale } from "../../domain/sale";
import type { UnitRecord } from "../../domain/schemas";
import { toLocalDateString } from "../../lib/dates";
import { formatPeso, round2 } from "../../lib/money";
import type { Notice } from "../notice";

export type SellOutcome = { status: "saved" } | { status: "cancelled" } | { status: "error"; message: string };

export interface SellActions {
  /** Unit keys being saved right now (blocks double clicks). */
  selling: ReadonlySet<string>;
  /** Resolves with the outcome: saved, cancelled at the confirmation, or an error message to show next to the box. */
  sell: (unit: UnitRecord, amount: number) => Promise<SellOutcome>;
}

/** Immediate sale from the Available Units tab. All the rules live in domain/sale.ts. */
export function useSellUnit(setNotice: (notice: Notice | null) => void): SellActions {
  const { user } = useAuth();
  const [selling, setSelling] = useState<ReadonlySet<string>>(new Set());

  async function sell(unit: UnitRecord, amount: number): Promise<SellOutcome> {
    setNotice(null);
    if (!user?.email) return { status: "error", message: "You are signed out. Please sign in again." };
    if (selling.has(unit.key)) return { status: "cancelled" };

    const plan = planImmediateSale(unit, amount, { today: toLocalDateString(), now: Date.now(), email: user.email });
    if (!plan.ok) return { status: "error", message: plan.message };

    // Confirm first: a mistyped price is hard to undo once the rows are written.
    const profit = round2(amount - unit.cost);
    const returned = profit > 0 ? round2(unit.cost + profit / 2) : amount;
    const detail =
      profit > 0
        ? `Profit ${formatPeso(profit)} (${formatPeso(profit / 2)} to each partner). ${formatPeso(returned)} returns to the fund.`
        : profit === 0
          ? `No profit. ${formatPeso(amount)} returns to the fund.`
          : `Loss of ${formatPeso(-profit)}. ${formatPeso(amount)} returns to the fund.`;
    if (!window.confirm(`Sell ${unit.name} for ${formatPeso(amount)}?\n\n${detail}`)) return { status: "cancelled" };

    setSelling((current) => new Set(current).add(unit.key));
    const result = await executePlan(plan, (r) => ({ create: r.create, patches: [r.unitPatch] }));
    setSelling((current) => {
      const next = new Set(current);
      next.delete(unit.key);
      return next;
    });

    if (!result.ok) return { status: "error", message: result.message };
    setNotice({ ok: true, text: `${unit.name} sold for ${formatPeso(amount)}. ${detail}` });
    return { status: "saved" };
  }

  return { selling, sell };
}
