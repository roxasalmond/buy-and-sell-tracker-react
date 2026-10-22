import { useState } from "react";
import type { UnitRecord } from "../domain/schemas";
import type { SellActions } from "../features/sales/useSellUnit";
import { formatPeso } from "../lib/money";

/** Price box with a Sell button; the suggested price is the placeholder. */
export function SellBox({ unit, actions }: { unit: UnitRecord; actions: SellActions }) {
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = actions.selling.has(unit.key);

  async function submit() {
    setError(null);
    const outcome = await actions.sell(unit, Number(price));
    if (outcome.status === "saved") setPrice("");
    if (outcome.status === "error") setError(outcome.message);
  }

  if (unit.deleted) return <span className="muted">Deleted</span>;

  return (
    <div className="sell-cell">
    <div className="sell-box">
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        className="sold-input"
        placeholder={unit.suggestedPrice ? formatPeso(unit.suggestedPrice) : "₱ 0.00"}
        value={price}
        onChange={(e) => {
          setPrice(e.target.value);
          setError(null);
        }}
        aria-label={`Sold price for ${unit.name}`}
        disabled={busy}
      />
      <button type="button" className="sell-btn" disabled={busy} onClick={() => void submit()}>
        {busy ? "..." : "Sell"}
      </button>
    </div>
      {error && (
        <p className="sell-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
