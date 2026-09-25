-- Discord Account Manager - Financial / Inventory schema
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Requires the pgcrypto extension for gen_random_uuid().
--
-- NOTE: sql/summary_account_fields.sql is the maintained file. It contains
-- this same schema plus the account-inventory columns added for the admin
-- console (email/discord passwords, source, status_label) and row level
-- security. Prefer that one; this file is kept for reference and for
-- databases created before those columns existed.

create extension if not exists pgcrypto;

create table if not exists public.discord_accounts (
  id uuid primary key default gen_random_uuid(),
  discord_id text default '',
  username text default '',
  email text default '',
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
  status text not null default 'AVAILABLE'
    constraint discord_accounts_status_check check (status in ('AVAILABLE', 'SOLD')),
  sold_at timestamptz,
  buyer_name text default '',
  buyer_telegram text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Migration for databases created before buyer info was tracked:
-- Run this too (safe to run alongside the CREATE TABLE above).
-- --------------------------------------------------------------------------
alter table public.discord_accounts add column if not exists buyer_name text default '';
alter table public.discord_accounts add column if not exists buyer_telegram text default '';

create index if not exists discord_accounts_status_idx on public.discord_accounts (status);
create index if not exists discord_accounts_sold_at_idx on public.discord_accounts (sold_at);
create index if not exists discord_accounts_created_at_idx on public.discord_accounts (created_at);

comment on table public.discord_accounts is 'Tracked Discord accounts: financial + inventory records for the /summary dashboard.';