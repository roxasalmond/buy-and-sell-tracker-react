/**
 * Record types for the flat `transactions/<pushKey>` node.
 *
 * Derived from the real 22 Oct 2026 export (585 records). Every record type shares the
 * same audit fields; `type` tells them apart.
 *
 * NOTE: parsing strips unknown keys. Parsed objects are for reading and calculating only.
 * Writes must update explicit fields (multi-path update), never save a parsed object back.
 */
import { z } from "zod";

const money = z.number();
const epochMs = z.number();
const dateString = z.string(); // YYYY-MM-DD

/** Fields every record can carry. */
const base = {
  transactionId: z.string(), // TXN-nnn
  createdBy: z.string().optional(),
  // Missing on a few break-even sales (for example TXN-550), so optional.
  createdAt: epochMs.optional(),
  timestamp: epochMs.optional(),
  editedBy: z.string().optional(),
  editedAt: epochMs.optional(),
  deleted: z.boolean().optional(),
  deletedBy: z.string().optional(),
  deletedAt: epochMs.optional(),
  restoredBy: z.string().optional(),
  restoredAt: epochMs.optional(),
};

export const unitStatusSchema = z.enum(["in-stock", "installment", "sold"]);
export type UnitStatus = z.infer<typeof unitStatusSchema>;

export const unitSchema = z.object({
  ...base,
  type: z.literal("unit"),
  name: z.string(),
  // Free text in practice: "Second Hand", "Brandnew", "Refurbished", or empty.
  category: z.string(),
  condition: z.string(),
  imei: z.string(), // "0" or "" when unknown
  cost: money,
  date: dateString,
  status: unitStatusSchema,
  suggestedPrice: money.optional(),
  photoURL: z.string().optional(),
  photoUploadedAt: epochMs.optional(),
  // Set when the unit is sold (immediately or when an installment plan completes).
  soldFor: money.optional(),
  soldDate: dateString.optional(),
  soldBy: z.string().optional(),
  soldAt: epochMs.optional(),
  completedAt: epochMs.optional(),
  // TXN number of the installment plan (not the push key).
  installmentId: z.string().optional(),
});

/** Purchase of a unit: money out of the pool. */
export const expenseSchema = z.object({
  ...base,
  type: z.literal("expense"),
  amount: money,
  date: dateString,
  reason: z.string(),
  unitId: z.string(), // unit push key
});

/** Money put into the pool. */
export const fundSchema = z.object({
  ...base,
  type: z.literal("fund"),
  amount: money,
  date: dateString,
});

/** Partner remittance. May be made in advance, so the date can be in the future. */
export const remitSchema = z.object({
  ...base,
  type: z.literal("remit"),
  amount: money,
  date: dateString,
});

export const installmentPaymentSchema = z.object({
  amount: money,
  date: dateString,
  paidAt: epochMs,
  paidBy: z.string(),
});

export const installmentSchema = z.object({
  ...base,
  type: z.literal("installment"),
  unitId: z.string(), // unit push key
  unitName: z.string(),
  buyerName: z.string(),
  originalCost: money,
  totalPrice: money,
  downPayment: money,
  paymentAmount: money,
  paymentFrequency: z.enum(["weekly", "monthly"]),
  nextDueDate: dateString,
  lastPaymentDate: dateString.optional(),
  balanceRemaining: money,
  capitalRecovered: money,
  profitProcessed: money,
  status: z.enum(["active", "completed"]),
  paymentsMade: z.array(installmentPaymentSchema),
});

/** Money returned to the pool. */
export const fundReturnSchema = z.object({
  ...base,
  type: z.literal("fund-return"),
  amount: money,
  date: dateString,
  unitId: z.string(),
  unitName: z.string(),
  // Absent for immediate sales.
  installmentId: z.string().optional(),
  saleType: z.enum(["installment-capital", "installment-profit"]).optional(),
});

/** Profit split on a sale. */
export const incomeSchema = z.object({
  ...base,
  type: z.literal("income"),
  profit: money,
  dividedAmount: money, // profit / 2
  date: dateString,
  unitId: z.string(),
  unitName: z.string(),
  installmentId: z.string().optional(),
  saleType: z.literal("installment").optional(),
});

export const transactionSchema = z.discriminatedUnion("type", [
  unitSchema,
  expenseSchema,
  fundSchema,
  remitSchema,
  installmentSchema,
  fundReturnSchema,
  incomeSchema,
]);

export type Unit = z.infer<typeof unitSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type Fund = z.infer<typeof fundSchema>;
export type Remit = z.infer<typeof remitSchema>;
export type InstallmentPayment = z.infer<typeof installmentPaymentSchema>;
export type Installment = z.infer<typeof installmentSchema>;
export type FundReturn = z.infer<typeof fundReturnSchema>;
export type Income = z.infer<typeof incomeSchema>;
export type Transaction = z.infer<typeof transactionSchema>;

/** A parsed record plus the Firebase push key it is stored under. */
export type TransactionRecord = Transaction & { key: string };

export interface ParseResult {
  records: TransactionRecord[];
  /** Records that did not match their schema; logged and skipped, never thrown. */
  errors: { key: string; message: string }[];
}

/** Parse the raw `transactions` node (push key -> record). */
export function parseTransactions(raw: unknown): ParseResult {
  const records: TransactionRecord[] = [];
  const errors: ParseResult["errors"] = [];

  if (raw === null || typeof raw !== "object") return { records, errors };

  for (const [key, value] of Object.entries(raw)) {
    const result = transactionSchema.safeParse(value);
    if (result.success) {
      records.push({ ...result.data, key });
    } else {
      errors.push({ key, message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
  }
  return { records, errors };
}
