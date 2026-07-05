-- Run this in the Supabase SQL Editor to add TIN (BIR Tax Identification
-- Number) fields — one for each client (the buyer, shown on invoices) and
-- one for your own business (the seller, also shown on invoices).
-- Safe to run even if these columns already exist.

alter table public.clients  add column if not exists tin text;
alter table public.settings add column if not exists tin text;

-- Force PostgREST to pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
