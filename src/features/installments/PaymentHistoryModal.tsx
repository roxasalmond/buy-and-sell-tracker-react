import type { InstallmentRecord } from "../../domain/schemas";
import { formatPeso } from "../../lib/money";

/** Read-only: every payment, then the totals. Same figures as the old app's history. */
export function PaymentHistoryModal({ plan, onClose }: { plan: InstallmentRecord; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label="Payment history">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>
          Payment history <span className="modal-sub">{plan.transactionId}</span>
        </h3>
        <p className="modal-info">
          {plan.unitName} · {plan.buyerName}
        </p>
        <ol className="history-list">
          {plan.paymentsMade.map((p, i) => (
            <li key={`${p.paidAt}-${i}`}>
              <span>{p.date}</span>
              <strong>{formatPeso(p.amount)}</strong>
            </li>
          ))}
        </ol>
        <dl className="history-totals">
          <dt>Total paid</dt>
          <dd>{formatPeso(plan.totalPrice - plan.balanceRemaining)}</dd>
          <dt>Balance</dt>
          <dd>{formatPeso(plan.balanceRemaining)}</dd>
          <dt>Capital recovered</dt>
          <dd>
            {formatPeso(plan.capitalRecovered)} / {formatPeso(plan.originalCost)}
          </dd>
          <dt>Profit processed</dt>
          <dd>{formatPeso(plan.profitProcessed)}</dd>
        </dl>
        <div className="modal-buttons">
          <button type="button" className="modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
