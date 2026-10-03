## Admin Dashboard (License Control)

The operator-facing panel for licenses, Discord account inventory and money. It is
separate from the main dashboard app in `index.html` / `js/manager.js`.

- Markup: `panel_x7k2n9p4h8r3/index.html`
- Logic: `panel_x7k2n9p4h8r3/admin.js`
- Styles: `panel_x7k2n9p4h8r3/admin.css`
- Serverless functions: `api/admin/*`, `api/summary.js`, `api/money.js`

Every request is authenticated with the admin secret as a bearer token. The panel
keeps it in `sessionStorage`, so a refresh does not ask for it again but closing the
tab does. There is one shared `api()` helper that attaches the token, parses the
response and turns `{ success: false, error }` into a thrown `Error`, which every
call site renders through `toast()`.

## Navigation

Four sections, switched by `setNav()`. Each one loads only its own data, so moving
between sections never refetches or disturbs another section's state.

| Section | View element | Loads |
| --- | --- | --- |
| Overview | `overviewView` | `loadKeys()`, `loadPlans()` |
| Accounts | `accountsView` | `loadAccounts()` |
| Money | `moneyView` | `loadMoney()` |
| Settings | `settingsView` | `loadPlans()` |

Overview is the landing page after login.

## Overview

Five KPI tiles, then the full license key table.

### Tiles

| Tile | Element | Meaning |
| --- | --- | --- |
| Total Keys | `statTotal` | Every key row returned by the API. |
| Active | `statActive` | Not revoked, and either no expiry or an expiry still in the future. |
| Revoked / Expired | `statRevoked` | Explicitly revoked, **or** past `expires_at`. The two are deliberately lumped together. |
| Accounts In Use | `statAccounts` | Sum of `activationCount` across all keys. Despite the label this counts license activations, not rows in the accounts table. |
| Plans | `statPlans` | Number of plan templates. |

All five are recomputed client-side in `renderStats()` from the already-loaded
`keys` array, so they cost no extra request. Because the Active/Revoked split is
evaluated in the browser against `Date.now()`, an expired key only moves to
Revoked when the panel re-renders — there is no timer driving it.

### License keys table

Toolbar: search box (`searchInput`), `Export CSV`, and a `N of M` result count.

Search matches `plain_key`, `key_hash`, `owner` and `label` (plan name),
case-insensitively.

Columns: Key, Owner, Plan, Duration, Devices, Activation, Accounts, Status, Last
Valid, Created, Actions.

Row actions:

- **Copy** - writes the key to the clipboard, with a hidden-textarea fallback for
  browsers where the async clipboard API is unavailable.
- **Extend** - adds `max_days_extend` days (default 30).
- **Edit** - opens the key modal.
- **Reset** - clears activations, after a confirmation.
- **Delete** - removes the key, after a confirmation.

`Export CSV` writes the whole `keys` array, not the filtered view, and quotes any
field containing a comma, quote or newline. Columns: Key, Owner, Plan, Status,
Expires, Max Accounts, Accounts Used, Max Devices, Devices Used, Created.

## Accounts

Inventory and profit for each Discord account being resold.

### Tiles

Computed in `renderAccKPIs()` from the loaded `acc.rows`.

| Tile | Element | Meaning |
| --- | --- | --- |
| Tracked | `accStatCount` | Every account row returned. |
| Spent | `accStatSpent` | Sum of `buy_price` across **all** accounts, sold or not. This is money already committed. |
| Collected | `accStatRevenue` | Instalments actually received, summed only over `SOLD` accounts. |
| Profit | `accStatNet` | `collected - spent`. Tinted via `net-positive` / `net-negative`. |
| Owed | `accStatOwed` | Sum of outstanding balances on sold accounts. Hidden entirely while it is zero. |

**Spent counts unsold stock.** It is deliberately not "cost of sold accounts", so
that unsold inventory does not flatter the profit figure. Collected only counts
`SOLD` rows, because nothing has been received against an unsold account.

Each tile is a button (`data-kpi`) that opens a breakdown modal listing the rows
behind the number.

### Payment split

`paySplit(row)` is the single source of truth for what a sale owes:

- `total` = `sell_price`
- `first` = `sell_paid_first`
- `second` = `sell_paid_second`
- `part2Due` = `total - first` (what the second instalment was agreed to be)
- `remaining` = `total - first - second`, negative when the buyer has overpaid
- `settled` = `remaining <= 0`
- `split` = sold, non-zero total, and at least one instalment recorded

`split` is why a plain one-off sale is not treated as a split: it still has a
balance, but nothing has been recorded against it yet, so it keeps the short
export and short copy. An overpaid account reports a negative `remaining` rather
than hiding the overpayment.

### Filtering and ordering

Chips are `all`, `AVAILABLE` (labelled **Unsold**) and `SOLD`. Search matches
`email`, `discord_id`, `username`, `source`, `status_label` and `notes`.

Rows are sorted so non-`SOLD` accounts come first, with the server's own ordering
preserved inside each group. Anything that is not exactly `SOLD` counts as unsold,
so a row with a missing status still surfaces where it can be checked instead of
trailing at the bottom.

### Table

Columns: Account, Email, Passwords, Badges & Nitro, Status, Paid, Sold, Net,
Source, Actions.

`Paid` is `buy_price`, `Sold` is the received instalments, `Net` is the per-row
difference. Badges and Nitro are rendered from the account's badge payload.

## Money

Named balances plus the ledger behind them. Isolated from Accounts: its own state
object, its own filters and its own search box.

Tiles: In hand, Money in, Money out, Saved this month. Each opens a breakdown
modal.

- Balances and monthly totals are summed in SQL (`money_bucket_balances`,
  `money_monthly`, `money_monthly_by_category`) rather than in JavaScript. A
  balance derived from a capped page of entries would be wrong once the ledger
  outgrows the page, so only the displayed rows are paged.
- Entries are tagged `BUSINESS` (trading) or `PERSONAL` (day-to-day), which is
  what splits a month into what the business made and what was spent living.
- Saving an account automatically posts its `buy_price` as money out and each
  received instalment as money in. This is idempotent via a deterministic
  `source_key` with a unique index, so re-saving an account cannot double-post.
- Billing metadata on a bucket is limited to method, identifier, last 4 and notes.
  Never store full card or billing numbers.
- Requires `sql/money_buckets.sql` to have been run. Until it has, every call
  returns a 503 that names the file instead of a raw PostgREST error.

## API Surface

| Call | Purpose |
| --- | --- |
| `GET /api/summary?op=check` | Session probe on load. |
| `POST /api/summary?op=login` | Exchange the secret for a session. |
| `GET /api/summary` | Load all accounts. |
| `POST /api/summary` | Create an account. |
| `PATCH /api/summary?id=<uuid>` | Update an account, including mark-as-sold. |
| `DELETE /api/summary?id=<uuid>` | Delete an account. |
| `GET /api/admin/keys` | Load all keys. |
| `POST /api/admin/keys` | Create a key. |
| `PATCH /api/admin/keys/<uuid>` | Edit or extend a key. |
| `DELETE /api/admin/keys/<uuid>` | Delete a key. |
| `DELETE /api/admin/keys/<uuid>/activations` | Reset activations. |
| `POST /api/admin/validate` | Validate a key against a plan. |
| `GET /api/admin/plans` | Load plans. |
| `POST /api/admin/plans` | Create a plan. |
| `PATCH /api/admin/plans/<uuid>` | Edit a plan. |
| `DELETE /api/admin/plans/<uuid>` | Delete a plan. |
| `GET /api/money` | Buckets, balances, months and entries. |
| `POST /api/money?op=bucket` | Create a bucket. |
| `PATCH /api/money?op=bucket&id=<uuid>` | Edit or archive a bucket. |
| `DELETE /api/money?op=bucket&id=<uuid>` | Delete an empty bucket. |
| `POST /api/money?op=entry` | Add a ledger entry. |
| `PATCH /api/money?op=entry&id=<uuid>` | Edit a manual entry. |
| `DELETE /api/money?op=entry&id=<uuid>` | Delete an entry. |
| `POST /api/money?op=sync&id=<uuid>` | Re-derive one account's entries. |

Vercel's Hobby plan caps a deployment at 12 serverless functions. `api/money.js`
is number 11 and routes every money operation through method + `?op=` in a single
file, so the next feature does not have to squeeze in as a twelfth.

## Conventions Worth Keeping

- Reuse existing IDs and classes rather than introducing parallel ones. Every
  `g('...')` reference in `admin.js` must resolve to a real element.
- Destructive actions confirm first, and reuse the shared `.modal` structure.
- Never let a silent no-op report success. PostgREST answers `PATCH`/`DELETE`
  with `return=minimal`, so an id that matched no rows looks identical to a
  successful write — check the row exists before claiming a save worked.
- Guard every field that reaches SQL or the DOM. Money figures go through a
  float-safe `money2()`/`cents()` helper; user text is escaped before insertion.
- Bump the `admin.js?v=` / `admin.css?v=` cache versions when either changes.
- Validate with `npm.cmd run check` and `git diff --check`.