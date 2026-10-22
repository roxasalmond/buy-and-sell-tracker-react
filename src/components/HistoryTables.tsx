import type { ReactNode } from "react";
import { formatPeso } from "../lib/money";
import type { Fund, FundReturn, InstallmentRecord, Remit, UnitRecord } from "../domain/schemas";

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="table-wrapper">
      <table className="transaction-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <td data-label={label} className={className}>
      {children}
    </td>
  );
}

const rowClass = (deleted: boolean | undefined) => (deleted ? "deleted-row" : undefined);

export function UnitsTable({ rows, onPhoto }: { rows: UnitRecord[]; onPhoto: (url: string, name: string) => void }) {
  return (
    <Table
      headers={["Transaction ID", "Unit Name", "IMEI", "Condition", "Date", "Cost", "Suggested Price", "Status", "Photo"]}
    >
      {rows.map((u) => (
        <tr key={u.key} className={rowClass(u.deleted)}>
          <Td label="Transaction ID">{u.transactionId}</Td>
          <Td label="Unit Name">{u.name}</Td>
          <Td label="IMEI">{u.imei || "-"}</Td>
          <Td label="Condition">{u.condition}</Td>
          <Td label="Date">{u.date}</Td>
          <Td label="Cost">{formatPeso(u.cost)}</Td>
          <Td label="Suggested Price">{u.suggestedPrice === undefined ? "-" : formatPeso(u.suggestedPrice)}</Td>
          <Td label="Status">
            <span className="status-badge status-in-stock">In Stock</span>
          </Td>
          <Td label="Photo">
            {u.photoURL ? (
              <img
                className="unit-photo-thumbnail"
                src={u.photoURL}
                alt={u.name}
                loading="lazy"
                onClick={() => u.photoURL && onPhoto(u.photoURL, u.name)}
              />
            ) : (
              "-"
            )}
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export function InstallmentsTable({ rows }: { rows: InstallmentRecord[] }) {
  return (
    <Table
      headers={[
        "Transaction ID",
        "Unit Name",
        "Buyer Name",
        "Unit Cost",
        "Installment Price",
        "Down Payment",
        "Payment",
        "Balance",
        "Next Due Date",
        "Status",
      ]}
    >
      {rows.map((p) => (
        <tr key={p.key} className={rowClass(p.deleted)}>
          <Td label="Transaction ID">{p.transactionId}</Td>
          <Td label="Unit Name">{p.unitName}</Td>
          <Td label="Buyer Name">{p.buyerName}</Td>
          <Td label="Unit Cost">{formatPeso(p.originalCost)}</Td>
          <Td label="Installment Price">{formatPeso(p.totalPrice)}</Td>
          <Td label="Down Payment">{formatPeso(p.downPayment)}</Td>
          <Td label="Payment">{`${formatPeso(p.paymentAmount)} (${p.paymentFrequency})`}</Td>
          <Td label="Balance" className={p.balanceRemaining > 0 ? "expense" : "income"}>
            {formatPeso(p.balanceRemaining)}
          </Td>
          <Td label="Next Due Date">{p.nextDueDate || "N/A"}</Td>
          <Td label="Status">
            {p.status === "completed" ? (
              <span className="status-badge status-sold">Completed</span>
            ) : (
              <span className="status-badge status-in-stock">Active</span>
            )}
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export function SoldTable({ rows }: { rows: UnitRecord[] }) {
  return (
    <Table
      headers={[
        "Transaction ID",
        "Unit Name",
        "IMEI",
        "Condition",
        "Date Purchased",
        "Date Sold",
        "Cost",
        "Sold For",
        "Profit",
      ]}
    >
      {rows.map((u) => {
        const soldFor = u.soldFor ?? 0;
        const profit = soldFor - u.cost;
        return (
          <tr key={u.key} className={rowClass(u.deleted)}>
            <Td label="Transaction ID">{u.transactionId}</Td>
            <Td label="Unit Name">{u.name}</Td>
            <Td label="IMEI">{u.imei || "-"}</Td>
            <Td label="Condition">{u.condition}</Td>
            <Td label="Date Purchased">{u.date}</Td>
            <Td label="Date Sold">{u.soldDate || "N/A"}</Td>
            <Td label="Cost">{formatPeso(u.cost)}</Td>
            <Td label="Sold For" className="income">
              {formatPeso(soldFor)}
            </Td>
            <Td label="Profit" className={profit >= 0 ? "income" : "expense"}>
              {formatPeso(profit)}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

export function FundsTable({ rows }: { rows: (Fund | FundReturn)[] }) {
  return (
    <Table headers={["Transaction ID", "Date", "Amount", "Description"]}>
      {rows.map((f, i) => (
        <tr key={`${f.transactionId}-${i}`} className={rowClass(f.deleted)}>
          <Td label="Transaction ID">{f.transactionId}</Td>
          <Td label="Date">{f.date || "N/A"}</Td>
          <Td label="Amount" className="income">{`+${formatPeso(f.amount)}`}</Td>
          <Td label="Description">{f.type === "fund-return" ? `Return from: ${f.unitName}` : "Fund Added"}</Td>
        </tr>
      ))}
    </Table>
  );
}

export function RemitsTable({ rows }: { rows: Remit[] }) {
  return (
    <Table headers={["Transaction ID", "Date", "Amount"]}>
      {rows.map((r, i) => (
        <tr key={`${r.transactionId}-${i}`} className={rowClass(r.deleted)}>
          <Td label="Transaction ID">{r.transactionId}</Td>
          <Td label="Date">{r.date || "N/A"}</Td>
          <Td label="Amount" className="expense">{`-${formatPeso(r.amount)}`}</Td>
        </tr>
      ))}
    </Table>
  );
}
