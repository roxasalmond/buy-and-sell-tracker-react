import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan, writesEnabled } from "../../data/writes";
import { planCreateInstallment } from "../../domain/installment";
import type { TransactionRecord, UnitRecord } from "../../domain/schemas";
import { isAvailable } from "../../domain/unitStatus";
import { unitsInStock } from "../../domain/views";
import { toLocalDateString } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import { useFlashMessage } from "../useFlashMessage";

type Frequency = "" | "weekly" | "monthly";

export function InstallmentForm({ records }: { records: readonly TransactionRecord[] }) {
  const { user } = useAuth();
  const units = useMemo(() => unitsInStock(records).filter(isAvailable), [records]);

  const [unitKey, setUnitKey] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useFlashMessage();

  function reset() {
    setUnitKey("");
    setBuyerName("");
    setTotalPrice("");
    setDownPayment("");
    setFrequency("");
    setPaymentAmount("");
    setNextDueDate("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!user?.email) {
      setMessage({ ok: false, text: "You are signed out. Please sign in again." });
      return;
    }
    const unit: UnitRecord | undefined = units.find((u) => u.key === unitKey);
    if (!unit) {
      setMessage({ ok: false, text: "Please choose a unit." });
      return;
    }
    if (frequency === "") {
      setMessage({ ok: false, text: "Please choose the payment frequency." });
      return;
    }

    setBusy(true);
    setMessage(null);
    const plan = planCreateInstallment(
      unit,
      {
        buyerName,
        totalPrice: Number(totalPrice),
        downPayment: Number(downPayment),
        paymentFrequency: frequency,
        paymentAmount: Number(paymentAmount),
        nextDueDate,
      },
      { today: toLocalDateString(), now: Date.now(), email: user.email },
    );
    const result = await executePlan(plan, (r) => ({ create: r.create, patches: [r.unitPatch] }));
    setBusy(false);

    if (result.ok) {
      reset();
      const planRow = result.result.create[0];
      setMessage({ ok: true, text: `Installment ${planRow?.transactionId ?? ""} created for ${unit.name}.` });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  }

  return (
    <form className="entry-form" onSubmit={(e) => void onSubmit(e)}>
      <select value={unitKey} onChange={(e) => setUnitKey(e.target.value)} required aria-label="Unit">
        <option value="">Choose a unit...</option>
        {units.map((u) => (
          <option key={u.key} value={u.key}>
            {u.transactionId} · {u.name} ({formatPeso(u.cost)})
          </option>
        ))}
      </select>
      <input type="text" placeholder="Buyer Name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required />
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder="Installment Price"
        value={totalPrice}
        onChange={(e) => setTotalPrice(e.target.value)}
        required
      />
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder="Down Payment"
        value={downPayment}
        onChange={(e) => setDownPayment(e.target.value)}
        required
      />
      <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} required aria-label="Payment frequency">
        <option value="">Payment Frequency...</option>
        <option value="monthly">Monthly</option>
        <option value="weekly">Weekly</option>
      </select>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder="Payment Amount"
        value={paymentAmount}
        onChange={(e) => setPaymentAmount(e.target.value)}
        required
      />
      <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} required aria-label="Next due date" />
      <button type="submit" className="entry-submit" disabled={busy || !writesEnabled}>
        {busy ? "Saving..." : "Create Installment"}
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
