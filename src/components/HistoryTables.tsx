import type { ReactNode } from "react";
import { formatPeso } from "../lib/money";
import type { CashRow } from "../domain/cashRowChanges";
import type { Fund, FundReturn, InstallmentRecord, Remit, UnitRecord } from "../domain/schemas";
import type { CashRowActions } from "../features/entries/useCashRowActions";
import type { InstallmentActions } from "../features/installments/useInstallmentActions";
import type { SellActions } from "../features/sales/useSellUnit";
import { SellBox } from "./SellBox";

type Keyed<T> = T & { key: string };

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

/** Two lines at most on desktop; the full text is in the tooltip. Phone cards show everything. */
function Clamp({ text }: { text: string }) {
  return (
    <span className="clamp" title={text}>
      {text}
    </span>
  );
}

const rowClass = (deleted: boolean | undefined) => (deleted ? "deleted-row" : undefined);

export function UnitsTable({
  rows,
  onPhoto,
  sell,
}: {
  rows: UnitRecord[];
  onPhoto: (url: string, name: string) => void;
  /** Undefined while saving is switched off: the column then shows the suggested price. */
  sell?: SellActions | undefined;
}) {
  return (
    <Table
      headers={["Transaction ID", "Unit Name", "IMEI", "Condition", "Date", "Cost", sell ? "Sold For" : "Suggested Price", "Status", "Photo"]}
    >
      {rows.map((u) => (
        <tr key={u.key} className={rowClass(u.deleted)}>
          <Td label="Transaction ID">{u.transactionId}</Td>
          <Td label="Unit Name">
            <Clamp text={u.name} />
          </Td>
          <Td label="IMEI">{u.imei || "-"}</Td>
          <Td label="Condition">{u.condition}</Td>
          <Td label="Date">{u.date}</Td>
          <Td label="Cost">{formatPeso(u.cost)}</Td>
          {sell ? (
            <Td label="Sold For">
              <SellBox unit={u} actions={sell} />
            </Td>
          ) : (
            <Td label="Suggested Price">{u.suggestedPrice === undefined ? "-" : formatPeso(u.suggestedPrice)}</Td>
          )}
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

export function InstallmentsTable({ rows, actions }: { rows: InstallmentRecord[]; actions: InstallmentActions }) {
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
        "Action",
      ]}
    >
      {rows.map((p) => (
        <tr key={p.key} className={rowClass(p.deleted)}>
          <Td label="Transaction ID">{p.transactionId}</Td>
          <Td label="Unit Name">
            <Clamp text={p.unitName} />
          </Td>
          <Td label="Buyer Name">
            <Clamp text={p.buyerName} />
          </Td>
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
          <Td label="Action">
            {actions.onPayment && p.status === "active" && !p.deleted && (
              <button type="button" className="sell-btn" disabled={actions.busy} onClick={() => actions.onPayment?.(p)}>
                + Payment
              </button>
            )}
            <button type="button" className="edit-btn" onClick={() => actions.onHistory(p)}>
              History
            </button>
            {p.deleted
              ? actions.onRestore && (
                  <button type="button" className="restore-btn" disabled={actions.busy} onClick={() => actions.onRestore?.(p)}>
                    Restore
                  </button>
                )
              : actions.onDelete && (
                  <button type="button" className="delete-btn" disabled={actions.busy} onClick={() => actions.onDelete?.(p)}>
                    Delete
                  </button>
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
            <Td label="Unit Name">
            <Clamp text={u.name} />
          </Td>
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

function CashButtons({ row, actions }: { row: CashRow; actions: CashRowActions }) {
  return row.deleted ? (
    <button type="button" className="restore-btn" disabled={actions.busy} onClick={() => actions.onRestore(row)}>
      Restore
    </button>
  ) : (
    <>
      <button type="button" className="edit-btn" disabled={actions.busy} onClick={() => actions.onEdit(row)}>
        Edit
      </button>
      <button type="button" className="delete-btn" disabled={actions.busy} onClick={() => actions.onDelete(row)}>
        Delete
      </button>
    </>
  );
}

/** `actions` is undefined while saving is switched off: no Action column then. */
export function FundsTable({ rows, actions }: { rows: Keyed<Fund | FundReturn>[]; actions?: CashRowActions | undefined }) {
  return (
    <Table headers={["Transaction ID", "Date", "Amount", "Description", ...(actions ? ["Action"] : [])]}>
      {rows.map((f) => (
        <tr key={f.key} className={rowClass(f.deleted)}>
          <Td label="Transaction ID">{f.transactionId}</Td>
          <Td label="Date">{f.date || "N/A"}</Td>
          <Td label="Amount" className="income">{`+${formatPeso(f.amount)}`}</Td>
          <Td label="Description">{f.type === "fund-return" ? `Return from: ${f.unitName}` : "Fund Added"}</Td>
          {actions && (
            <Td label="Action">
              {f.type === "fund" ? <CashButtons row={f} actions={actions} /> : <span className="muted">Part of a sale</span>}
            </Td>
          )}
        </tr>
      ))}
    </Table>
  );
}

export function RemitsTable({ rows, actions }: { rows: Keyed<Remit>[]; actions?: CashRowActions | undefined }) {
  return (
    <Table headers={["Transaction ID", "Date", "Amount", ...(actions ? ["Action"] : [])]}>
      {rows.map((r) => (
        <tr key={r.key} className={rowClass(r.deleted)}>
          <Td label="Transaction ID">{r.transactionId}</Td>
          <Td label="Date">{r.date || "N/A"}</Td>
          <Td label="Amount" className="expense">{`-${formatPeso(r.amount)}`}</Td>
          {actions && (
            <Td label="Action">
              <CashButtons row={r} actions={actions} />
            </Td>
          )}
        </tr>
      ))}
    </Table>
  );
}
