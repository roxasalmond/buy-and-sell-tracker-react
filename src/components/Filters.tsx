import type { DateRange } from "../domain/views";

interface Props<S extends string> {
  dateLabel: string;
  range: DateRange;
  onRange: (range: DateRange) => void;
  status: S;
  statusOptions: readonly { value: S; label: string }[];
  onStatus: (status: S) => void;
}

export function Filters<S extends string>({ dateLabel, range, onRange, status, statusOptions, onStatus }: Props<S>) {
  const active = range.from !== "" || range.to !== "" || status !== statusOptions[0]?.value;

  return (
    <div className="filters">
      <label>
        {dateLabel} from
        <input type="date" value={range.from} onChange={(e) => onRange({ ...range, from: e.target.value })} />
      </label>
      <label>
        to
        <input type="date" value={range.to} onChange={(e) => onRange({ ...range, to: e.target.value })} />
      </label>
      <label>
        Status
        <select value={status} onChange={(e) => onStatus(e.target.value as S)}>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {active && (
        <button
          type="button"
          onClick={() => {
            onRange({ from: "", to: "" });
            const first = statusOptions[0];
            if (first) onStatus(first.value);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
