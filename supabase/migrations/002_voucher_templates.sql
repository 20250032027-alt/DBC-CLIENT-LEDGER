-- Run this in the Supabase SQL Editor if you already ran the original
-- schema.sql before the Recurring Templates feature was added. (Don't
-- re-run the whole schema.sql on an existing database — the policy
-- statements in it aren't safe to run twice.)

create table if not exists public.voucher_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'general',
  memo text,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
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

create index if not exists voucher_templates_user_id_idx on public.voucher_templates(user_id);
