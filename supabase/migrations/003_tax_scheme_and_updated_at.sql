-- Run this in the Supabase SQL Editor if you already ran the original
-- schema.sql before this migration existed. Safe to run even if some of
-- these columns already exist — every statement uses IF NOT EXISTS.
-- Don't re-run the whole schema.sql on an existing database — the "create
-- policy" statements in it error out on a second run.

-- ============================================================
-- updated_at — required by the sync engine for conflict resolution.
-- Without this, cloud sync silently fails forever on these tables.
-- ============================================================
alter table public.accounts          add column if not exists updated_at timestamptz not null default now();
alter table public.clients           add column if not exists updated_at timestamptz not null default now();
alter table public.vouchers          add column if not exists updated_at timestamptz not null default now();
alter table public.bills             add column if not exists updated_at timestamptz not null default now();
alter table public.voucher_templates add column if not exists updated_at timestamptz not null default now();
-- settings already has updated_at from the original schema, nothing to do there.

-- ============================================================
-- settings — tax scheme columns (VAT vs Percentage Tax), replacing the
-- old single flat tax_rate. Existing tax_rate values are copied into
-- vat_rate before the old column is dropped, so nobody's saved rate is lost.
-- ============================================================
alter table public.settings add column if not exists address text;
alter table public.settings add column if not exists vat_rate numeric;
alter table public.settings add column if not exists percentage_tax_rate numeric not null default 3;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'tax_scheme'
  ) then
    alter table public.settings add column tax_scheme text not null default 'vat'
      check (tax_scheme in ('vat', 'percentage'));
  end if;
end $$;

-- Carry over any existing tax_rate value into vat_rate, then fall back to 12.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = 'tax_rate') then
    update public.settings set vat_rate = coalesce(vat_rate, tax_rate, 12) where vat_rate is null;
    alter table public.settings drop column tax_rate;
  else
    update public.settings set vat_rate = 12 where vat_rate is null;
  end if;
end $$;

alter table public.settings alter column vat_rate set default 12;
alter table public.settings alter column vat_rate set not null;
