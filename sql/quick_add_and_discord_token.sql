-- Quick Add + Discord-token accounts
--
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Re-running it is safe.
--
-- This migration adds the sales fields used by the admin Quick Add parser, the
-- encrypted token storage used by "Add via Discord Token", and the owner/tool
-- registration context used by "Register in Tool & Open".
--
-- Naming note:
--   The table already used buyer_name and sell_price. The sales workflow asks
--   for buyer and sold_price, so those are added as generated aliases over the
--   existing columns. There is still exactly one source of truth: writing
--   buyer_name updates buyer, and writing sell_price updates sold_price.

begin;

-- --------------------------------------------------------------------------
-- 0. Preconditions
-- --------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.discord_accounts') is null then
    raise exception 'public.discord_accounts does not exist. Run sql/summary_account_fields.sql first, then re-run this migration.';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 1. Base sales columns (kept from the original account model)
-- --------------------------------------------------------------------------

alter table public.discord_accounts add column if not exists buyer_name text default '';
alter table public.discord_accounts add column if not exists buyer_telegram text default '';
alter table public.discord_accounts add column if not exists buy_price numeric(12,2) default 0;
alter table public.discord_accounts add column if not exists sell_price numeric(12,2) default 0;
alter table public.discord_accounts add column if not exists sell_paid_first numeric(12,2) default 0;
alter table public.discord_accounts add column if not exists sell_paid_second numeric(12,2) default 0;

-- --------------------------------------------------------------------------
-- 2. New Quick Add fields
-- --------------------------------------------------------------------------

-- The raw "sold 1" / "sold 2" values. Kept as text because a value can be a
-- payment note or an invoice link, not only a number. Numeric instalments keep
-- living in sell_paid_first / sell_paid_second.
alter table public.discord_accounts add column if not exists sold_link_1 text not null default '';
alter table public.discord_accounts add column if not exists sold_link_2 text not null default '';

-- A token-added account starts with no price so the editor can show an empty
-- field instead of a misleading 0. The original columns were NOT NULL; make
-- them nullable only once, before the generated sold_price alias is created.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'discord_accounts'
      and column_name = 'buy_price'
      and is_nullable = 'NO'
  ) then
    alter table public.discord_accounts alter column buy_price drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'discord_accounts'
      and column_name = 'sell_price'
      and is_nullable = 'NO'
  ) then
    alter table public.discord_accounts alter column sell_price drop not null;
  end if;
end $$;

-- The sales workflow names requested by the admin console. Generated columns
-- cannot drift from the values the rest of the app reads and writes. The casts
-- keep the expression type exactly equal to the generated column's type even
-- when the base column was created with a different numeric precision.
alter table public.discord_accounts
  add column if not exists buyer text generated always as (buyer_name::text) stored;
alter table public.discord_accounts
  add column if not exists sold_price numeric(12,2) generated always as (sell_price::numeric(12,2)) stored;

-- --------------------------------------------------------------------------
-- 3. Discord profile fields fetched from /users/@me
-- --------------------------------------------------------------------------

alter table public.discord_accounts add column if not exists global_name text default '';
alter table public.discord_accounts add column if not exists avatar text default '';
alter table public.discord_accounts add column if not exists avatar_url text default '';

-- --------------------------------------------------------------------------
-- 4. Encrypted token storage
-- --------------------------------------------------------------------------
-- The plaintext token is never written to a column. The API encrypts it with
-- AES-256-GCM using TOKEN_ENCRYPTION_KEY (or LICENSE_ADMIN_SECRET when that is
-- not set) and stores the ciphertext, IV and auth tag separately.

alter table public.discord_accounts add column if not exists discord_token_enc text default '';
alter table public.discord_accounts add column if not exists discord_token_iv text default '';
alter table public.discord_accounts add column if not exists discord_token_tag text default '';
alter table public.discord_accounts add column if not exists token_hint text default '';

-- --------------------------------------------------------------------------
-- 5. Owner context + tool registration
-- --------------------------------------------------------------------------

alter table public.discord_accounts add column if not exists owner_context text default '';
alter table public.discord_accounts add column if not exists is_registered_in_tool boolean not null default false;
alter table public.discord_accounts add column if not exists tool_registered_at timestamptz;

create index if not exists discord_accounts_registered_idx
  on public.discord_accounts (is_registered_in_tool);

-- Existing rows have no display name yet; the handle is the best available
-- fallback and keeps the new column populated for the UI.
update public.discord_accounts
   set global_name = username
 where coalesce(global_name, '') = ''
   and coalesce(username, '') <> '';

-- --------------------------------------------------------------------------
-- 6. Documentation
-- --------------------------------------------------------------------------

comment on column public.discord_accounts.buyer is
  'Generated alias for buyer_name. Do not write this column directly.';

comment on column public.discord_accounts.sold_price is
  'Generated alias for sell_price. Do not write this column directly.';

comment on column public.discord_accounts.sold_link_1 is
  'Raw "sold 1" value from Quick Add: a payment note, invoice link, or amount.';

comment on column public.discord_accounts.sold_link_2 is
  'Raw "sold 2" value from Quick Add: a payment note, invoice link, or amount.';

comment on column public.discord_accounts.global_name is
  'Discord display name fetched from /users/@me. username keeps the handle.';

comment on column public.discord_accounts.avatar is
  'Discord avatar hash fetched from /users/@me.';

comment on column public.discord_accounts.avatar_url is
  'Rendered Discord avatar CDN URL, stored so the admin list does not rebuild it.';

comment on column public.discord_accounts.discord_token_enc is
  'AES-256-GCM ciphertext of the Discord token. The plaintext token is never stored.';

comment on column public.discord_accounts.discord_token_iv is
  'Base64 AES-GCM initialization vector for discord_token_enc.';

comment on column public.discord_accounts.discord_token_tag is
  'Base64 AES-GCM authentication tag for discord_token_enc.';

comment on column public.discord_accounts.token_hint is
  'Last four characters of the token, for recognition in the admin UI only.';

comment on column public.discord_accounts.owner_context is
  'Owner/master key context that added the token account (OWNER_KEY_LABEL, default "Owner").';

comment on column public.discord_accounts.is_registered_in_tool is
  'True once "Register in Tool & Open" has bound the token to the tool.';

comment on column public.discord_accounts.tool_registered_at is
  'When the token was last registered in the tool.';

-- The table is server-only: every browser read and write goes through the
-- Vercel functions with the service_role key, which bypasses RLS.
alter table public.discord_accounts enable row level security;

-- Ask PostgREST to pick up the new columns immediately instead of waiting for
-- its periodic schema cache refresh.
notify pgrst, 'reload schema';

commit;
