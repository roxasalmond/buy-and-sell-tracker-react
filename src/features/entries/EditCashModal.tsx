import { useState } from "react";
import type { FormEvent } from "react";
import type { CashRow } from "../../domain/cashRowChanges";

interface Props {
  row: CashRow;
  /** Returns an error message, or null when saved. */
  onSave: (row: CashRow, input: { amount: number; date: string }) => Promise<string | null>;
  onClose: () => void;
}

export function EditCashModal({ row, onSave, onClose }: Props) {
  const [date, setDate] = useState(row.date);
  const [amount, setAmount] = useState(String(row.amount));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = row.type === "fund" ? "Edit fund" : "Edit remit";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onSave(row, { amount: Number(amount), date });
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label={title}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <h3>
          {title} <span className="modal-sub">{row.transactionId}</span>
        </h3>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Amount
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
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
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
