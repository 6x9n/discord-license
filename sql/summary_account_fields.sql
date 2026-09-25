-- Account inventory fields for the Summary section of the admin console.
--
-- Run this once in the Supabase SQL Editor. Every column is additive and
-- nullable, so existing rows keep working and nothing is rewritten.
--
-- Already present on discord_accounts and NOT recreated here:
--   buy_price   -> "paid"
--   nitro_ends  -> "nitro end"
--   badges      -> badge labels (text[])

alter table public.discord_accounts
  add column if not exists email_password text,
  add column if not exists discord_password text,
  add column if not exists source text,
  add column if not exists status_label text;

-- "PB Tested" and friends are workflow states, which are different from the
-- AVAILABLE/SOLD pair that drives the profit maths, so they get their own
-- column instead of overloading `status`.
comment on column public.discord_accounts.status_label is
  'Free-text workflow status, e.g. "PB Tested". Kept separate from status (AVAILABLE/SOLD) which drives the financial totals.';
comment on column public.discord_accounts.source is
  'Where the account came from, e.g. a telegram link or marketplace name.';
comment on column public.discord_accounts.email_password is
  'Stored in plaintext. See the admin console: values are masked in the UI but the API returns them to the browser.';
comment on column public.discord_accounts.discord_password is
  'Stored in plaintext. See the admin console: values are masked in the UI but the API returns them to the browser.';

-- Keeps the Accounts tab sorted the same way the list is filtered.
create index if not exists discord_accounts_status_label_idx
  on public.discord_accounts (status_label);
