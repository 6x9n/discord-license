-- Discord account inventory: schema + admin console fields.
--
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> Run.
--
-- This is self-contained and safe to re-run. It creates the base table if it
-- is missing (see also db/summary_schema.sql) and then adds the fields the
-- admin console needs, so one paste is enough whether or not the original
-- summary schema was ever applied.
--
-- Requires the pgcrypto extension for gen_random_uuid().

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- Base table
-- --------------------------------------------------------------------------

create table if not exists public.discord_accounts (
  id uuid primary key default gen_random_uuid(),
  discord_id text default '',
  username text default '',
  email text default '',
  email_password text default '',
  discord_password text default '',
  phone text default '',
  two_factor_enabled boolean default false,
  verified boolean default false,
  creation_date timestamptz,
  nitro_tier text default 'None',
  nitro_ends text default '',
  badges text[] default array[]::text[],
  decorations text[] default array[]::text[],
  buy_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  -- status drives the profit maths and stays a strict pair.
  status text not null default 'AVAILABLE'
    constraint discord_accounts_status_check check (status in ('AVAILABLE', 'SOLD')),
  -- status_label is the free-text workflow state, e.g. "PB Tested".
  status_label text default '',
  source text default '',
  sold_at timestamptz,
  buyer_name text default '',
  buyer_telegram text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Bring an older or partially created table up to date
-- --------------------------------------------------------------------------

alter table public.discord_accounts add column if not exists discord_id text default '';
alter table public.discord_accounts add column if not exists username text default '';
alter table public.discord_accounts add column if not exists email text default '';
alter table public.discord_accounts add column if not exists email_password text default '';
alter table public.discord_accounts add column if not exists discord_password text default '';
alter table public.discord_accounts add column if not exists phone text default '';
alter table public.discord_accounts add column if not exists two_factor_enabled boolean default false;
alter table public.discord_accounts add column if not exists verified boolean default false;
alter table public.discord_accounts add column if not exists creation_date timestamptz;
alter table public.discord_accounts add column if not exists nitro_tier text default 'None';
alter table public.discord_accounts add column if not exists nitro_ends text default '';
alter table public.discord_accounts add column if not exists badges text[] default array[]::text[];
alter table public.discord_accounts add column if not exists decorations text[] default array[]::text[];
alter table public.discord_accounts add column if not exists buy_price numeric(12,2) not null default 0;
alter table public.discord_accounts add column if not exists sell_price numeric(12,2) not null default 0;
alter table public.discord_accounts add column if not exists status text not null default 'AVAILABLE';
alter table public.discord_accounts add column if not exists status_label text default '';
alter table public.discord_accounts add column if not exists source text default '';
alter table public.discord_accounts add column if not exists sold_at timestamptz;
alter table public.discord_accounts add column if not exists buyer_name text default '';
alter table public.discord_accounts add column if not exists buyer_telegram text default '';
alter table public.discord_accounts add column if not exists notes text default '';
alter table public.discord_accounts add column if not exists created_at timestamptz not null default now();

-- status is constrained in the CREATE TABLE above; add it separately for
-- tables that already existed without it.
alter table public.discord_accounts
  drop constraint if exists discord_accounts_status_check;
alter table public.discord_accounts
  add constraint discord_accounts_status_check check (status in ('AVAILABLE', 'SOLD'));

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

create index if not exists discord_accounts_status_idx on public.discord_accounts (status);
create index if not exists discord_accounts_status_label_idx on public.discord_accounts (status_label);
create index if not exists discord_accounts_sold_at_idx on public.discord_accounts (sold_at);
create index if not exists discord_accounts_created_at_idx on public.discord_accounts (created_at);

-- Keeps the list sorted and de-duplicated by account.
create unique index if not exists discord_accounts_discord_id_idx
  on public.discord_accounts (discord_id)
  where discord_id <> '';

-- --------------------------------------------------------------------------
-- Documentation
-- --------------------------------------------------------------------------

comment on table public.discord_accounts is
  'Tracked Discord accounts: financial + inventory records for the admin console.';

comment on column public.discord_accounts.status_label is
  'Free-text workflow status, e.g. "PB Tested". Kept separate from status (AVAILABLE/SOLD) which drives the financial totals.';

comment on column public.discord_accounts.source is
  'Where the account came from, e.g. a telegram link or marketplace name.';

comment on column public.discord_accounts.nitro_ends is
  'Nitro expiry as a YYYY-MM-DD string, or empty when there is no Nitro.';

comment on column public.discord_accounts.email_password is
  'Stored in plaintext. Values are masked in the admin UI but the API returns them to the browser.';

comment on column public.discord_accounts.discord_password is
  'Stored in plaintext. Values are masked in the admin UI but the API returns them to the browser.';

-- --------------------------------------------------------------------------
-- Lock the table down to the server
-- --------------------------------------------------------------------------
-- Every read and write goes through the Vercel functions using the
-- service_role key, which bypasses RLS. Enabling it here means the plaintext
-- password columns cannot be read with the anon key, should it ever leak.
alter table public.discord_accounts enable row level security;
