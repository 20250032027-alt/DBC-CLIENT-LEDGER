# Dbc Client Ledger — Accounting System

React + Vite accounting web app, backed by Supabase for auth and cloud data storage.

This is a fork of the original **Ledgr** app, forked for a different client. Everything
works the same, plus a **Sales Tax** feature (see below).

> **Important — separate Supabase project required.** This app is single-user (see
> "Data & Auth" below). If you point it at the *same* Supabase project as the original
> Ledgr client, both clients' accounting data will end up in the same database and mixed
> together. Create a brand-new Supabase project for this client, run `supabase/schema.sql`
> there, and use *that* project's URL/anon key in `.env` — don't reuse the original one.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Connect Supabase**
   - Copy `.env.example` to `.env`
   - Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase project → Settings → API)

3. **Create the database tables**
   - Open your Supabase project → SQL Editor → New query
   - Paste the contents of `supabase/schema.sql` and run it
   - This creates the `accounts`, `clients`, `vouchers`, `bills` and `settings` tables, each locked down with Row Level Security so a user can only ever see their own rows

4. **Create your login**
   - This app is built for a single user. Open Supabase → Authentication → Users → Add user, set an email + password (auto-confirm it), and use those credentials to sign in
   - There's no public sign-up flow — by design, this is a private, single-account ledger

5. **Run it**
   ```
   npm run dev
   ```

## Deploy
1. Push to GitHub
2. Import in Vercel — it auto-detects Vite
3. Add the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as Environment Variables in the Vercel project settings
4. Done

## Modules
- Dashboard
- Client Management
- Chart of Accounts (master account list + balance chart)
- Voucher / Journal Entry System
- Trial Balance
- Cash Flow Statement
- Financial Condition & Operations (Balance Sheet + Income Statement)
- Billing / Invoicing
- Settings

## Sales Tax (new in this fork)
The original Ledgr had a single flat VAT rate. This client's business can be either
VAT-registered or Non-VAT (Percentage Tax) — under BIR rules that's a property of the
*business*, not something that changes per transaction, so it's set once:

- **Settings → Tax Scheme (BIR):** choose VAT-registered or Non-VAT/Percentage Tax, and
  set that scheme's rate (defaults: 12% VAT, 3% Percentage Tax).
- **Vouchers → New Voucher → type "Sales":** a Sales Tax panel appears showing the active
  scheme and rate, computes Net Sales / Tax Due / Total, and can insert the balanced
  journal lines directly (Dr Cash/Bank/AR, Cr Sales Revenue, Cr VAT Payable or Percentage
  Tax Payable) — so Tax Due is a real posted liability, not just a number on screen, and
  flows into Trial Balance and the Financial Reports automatically.
- Default Chart of Accounts now seeds both **VAT Payable** and **Percentage Tax Payable**
  as liability accounts (whichever the scheme doesn't use just stays at zero).

## Data & Auth
All data lives in Supabase Postgres, scoped per-user via Row Level Security — see
`supabase/schema.sql`. Auth is Supabase email/password, gating the whole app
(see `src/App.jsx` and `src/pages/Login.jsx`).
