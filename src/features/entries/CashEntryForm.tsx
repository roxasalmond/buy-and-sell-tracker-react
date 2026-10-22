import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan, writesEnabled } from "../../data/writes";
import { planAddFund, planAddRemit } from "../../domain/cashEntry";
import type { PlanResult } from "../../domain/plan";
import type { Transaction } from "../../domain/schemas";
import { toLocalDateString } from "../../lib/dates";

type Kind = "fund" | "remit";

const TEXT: Record<Kind, { amount: string; button: string; done: string }> = {
  fund: { amount: "Fund amount", button: "Add Fund", done: "Fund added." },
  remit: { amount: "Remit amount", button: "Record Remit", done: "Remittance recorded." },
};

export function CashEntryForm({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const [date, setDate] = useState(toLocalDateString());
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!user?.email) {
      setMessage({ ok: false, text: "You are signed out. Please sign in again." });
      return;
    }

    setBusy(true);
    setMessage(null);
    const ctx = { today: toLocalDateString(), now: Date.now(), email: user.email };
    const value = Number(amount);
    const plan: PlanResult<{ create: readonly Transaction[] }> = kind === "fund" ? planAddFund(value, date, ctx) : planAddRemit(value, date, ctx);
    const result = await executePlan(plan, (r) => ({ create: r.create }));
    setBusy(false);

    if (result.ok) {
      setAmount("");
      setMessage({ ok: true, text: TEXT[kind].done });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  }

  return (
    <form className="entry-form" onSubmit={(e) => void onSubmit(e)}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder={TEXT[kind].amount}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        aria-label={TEXT[kind].amount}
      />
      <button type="submit" className="entry-submit" disabled={busy || !writesEnabled}>
        {busy ? "Saving..." : TEXT[kind].button}
      </button>
      {!writesEnabled && <p className="coming-soon">Saving is switched off in this version.</p>}
      {message && (
        <p className={message.ok ? "entry-message ok" : "entry-message error"} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
