# Buy & Sell Tracker (React + TypeScript)

Private two-partner bookkeeping app for a unit resale business. Rebuild of the vanilla app in
`buy-and-sell-tracker`, same Firebase Realtime Database, same record shapes.
Plan and money rules: see the `Tracker Project` docs (`claude/migration-plan.md`).

## Run it

```powershell
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Setup notes

- Copy `.env.example` to `.env.local` and fill in the Firebase web config (already present on the
  author's machine). On Vercel, add the same `VITE_FIREBASE_*` values under
  Project Settings > Environment Variables.
- In the Firebase console, Authentication > Settings > Authorized domains must include the
  deployed domain (`localhost` is there by default).
- **This repo is public.** Never commit database exports, backups or `.env` files. The
  `.gitignore` blocks them; keep exports outside this folder.

## Status

Phase 1 (scaffold): login, protected route, money and date helpers with tests.
Next: domain layer (types, summary, sale and installment rules) with tests.
