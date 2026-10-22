/**
 * Turns the result of a plan into ONE multi-path update, so everything is saved together
 * or not at all. Pure: no Firebase here, so it is unit tested.
 *
 *   new rows      transactions/<newKey>            = the whole row
 *   changed rows  transactions/<key>/<field>       = the new value (null clears a field)
 *
 * Only explicit fields are written; a parsed record is never saved back whole (parsing
 * strips unknown keys). `undefined` is dropped because Firebase rejects it.
 */
import type { Transaction } from "../domain/schemas";

export interface RowPatch {
  key: string;
  fields: Record<string, unknown>;
}

export interface WriteSet {
  create?: readonly Transaction[];
  patches?: readonly RowPatch[];
}

function withoutUndefined(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

/** `newKey` hands out a fresh push key for each new row. */
export function buildUpdates(set: WriteSet, newKey: () => string): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const row of set.create ?? []) {
    updates[`transactions/${newKey()}`] = withoutUndefined(row);
  }

  for (const patch of set.patches ?? []) {
    for (const [field, value] of Object.entries(patch.fields)) {
      if (value === undefined) continue;
      updates[`transactions/${patch.key}/${field}`] = value;
    }
  }

  return updates;
}
