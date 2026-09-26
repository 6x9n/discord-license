-- Two-part payment tracking on a sale.
--
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Running it again afterwards is harmless.
--
-- A buyer sometimes pays in two instalments, so record how much of the sale
-- price has actually been received in each part. Only the two received amounts
-- are stored. The agreed second instalment and the outstanding balance are
-- derived from these and the total, so they can never drift out of step with
-- sell_price no matter which screen they are read from.
--
-- Without this the API fails with PGRST204, "Could not find the
-- sell_paid_first column", because PostgREST only knows about columns that
-- exist when it last read the table.

alter table public.discord_accounts
  add column if not exists sell_paid_first numeric(12,2) not null default 0;

alter table public.discord_accounts
  add column if not exists sell_paid_second numeric(12,2) not null default 0;

-- Backfill: a sale recorded before this change as fully settled has no
-- recorded instalments, so treat the whole price as received. Doing it in SQL
-- keeps the column non-null and means the admin table shows no false balance
-- for accounts that were already paid in full.
--
-- This has to happen exactly once. The new code always writes both amounts, even
-- when they are legitimately zero, so "both are zero" cannot tell an untouched
-- pre-existing sale apart from a new sale where nothing has been paid yet. A
-- plain re-run of the update below would therefore mark that new sale paid in
-- full and hide a real balance. A marker row is what makes re-running safe.
create table if not exists public.app_migrations (
  name text primary key,
  ran_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from public.app_migrations where name = 'split_payment') then
    update public.discord_accounts
       set sell_paid_first = sell_price,
           sell_paid_second = 0
     where status = 'SOLD'
       and sell_paid_first = 0
       and sell_paid_second = 0
       and sell_price > 0;

    insert into public.app_migrations (name) values ('split_payment');
  end if;
end $$;

-- The admin list sorts and filters on money columns; this keeps a partial
-- payment lookup cheap once the table grows.
create index if not exists discord_accounts_payment_idx
  on public.discord_accounts (status, sell_price);
