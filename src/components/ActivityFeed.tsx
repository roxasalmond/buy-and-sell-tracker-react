import { useMemo } from "react";
import type { TransactionRecord } from "../domain/schemas";
import { buildActivity } from "../domain/activity";
import { formatPeso } from "../lib/money";

export function ActivityFeed({ records }: { records: TransactionRecord[] }) {
  const items = useMemo(() => buildActivity(records), [records]);

  return (
    <section className="activity-history">
      <h2>Activity History</h2>
      <ul className="activity-list">
        {items.length === 0 && <li className="no-activity">No activity yet</li>}
        {items.map((a) => (
          <li key={a.id} className="activity-item">
            <span className="activity-time">{new Date(a.timestamp).toLocaleString()}</span> -{" "}
            <span className="activity-user">{a.user.split("@")[0]}</span>{" "}
            <span className="activity-action">{a.action}</span>{" "}
            <span className="activity-item-name">&quot;{a.itemName}&quot;</span>
            {a.amount !== null && (
              <>
                {" "}
                for{" "}
                <span className={a.amount >= 0 ? "income" : "expense"}>
                  {a.amount >= 0 ? formatPeso(a.amount) : `-${formatPeso(-a.amount)}`}
                </span>
              </>
            )}{" "}
            <span className="activity-id">({a.transactionId})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
