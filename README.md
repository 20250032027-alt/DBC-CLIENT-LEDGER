# Dbc Client Ledger — Accounting System

React + Vite accounting web app, backed by Supabase for auth and cloud data storage.

This is a fork of the original **Ledgr** app. The original was single-user/single-tenant
(one deployment per client). This fork is **multi-tenant**: one deployment, one Supabase
project, and each client signs up for their own account — their data is fully isolated
from every other account via Row Level Security. It also adds a **Sales Tax** feature
(see below).

> **This is a different architecture from the original Ledgr.** The original app is
> single-user, pointed at its own Supabase project. This fork is meant to be deployed
> *once*, and every client creates their own account on it via the sign-up form — don't
> spin up a separate deployment per client here, that's what the multi-tenant setup avoids.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Connect Supabase**
   - Copy `.env.example` to `.env`
   - Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase project → Settings → API, or Settings → API Keys on newer projects — use the `anon`/`public` or `publishable` key)

3. **Create the database tables**
   - Open your Supabase project → SQL Editor → New query
   - Paste the contents of `supabase/schema.sql` and run it
   - This creates the `accounts`, `clients`, `vouchers`, `bills`, `settings`, and `voucher_templates` tables, each locked down with Row Level Security so every account can only ever see/edit its own rows — this is what makes multi-tenant safe

4. **Check your Supabase Auth settings**
   - Go to Authentication → Sign In / Providers (or Auth settings) and confirm sign-ups are enabled (this is Supabase's default)
   - Decide whether to require email confirmation before a new account can sign in (Authentication → Settings → "Confirm email"). Leave it **on** for a real production rollout; turning it off makes testing faster since a new account can sign in immediately with no email step

5. **Run it**
   ```
   npm run dev
   ```

6. **Try it**: open the app, click **Create Account**, fill in email/password and a company name, and sign in. Each new signup gets its own empty ledger — it'll prompt you to seed a default Chart of Accounts on first visit to that page.

## Deploy
1. Push to GitHub
2. Import in Vercel — it auto-detects Vite
3. Add the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as Environment Variables in the Vercel project settings
4. Done — clients sign up directly on the deployed URL, no further setup per client

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
The original Ledgr had a single flat VAT rate. Each client here can independently be
VAT-registered or Non-VAT (Percentage Tax) — under BIR rules that's a property of the
*business*, not something that changes per transaction, so each account sets it once for
themselves:

- **Settings → Tax Scheme (BIR):** choose VAT-registered or Non-VAT/Percentage Tax, and
  set that scheme's rate (defaults: 12% VAT, 3% Percentage Tax). This is per-account —
  every client can have a different scheme, none of it shared.
- **Vouchers → New Voucher → type "Sales":** a Sales Tax panel appears showing the active
  scheme and rate, computes Net Sales / Tax Due / Total, and can insert the balanced
  journal lines directly (Dr Cash/Bank/AR, Cr Sales Revenue, Cr VAT Payable or Percentage
  Tax Payable) — so Tax Due is a real posted liability, not just a number on screen, and
  flows into Trial Balance and the Financial Reports automatically.
- Default Chart of Accounts now seeds both **VAT Payable** and **Percentage Tax Payable**
  as liability accounts (whichever the scheme doesn't use just stays at zero).

## Data & Auth (multi-tenant)
All data lives in Supabase Postgres, scoped per-account via Row Level Security — every
table has a `user_id` column and policies that only allow `auth.uid() = user_id` — see
`supabase/schema.sql`. Auth is Supabase email/password with a self-serve sign-up form
(see `src/pages/Login.jsx`); `src/App.jsx` derives everything downstream from whoever's
currently logged in, so no per-client code changes or redeploys are needed to onboard a
new client — they just sign up.
