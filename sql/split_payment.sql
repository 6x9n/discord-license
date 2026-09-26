-- Two-part payment tracking on a sale.
--
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> Run.
--
-- A buyer sometimes pays in two instalments, so record how much of the sale
-- price has actually been received in each part. Only the two received amounts
-- are stored. The agreed second instalment and the outstanding balance are
-- derived from these and the total, so they can never drift out of step with
-- sell_price no matter which screen they are read from.
--
-- Self-contained and safe to re-run: existing rows default to 0, meaning "no
-- part paid yet", which matches how those sales were recorded before.

alter table public.discord_accounts
  add column if not exists sell_paid_first numeric(12,2) not null default 0;

alter table public.discord_accounts
  add column if not exists sell_paid_second numeric(12,2) not null default 0;

-- Backfill: a sale recorded before this change as fully settled has no
-- recorded instalments, so treat the whole price as received. Doing it in SQL
-- keeps the column non-null and means the admin table shows no false balance
-- for accounts that were already paid in full.
update public.discord_accounts
   set sell_paid_first = sell_price,
       sell_paid_second = 0
 where status = 'SOLD'
   and sell_paid_first = 0
   and sell_paid_second = 0
   and sell_price > 0;

-- The admin list sorts and filters on money columns; this keeps a partial
-- payment lookup cheap once the table grows.
create index if not exists discord_accounts_payment_idx
  on public.discord_accounts (status, sell_price);
