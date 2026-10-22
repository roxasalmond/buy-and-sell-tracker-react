// Fills the LOCAL Firebase emulators with the scrubbed fixture and two test partners.
// Run with the emulators already running:  npm run seed
// Nothing here can reach the real project: it only talks to 127.0.0.1.
import { readFile } from "node:fs/promises";

const PROJECT = "demo-buy-sell";
const NAMESPACE = "demo-buy-sell-default-rtdb";
const AUTH = "http://127.0.0.1:9099";
const DB = "http://127.0.0.1:9000";
const PASSWORD = "password123";
const PARTNERS = ["partner-a@example.com", "partner-b@example.com"];

async function must(response, what) {
  if (!response.ok) throw new Error(`${what} failed: ${response.status} ${await response.text()}`);
  return response;
}

try {
  // Clean slate for auth users.
  await must(await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" }), "clear auth");

  for (const email of PARTNERS) {
    await must(
      await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: false }),
      }),
      `create ${email}`,
    );
  }

  // Replace the whole database with the fixture (admin token bypasses the rules).
  const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/scrubbed-transactions.json", import.meta.url), "utf8"));
  await must(
    await fetch(`${DB}/.json?ns=${NAMESPACE}`, {
      method: "PUT",
      headers: { Authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify({ metadata: fixture.metadata, transactions: fixture.transactions }),
    }),
    "load fixture",
  );

  console.log(`Seeded ${Object.keys(fixture.transactions).length} records, counter ${fixture.metadata.transactionCounter}.`);
  console.log(`Sign in at the app with ${PARTNERS[0]} / ${PASSWORD}`);
} catch (error) {
  console.error(String(error));
  console.error("Are the emulators running? Start them with: npm run emulators");
  process.exit(1);
}
