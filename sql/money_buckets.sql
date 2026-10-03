-- Money buckets: a "Bucket of Money" ledger with named balances.
--
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> Run.
-- Self-contained and safe to re-run.
--
-- Requires the pgcrypto extension for gen_random_uuid().
--
-- WHAT THIS IS
--   money_buckets  - a place you hold money. Each row has a *role*, which is
--                    what stops trading capital being spent on living expenses:
--                      TRADING_CAPITAL   locked money for buying accounts. Account
--                                         buys and sale instalments post here and
--                                         nowhere else.
--                      LIQUID_ASSETS     un-invested holdings, tagged CRYPTO or
--                                         LOCAL_CASH. This is what a conversion
--                                         moves value between.
--                      PERSONAL_SPENDING your monthly allowance. Transfers in from
--                                         profit set the limit; spending draws it
--                                         down and never touches the other two.
--                    Plus non-sensitive billing metadata (method, last 4, handle).
--                    Deliberately NO full card or billing numbers: the accounts
--                    table already stores passwords in plaintext behind RLS, and
--                    this app has no secret vault, so nothing here should be
--                    worth a chargeback.
--   money_entries  - the ledger. One row per movement of money, tagged BUSINESS
--                    or PERSONAL so a month can be split into what the Discord
--                    trading made and what you spent living.
--
-- CURRENCY IS NOT COSMETIC
--   Buckets carry a currency (USDT, EGP, ...). A view groups balances by currency
--   because 1,200 USDT and 45,000 EGP added together is a meaningless number. The
--   API refuses to transfer between different currencies; that is what
--   crypto_convert exists for, since it records the rate that was actually used.
--
-- WHY source_key EXISTS
--   Automatic entries (an account bought, a sale instalment received) are derived
--   from the accounts table, so re-saving an account would otherwise post the
--   same money twice. source_key is a deterministic string per derived entry and
--   is uniquely indexed, which makes reconciliation idempotent: the insert
--   simply conflicts and is skipped. Nothing double-counts no matter how many
--   times the account is edited. The same trick gives a bucket at most one
--   balance correction ('adjust:<bucket id>') and one row per transfer.
--
-- WHY link_key EXISTS
--   A transfer or a conversion is two rows, one leaving and one arriving. link_key
--   is the same value on both, so the pair can be listed, audited and undone as a
--   unit instead of looking like unrelated spending.

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- Buckets
-- --------------------------------------------------------------------------

create table if not exists public.money_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The behavioural contract. See the header note.
  role text not null default 'LIQUID_ASSETS'
    constraint money_buckets_role_check
    check (role in ('TRADING_CAPITAL', 'LIQUID_ASSETS', 'PERSONAL_SPENDING')),
  -- Only meaningful for LIQUID_ASSETS: which flavour of liquid holding this is.
  asset_tag text not null default ''
    constraint money_buckets_asset_tag_check
    check (asset_tag in ('', 'CRYPTO', 'LOCAL_CASH')),
  -- Units, e.g. 'USDT', 'EGP'. Blank is allowed but then the balance is reported
  -- with no unit, which is a hint to fill it in.
  currency text not null default '',
  -- Monthly allowance for a PERSONAL_SPENDING bucket. 0 means "no cap set", which
  -- is the default so an existing ledger is not suddenly over budget.
  monthly_limit numeric(12,2) not null default 0
    constraint money_buckets_monthly_limit_check check (monthly_limit >= 0),
  -- Billing metadata only. method is the rail, e.g. "PayPal" or "Wise";
  -- identifier is a handle or account reference; last4 is at most 4 digits.
  method text not null default '',
  identifier text not null default '',
  last4 text not null default '',
  notes text not null default '',
  -- Archived buckets keep their history but stop appearing in pickers, so a
  -- closed card can be retired without orphaning the entries that used it.
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Re-shape a database created by an earlier draft of this file, which used a
-- single `kind` column (CASH/BANK/WALLET). That column is dropped rather than
-- left to drift, since nothing reads it any more.
alter table public.money_buckets drop column if exists kind;
alter table public.money_buckets drop constraint if exists money_buckets_kind_check;
alter table public.money_buckets add column if not exists role text not null default 'LIQUID_ASSETS';
alter table public.money_buckets add column if not exists asset_tag text not null default '';
alter table public.money_buckets add column if not exists currency text not null default '';
alter table public.money_buckets add column if not exists monthly_limit numeric(12,2) not null default 0;
alter table public.money_buckets drop constraint if exists money_buckets_role_check;
alter table public.money_buckets add constraint money_buckets_role_check
  check (role in ('TRADING_CAPITAL', 'LIQUID_ASSETS', 'PERSONAL_SPENDING'));
alter table public.money_buckets drop constraint if exists money_buckets_asset_tag_check;
alter table public.money_buckets add constraint money_buckets_asset_tag_check
  check (asset_tag in ('', 'CRYPTO', 'LOCAL_CASH'));
alter table public.money_buckets drop constraint if exists money_buckets_monthly_limit_check;
alter table public.money_buckets add constraint money_buckets_monthly_limit_check check (monthly_limit >= 0);

-- Case-insensitive uniqueness so "paypal" and "PayPal" cannot both exist.
create unique index if not exists money_buckets_name_idx
  on public.money_buckets (lower(name));

create index if not exists money_buckets_archived_idx on public.money_buckets (archived);
create index if not exists money_buckets_role_idx on public.money_buckets (role);

-- --------------------------------------------------------------------------
-- Entries
-- --------------------------------------------------------------------------

create table if not exists public.money_entries (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.money_buckets (id) on delete cascade,
  -- Direction is from the bucket's point of view: money arriving is IN.
  direction text not null
    constraint money_entries_direction_check check (direction in ('IN', 'OUT')),
  -- Always positive. Storing the sign only in `direction` means a balance is a
  -- plain sum and there is no -0.00 to reconcile.
  amount numeric(12,2) not null
    constraint money_entries_amount_check check (amount > 0),
  -- BUSINESS is trading (account buys and sales), PERSONAL is day-to-day life.
  -- TRANSFER is neither: moving your own money between buckets is not income and
  -- is not spending. Tagging a transfer BUSINESS would make an allocation to
  -- Personal look like a cost of trading and understate profit; tagging it
  -- PERSONAL would invent spending that never happened. Both aggregates below
  -- therefore ignore TRANSFER by grouping on scope.
  scope text not null default 'PERSONAL'
    constraint money_entries_scope_check check (scope in ('BUSINESS', 'PERSONAL', 'TRANSFER')),
  category text not null default 'OTHER',
  -- A date rather than a timestamp: "what did I spend this month" is a calendar
  -- question, and a timezone would otherwise move entries across month edges.
  occurred_on date not null default current_date,
  note text not null default '',
  -- Who owns this row. MANUAL is hand-entered. ACCOUNT_* rows are owned by an
  -- accounts-table record and are recomputed on save. ADJUSTMENT is the single
  -- correction per bucket written by "Set balance". TRANSFER and CONVERT are the
  -- two legs of a movement between buckets.
  source text not null default 'MANUAL'
    constraint money_entries_source_check
    check (source in ('MANUAL', 'ACCOUNT_BUY', 'ACCOUNT_SALE', 'ADJUSTMENT', 'TRANSFER', 'CONVERT')),
  source_key text not null default '',
  -- Shared by the two rows of a transfer or conversion.
  link_key text not null default '',
  -- Machine-readable detail for conversions: the rate and fee that were used.
  -- Kept separate from `note` so a later report can sum fees without parsing
  -- English.
  meta jsonb not null default '{}'::jsonb,
  account_id uuid references public.discord_accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

-- A database created by an earlier draft carries the three-value source check.
alter table public.money_entries drop constraint if exists money_entries_scope_check;
alter table public.money_entries add constraint money_entries_scope_check
  check (scope in ('BUSINESS', 'PERSONAL', 'TRANSFER'));
alter table public.money_entries drop constraint if exists money_entries_source_check;
alter table public.money_entries add constraint money_entries_source_check
  check (source in ('MANUAL', 'ACCOUNT_BUY', 'ACCOUNT_SALE', 'ADJUSTMENT', 'TRANSFER', 'CONVERT'));
alter table public.money_entries add column if not exists link_key text not null default '';
alter table public.money_entries add column if not exists meta jsonb not null default '{}'::jsonb;

-- The idempotency guard. Partial, because manual entries legitimately share an
-- empty source_key.
create unique index if not exists money_entries_source_key_idx
  on public.money_entries (source_key)
  where source_key <> '';

create index if not exists money_entries_bucket_idx on public.money_entries (bucket_id);
create index if not exists money_entries_occurred_idx on public.money_entries (occurred_on desc);
create index if not exists money_entries_account_idx on public.money_entries (account_id);
create index if not exists money_entries_link_idx on public.money_entries (link_key)
  where link_key <> '';

-- --------------------------------------------------------------------------
-- Aggregates
-- --------------------------------------------------------------------------
-- Balances and monthly totals are summed in the database rather than in the
-- function. A balance computed from a capped page of entries is wrong the
-- moment the ledger outgrows the page, and a money figure you cannot trust is
-- worse than no figure at all. These views keep the totals exact at any size
-- while the entries list itself stays paged for display.

create or replace view public.money_bucket_balances as
select
  b.id as bucket_id,
  b.name as bucket_name,
  b.role as bucket_role,
  b.asset_tag as bucket_asset_tag,
  b.currency as bucket_currency,
  b.monthly_limit as bucket_monthly_limit,
  b.method as bucket_method,
  b.identifier as bucket_identifier,
  b.last4 as bucket_last4,
  b.notes as bucket_notes,
  b.archived as bucket_archived,
  b.created_at as bucket_created_at,
  coalesce(sum(e.amount) filter (where e.direction = 'IN'), 0)::numeric(12,2) as total_in,
  coalesce(sum(e.amount) filter (where e.direction = 'OUT'), 0)::numeric(12,2) as total_out,
  coalesce(sum(case when e.direction = 'IN' then e.amount else -e.amount end), 0)::numeric(12,2) as balance
from public.money_buckets b
left join public.money_entries e on e.bucket_id = b.id
group by b.id;

-- Totals per currency. Never sum across these rows: 1,200 USDT and 45,000 EGP are
-- not 46,200 of anything. Archived buckets are excluded because their balances
-- have left the picture.
create or replace view public.money_currency_totals as
select
  coalesce(nullif(b.currency, ''), '(no currency)') as currency,
  b.role as role,
  count(*)::int as buckets,
  sum(v.balance)::numeric(14,2) as balance,
  sum(v.total_in)::numeric(14,2) as total_in,
  sum(v.total_out)::numeric(14,2) as total_out
from public.money_buckets b
join public.money_bucket_balances v on v.bucket_id = b.id
where b.archived = false
group by 1, 2;

-- The balance a bucket would show with no correction applied. "Set balance"
-- needs this to work out how big a correction is required: asking the balance
-- view instead would count the existing correction and compute a difference of
-- zero, so the second attempt would silently do nothing.
create or replace view public.money_bucket_base_balances as
select
  b.id as bucket_id,
  coalesce(
    sum(case when e.direction = 'IN' then e.amount else -e.amount end)
      filter (where e.source <> 'ADJUSTMENT'),
    0
  )::numeric(12,2) as base_balance
from public.money_buckets b
left join public.money_entries e on e.bucket_id = b.id
group by b.id;

-- Monthly totals, broken out by currency as well as scope. Currency has to be a
-- grouping column rather than something the API adds up, because mixing units in
-- the database is how you get a confidently wrong headline figure.
--
-- TRANSFER rows are present here and ignored by the caller: they are movements,
-- not income or spending, and counting them would corrupt both.
create or replace view public.money_monthly as
select
  date_trunc('month', e.occurred_on)::date as month,
  coalesce(nullif(b.currency, ''), '(no currency)') as currency,
  e.scope,
  e.direction,
  sum(e.amount)::numeric(12,2) as total,
  count(*)::int as entries
from public.money_entries e
join public.money_buckets b on b.id = e.bucket_id
group by 1, 2, 3, 4;

-- Spend per category per month, so the summary can show where the money went
-- rather than only how much.
create or replace view public.money_monthly_by_category as
select
  date_trunc('month', e.occurred_on)::date as month,
  coalesce(nullif(b.currency, ''), '(no currency)') as currency,
  e.scope,
  e.category,
  sum(e.amount)::numeric(12,2) as total,
  count(*)::int as entries
from public.money_entries e
join public.money_buckets b on b.id = e.bucket_id
where e.direction = 'OUT'
group by 1, 2, 3, 4;

-- The monthly cap the operator set, summed per currency across live personal
-- buckets. Buckets with no cap contribute 0.
--
-- Safe-to-spend itself is not a view: it is the sum of live PERSONAL_SPENDING
-- bucket balances, which money_bucket_balances already gives exactly. Deriving it
-- from balances rather than from "money in minus money out" is deliberate. An
-- envelope is emptied by spending from it, and no arithmetic on flows can tell you
-- what is left in the envelope without also counting a transfer into it as income.
create or replace view public.money_personal_limits as
select
  coalesce(nullif(currency, ''), '(no currency)') as currency,
  sum(monthly_limit)::numeric(12,2) as limit_total,
  count(*) filter (where monthly_limit > 0)::int as capped_buckets
from public.money_buckets
where role = 'PERSONAL_SPENDING' and archived = false
group by 1;

-- Fees paid on recorded conversions, per month and currency. Summed in SQL from
-- the machine-readable meta rather than by reading note text.
create or replace view public.money_conversion_fees as
select
  date_trunc('month', e.occurred_on)::date as month,
  b.currency as currency,
  sum((e.meta ->> 'fee')::numeric)::numeric(12,2) as fees,
  count(*)::int as conversions
from public.money_entries e
join public.money_buckets b on b.id = e.bucket_id
where e.source = 'CONVERT'
  and e.meta ? 'fee'
  and (e.meta ->> 'fee') <> ''
  and (e.meta ->> 'fee') ~ '^-?[0-9]+(\.[0-9]+)?$'
group by 1, 2;

-- --------------------------------------------------------------------------
-- Lock both tables down to the server, same as discord_accounts.
-- --------------------------------------------------------------------------
-- Every read and write goes through the Vercel functions with the service_role
-- key, which bypasses RLS. Without this the anon key could read or write the
-- ledger if it ever leaked.

alter table public.money_buckets enable row level security;
alter table public.money_entries enable row level security;

-- --------------------------------------------------------------------------
-- Seed the three roles
-- --------------------------------------------------------------------------
-- One of each archetype so the roles are visible and the picker is not empty.
-- Idempotent on the case-insensitive name index, and safe to delete later: the
-- entries belong to buckets, not the other way round.

insert into public.money_buckets (name, role, asset_tag, currency, notes)
values
  ('Trading Capital', 'TRADING_CAPITAL', '', 'EGP',
   'Locked money for buying accounts. Account buys and sale payments post here automatically.'),
  ('USDT', 'LIQUID_ASSETS', 'CRYPTO', 'USDT',
   'Crypto holdings. Use "Convert Crypto to Cash" when you sell.'),
  ('Cash', 'LIQUID_ASSETS', 'LOCAL_CASH', 'EGP',
   'Local cash, e.g. EGP or Vodafone Cash.'),
  ('Personal', 'PERSONAL_SPENDING', '', 'EGP',
   'Monthly allowance. Transfer profit in from Trading Capital to set your limit.')
on conflict (lower(name)) do nothing;

-- --------------------------------------------------------------------------
-- Documentation
-- --------------------------------------------------------------------------

comment on table public.money_buckets is
  'Places money is held, by role: TRADING_CAPITAL (locked for account buys), LIQUID_ASSETS (crypto and local cash), PERSONAL_SPENDING (monthly allowance). Billing metadata is descriptive only - never store full card or billing numbers here.';

comment on column public.money_buckets.role is
  'TRADING_CAPITAL, LIQUID_ASSETS or PERSONAL_SPENDING. This is the separation that stops trading capital being spent on living costs.';

comment on column public.money_buckets.currency is
  'Units for this bucket, e.g. USDT or EGP. Balances are never summed across currencies.';

comment on column public.money_buckets.monthly_limit is
  'Optional monthly cap for a PERSONAL_SPENDING bucket. 0 means no cap.';

comment on table public.money_entries is
  'The money ledger. One row per movement, positive amount with the sign carried by direction.';

comment on column public.money_entries.source_key is
  'Deterministic key for machine-written entries. Uniquely indexed so reconciliation, balance corrections and transfers cannot double-post.';

comment on column public.money_entries.link_key is
  'Shared by the two rows of a transfer or conversion, so the pair can be audited as one movement.';

comment on column public.money_entries.meta is
  'Machine-readable detail, e.g. the exchange rate and fee of a conversion. Never parsed back out of note text.';

comment on column public.money_entries.scope is
  'BUSINESS for account trading, PERSONAL for day-to-day spending, TRANSFER for movements between your own buckets. TRANSFER is excluded from profit and from spending so neither is distorted.';

comment on column public.money_entries.occurred_on is
  'Calendar date of the movement. A date, not a timestamp, so month boundaries do not shift with the server timezone.';

comment on view public.money_personal_limits is
  'Per currency, the monthly cap the operator set on live PERSONAL_SPENDING buckets. Safe-to-spend is the sum of those buckets'' balances, which money_bucket_balances gives exactly.';

comment on view public.money_bucket_base_balances is
  'Per-bucket balance excluding ADJUSTMENT rows. The figure "Set balance" corrects against, so repeated corrections cannot chase their own tail.';