/**
 * Security rules, tested against the LOCAL emulators (never the real project).
 *
 *   terminal 1:  npm run emulators
 *   terminal 2:  npm run test:rules
 *
 * Only the two partner emails may read or write `transactions` and `metadata`.
 * Everyone else (signed out, or signed in with another email) is refused, and nothing
 * outside those two nodes can be written at all.
 *
 * Talks to the emulators over plain HTTP, so no extra package is needed. The partner
 * emails below are the placeholders in database.rules.json.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROJECT = "demo-buy-sell";
const NAMESPACE = "demo-buy-sell-default-rtdb";
const AUTH = "http://127.0.0.1:9099";
const DB = "http://127.0.0.1:9000";
const PASSWORD = "password123";

const PARTNER_A = "partner-a@example.com";
const PARTNER_B = "partner-b@example.com";
const OUTSIDER = "outsider@example.com";

/** Key used for rows these tests create; removed again at the end. */
const TEST_KEY = "__rules_test__";

async function idToken(email: string): Promise<string> {
  const body = JSON.stringify({ email, password: PASSWORD, returnSecureToken: true });
  const headers = { "content-type": "application/json" };
  let res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    // Already exists (seeded, or created by an earlier run): sign in instead.
    res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
      method: "POST",
      headers,
      body,
    });
  }
  if (!res.ok) throw new Error(`Could not get a token for ${email}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

interface Reply {
  status: number;
  allowed: boolean;
  body: unknown;
}

/** One REST call. `as` is a token, or null for signed out. */
async function call(method: string, path: string, as: string | null, payload?: unknown): Promise<Reply> {
  const params = new URLSearchParams({ ns: NAMESPACE });
  if (as) params.set("auth", as);
  const res = await fetch(`${DB}/${path}.json?${params}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await res.text();
  return { status: res.status, allowed: res.ok, body: text ? (JSON.parse(text) as unknown) : null };
}

let a = "";
let b = "";
let outsider = "";

beforeAll(async () => {
  // Fail with a clear message when the emulators are not running.
  try {
    await fetch(`${DB}/`);
    await fetch(`${AUTH}/`);
  } catch {
    throw new Error("The Firebase emulators are not running. Start them with: npm run emulators");
  }
  [a, b, outsider] = await Promise.all([idToken(PARTNER_A), idToken(PARTNER_B), idToken(OUTSIDER)]);
});

afterAll(async () => {
  await call("DELETE", `transactions/${TEST_KEY}`, a);
  await call("DELETE", `transactions/${TEST_KEY}2`, a);
});

describe("transactions", () => {
  it("a signed-out visitor cannot read or write", async () => {
    expect((await call("GET", "transactions", null)).allowed).toBe(false);
    expect((await call("PUT", `transactions/${TEST_KEY}`, null, { type: "fund", amount: 1 })).allowed).toBe(false);
  });

  it("a signed-in stranger cannot read or write", async () => {
    expect((await call("GET", "transactions", outsider)).allowed).toBe(false);
    expect((await call("GET", "transactions/anything", outsider)).allowed).toBe(false);
    expect((await call("PUT", `transactions/${TEST_KEY}`, outsider, { type: "fund", amount: 1 })).allowed).toBe(false);
    expect((await call("DELETE", `transactions/${TEST_KEY}`, outsider)).allowed).toBe(false);
  });

  it("both partners can read", async () => {
    expect((await call("GET", "transactions", a)).allowed).toBe(true);
    expect((await call("GET", "transactions", b)).allowed).toBe(true);
  });

  it("both partners can write, change a field and remove a row", async () => {
    const row = { type: "fund", transactionId: "TXN-TEST", amount: 1, date: "2026-10-22" };
    expect((await call("PUT", `transactions/${TEST_KEY}`, a, row)).allowed).toBe(true);
    expect((await call("PATCH", `transactions/${TEST_KEY}`, b, { amount: 2 })).allowed).toBe(true);
    const read = await call("GET", `transactions/${TEST_KEY}`, a);
    expect(read.body).toMatchObject({ amount: 2 });
    expect((await call("DELETE", `transactions/${TEST_KEY}`, b)).allowed).toBe(true);
  });

  it("a partner can save several rows in one multi-path update, like the app does", async () => {
    const reply = await call("PATCH", "", a, {
      [`transactions/${TEST_KEY}`]: { type: "fund", transactionId: "TXN-TEST", amount: 1, date: "2026-10-22" },
      [`transactions/${TEST_KEY}2`]: { type: "fund", transactionId: "TXN-TEST2", amount: 1, date: "2026-10-22" },
    });
    expect(reply.allowed).toBe(true);
    expect((await call("GET", `transactions/${TEST_KEY}2`, b)).body).toMatchObject({ amount: 1 });
  });

  it("a stranger cannot sneak a row in through a multi-path update", async () => {
    const reply = await call("PATCH", "", outsider, {
      [`transactions/${TEST_KEY}3`]: { type: "fund", amount: 1 },
    });
    expect(reply.allowed).toBe(false);
    expect((await call("GET", `transactions/${TEST_KEY}3`, a)).body).toBeNull();
  });
});

describe("metadata (the transaction counter)", () => {
  it("only partners can read it", async () => {
    expect((await call("GET", "metadata/transactionCounter", a)).allowed).toBe(true);
    expect((await call("GET", "metadata/transactionCounter", outsider)).allowed).toBe(false);
    expect((await call("GET", "metadata/transactionCounter", null)).allowed).toBe(false);
  });

  it("strangers cannot change it", async () => {
    expect((await call("PUT", "metadata/transactionCounter", outsider, 1)).allowed).toBe(false);
    expect((await call("PUT", "metadata/transactionCounter", null, 1)).allowed).toBe(false);
  });

  it("a partner can read it and the counter does not change from a read", async () => {
    const first = await call("GET", "metadata/transactionCounter", a);
    const second = await call("GET", "metadata/transactionCounter", b);
    expect(typeof first.body).toBe("number");
    expect(second.body).toBe(first.body);
  });
});

describe("everything else is closed", () => {
  it("not even a partner can write outside transactions and metadata", async () => {
    expect((await call("PUT", "somethingElse", a, { x: 1 })).allowed).toBe(false);
    expect((await call("PUT", "users/partner", b, { x: 1 })).allowed).toBe(false);
  });

  it("nobody can read the whole database root", async () => {
    expect((await call("GET", "", a)).allowed).toBe(false);
    expect((await call("GET", "", outsider)).allowed).toBe(false);
  });
});
