import { useState } from "react";
import type { FormEvent } from "react";
import type { InstallmentRecord } from "../../domain/schemas";
import { formatPeso } from "../../lib/money";
import type { PaymentOutcome } from "./useInstallmentActions";

interface Props {
  plan: InstallmentRecord;
  onSave: (plan: InstallmentRecord, amount: number) => Promise<PaymentOutcome>;
  onClose: () => void;
}

export function PaymentModal({ plan, onSave, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await onSave(plan, Number(amount));
    setBusy(false);
    if (outcome.status === "error") setError(outcome.message);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label="Record payment">
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <h3>
          Record payment <span className="modal-sub">{plan.transactionId}</span>
        </h3>
        <p className="modal-info">
          {plan.unitName} · {plan.buyerName}
          <br />
          Balance {formatPeso(plan.balanceRemaining)} · usual payment {formatPeso(plan.paymentAmount)} ({plan.paymentFrequency})
        </p>
        <label>
          Payment amount
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder={formatPeso(Math.min(plan.paymentAmount, plan.balanceRemaining))}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>
        {error && (
          <p className="entry-message error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="entry-submit" disabled={busy}>
            {busy ? "Saving..." : "Record payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
