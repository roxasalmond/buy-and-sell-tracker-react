import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { CashEntryForm } from "../features/entries/CashEntryForm";
import { formatPeso } from "../lib/money";
import type { TransactionRecord } from "../domain/schemas";
import type { Summary } from "../domain/summary";
import { InstallmentForm } from "../features/installments/InstallmentForm";

const FORMS = [
  { id: "unit", label: "Add Unit" },
  { id: "installment", label: "Installment" },
  { id: "fund", label: "Add Fund" },
  { id: "remit", label: "Remit" },
] as const;

export function Sidebar({ summary, records }: { summary: Summary; records: readonly TransactionRecord[] }) {
  const [form, setForm] = useState<(typeof FORMS)[number]["id"]>("unit");

  return (
    <aside className="sidebar">
      <div className="header">
        <h1 className="title">
          Transaction <span>Tracker</span>
        </h1>
        <button type="button" className="logout-btn" onClick={() => void signOut(auth)}>
          Logout
        </button>
      </div>

      <div className="balance-summary">
        <div className="title">
          <h3>Balance Summary</h3>
        </div>
        <div className="label">
          <span>Total Inventory Value</span>
          <div className="total-value">{formatPeso(summary.inventory)}</div>
        </div>
        <div className="label">
          <span>Available Fund</span>
          <div className="total-fund">{formatPeso(summary.fund)}</div>
        </div>
      </div>

      <div className="income-summary">
        <div>
          <div className="label">
            <span>Total Income</span>
          </div>
          <div className="income-amount">{formatPeso(summary.income)}</div>
        </div>
        <div>
          <div className="label">
            <span>Divided income</span>
          </div>
          <div className="income-amount">{formatPeso(summary.divided)}</div>
        </div>
      </div>

      <div className="add-unit">
        <h3>Add New Entry</h3>
        <div className="form-type-selector">
          {FORMS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={f.id === form ? "form-btn active" : "form-btn"}
              onClick={() => setForm(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {form === "fund" && <CashEntryForm kind="fund" />}
        {form === "remit" && <CashEntryForm kind="remit" />}
        {form === "installment" && <InstallmentForm records={records} />}
        {form === "unit" && <p className="coming-soon">This form arrives in a later step of phase 4.</p>}
      </div>
    </aside>
  );
}
