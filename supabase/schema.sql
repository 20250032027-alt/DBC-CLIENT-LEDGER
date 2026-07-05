-- Dbc Client Ledger database schema for Supabase
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)
--
-- This sets up 5 tables (accounts, clients, vouchers, bills, settings),
-- all scoped to the logged-in user via Row Level Security, so each
-- account can only ever see/edit its own rows.

-- ============================================================
-- ACCOUNTS  (Chart of Accounts)
-- ============================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

create policy "accounts_select_own" on public.accounts
  for select using (auth.uid() = user_id);
create policy "accounts_insert_own" on public.accounts
  for insert with check (auth.uid() = user_id);
create policy "accounts_update_own" on public.accounts
  for update using (auth.uid() = user_id);
create policy "accounts_delete_own" on public.accounts
  for delete using (auth.uid() = user_id);

-- ============================================================
-- CLIENTS
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  address text,
  tin text,
  type text not null default 'individual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "clients_select_own" on public.clients
  for select using (auth.uid() = user_id);
create policy "clients_insert_own" on public.clients
  for insert with check (auth.uid() = user_id);
create policy "clients_update_own" on public.clients
  for update using (auth.uid() = user_id);
create policy "clients_delete_own" on public.clients
  for delete using (auth.uid() = user_id);

-- ============================================================
-- VOUCHERS  (journal entries)
-- ============================================================
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null,
  type text not null default 'general',
  date date,
  reference text,
  memo text,
  client_id uuid references public.clients(id) on delete set null,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vouchers enable row level security;

create policy "vouchers_select_own" on public.vouchers
  for select using (auth.uid() = user_id);
create policy "vouchers_insert_own" on public.vouchers
  for insert with check (auth.uid() = user_id);
create policy "vouchers_update_own" on public.vouchers
  for update using (auth.uid() = user_id);
create policy "vouchers_delete_own" on public.vouchers
  for delete using (auth.uid() = user_id);

-- ============================================================
-- BILLS  (invoices)
-- ============================================================
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  date date,
  due_date date,
  lines jsonb not null default '[]'::jsonb,
  notes text,
  apply_tax boolean not null default true,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bills enable row level security;

create policy "bills_select_own" on public.bills
  for select using (auth.uid() = user_id);
create policy "bills_insert_own" on public.bills
  for insert with check (auth.uid() = user_id);
create policy "bills_update_own" on public.bills
  for update using (auth.uid() = user_id);
create policy "bills_delete_own" on public.bills
  for delete using (auth.uid() = user_id);

-- ============================================================
-- SETTINGS  (one row per user)
-- ============================================================
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  company text not null default 'My Company',
  address text,
  tin text,
  currency text not null default 'PHP',
  -- Tax scheme is a company-level setting: a business is registered with the
  -- BIR as either VAT or Non-VAT/Percentage Tax, not switchable per voucher.
  tax_scheme text not null default 'vat' check (tax_scheme in ('vat', 'percentage')),
  vat_rate numeric not null default 12,
  percentage_tax_rate numeric not null default 3,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id);
create policy "settings_delete_own" on public.settings
  for delete using (auth.uid() = user_id);

-- ============================================================
-- VOUCHER TEMPLATES  (recurring/saved voucher presets)
-- ============================================================
create table if not exists public.voucher_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'general',
  memo text,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voucher_templates enable row level security;

create policy "voucher_templates_select_own" on public.voucher_templates
  for select using (auth.uid() = user_id);
create policy "voucher_templates_insert_own" on public.voucher_templates
  for insert with check (auth.uid() = user_id);
create policy "voucher_templates_update_own" on public.voucher_templates
  for update using (auth.uid() = user_id);
create policy "voucher_templates_delete_own" on public.voucher_templates
  for delete using (auth.uid() = user_id);

-- ============================================================
-- Helpful indexes
-- ============================================================
create index if not exists accounts_user_id_idx on public.accounts(user_id);
create index if not exists clients_user_id_idx on public.clients(user_id);
create index if not exists vouchers_user_id_idx on public.vouchers(user_id);
create index if not exists bills_user_id_idx on public.bills(user_id);
create index if not exists voucher_templates_user_id_idx on public.voucher_templates(user_id);
