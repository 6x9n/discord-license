'use strict';

// Money buckets: named balances plus the ledger behind them.
//
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions. This is
// number 11, and like api/summary.js every operation shares one file and is
// routed by method + ?op= so the next feature does not have to squeeze in as a
// twelfth.
//
//   GET    /api/money                         -> buckets, balances, months, entries
//   GET    /api/money?month=YYYY-MM           -> entries for one month
//   POST   /api/money?op=bucket               -> create a bucket
//   PATCH  /api/money?op=bucket&id=<uuid>     -> edit / archive a bucket
//   DELETE /api/money?op=bucket&id=<uuid>     -> delete an empty bucket
//   POST   /api/money?op=entry                -> add a ledger entry
//   PATCH  /api/money?op=entry&id=<uuid>      -> edit an entry
//   DELETE /api/money?op=entry&id=<uuid>      -> delete an entry
//   POST   /api/money?op=adjust               -> set a bucket's balance to a real figure
//   POST   /api/money?op=transfer             -> move money between buckets, same currency
//   POST   /api/money?op=crypto_convert       -> record selling crypto for local currency
//   POST   /api/money?op=sync&id=<accountId>  -> re-derive one account's entries
//
// Requires sql/money_buckets.sql to have been run. Until it has, every call
// returns a clear 503 rather than a raw PostgREST "relation does not exist".

const { rest, readBody, json, handleOptions, isAuthorized } = require('./_lib/supabase.js');
const { syncAccountMoney, cents } = require('./_lib/money-sync.js');

// A bucket's role is the behavioural contract that keeps trading capital out of
// living expenses. See sql/money_buckets.sql.
const BUCKET_ROLES = ['TRADING_CAPITAL', 'LIQUID_ASSETS', 'PERSONAL_SPENDING'];
const ASSET_TAGS = ['', 'CRYPTO', 'LOCAL_CASH'];
const DIRECTIONS = ['IN', 'OUT'];
// TRANSFER exists so a movement between buckets is neither income nor spending.
const SCOPES = ['BUSINESS', 'PERSONAL', 'TRANSFER'];
// What an operator may choose by hand. TRANSFER is machine-written only.
const ENTRY_SCOPES = ['BUSINESS', 'PERSONAL'];
const NO_CURRENCY = '(no currency)';
// The one correction row a bucket may carry. Keyed like the account-derived
// entries so the unique index on source_key makes "set balance" idempotent:
// setting the same figure twice updates one row instead of stacking corrections.
const ADJUSTMENT_KEY_PREFIX = 'adjust:';
const ADJUSTMENT_CATEGORY = 'BALANCE_CORRECTION';
const ACCOUNT_SOURCES = ['ACCOUNT_BUY', 'ACCOUNT_SALE'];

// Entries are paged for display. Totals never come from this page - they come
// from the aggregate views, so a busy ledger cannot quietly under-report.
const DEFAULT_ENTRY_LIMIT = 300;
const MAX_ENTRY_LIMIT = 1000;

function fail(res, status, message) {
  return json(res, status, { success: false, error: message });
}

// A missing table is a migration the operator has not run yet. Say so plainly
// instead of passing through "relation public.money_entries does not exist".
function isMissingTable(err) {
  const code = (err && err.code) || '';
  const message = String((err && err.message) || '');
  return code === '42P01' || code === '42883' || /does not exist|not found.*relation/i.test(message);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const MISSING_TABLES_MESSAGE = 'Money tables are missing. Run sql/money_buckets.sql in the Supabase SQL editor, then reload.';

function authed(req, res) {
  const verdict = isAuthorized(req);
  if (!verdict.ok) {
    fail(res, verdict.error === 'Unauthorized' ? 401 : 500, verdict.error);
    return false;
  }
  return true;
}

/* ---------------- validation ---------------- */

function bucketName(raw) {
  const name = String(raw == null ? '' : raw).trim();
  if (!name) throw badRequest('Give the bucket a name, e.g. Cash or PayPal.');
  if (name.length > 60) throw badRequest('Bucket name is too long (max 60 characters).');
  return name;
}

function bucketRole(raw) {
  const role = String(raw == null ? '' : raw).trim().toUpperCase() || 'LIQUID_ASSETS';
  if (BUCKET_ROLES.indexOf(role) === -1) {
    throw badRequest('Bucket role must be Trading Capital, Liquid Assets or Personal Spending.');
  }
  return role;
}

function assetTag(raw) {
  const tag = String(raw == null ? '' : raw).trim().toUpperCase();
  if (ASSET_TAGS.indexOf(tag) === -1) {
    throw badRequest('Asset tag must be Crypto, Local Cash or empty.');
  }
  return tag;
}

// Capped rather than merely length-limited, because this is shown next to a
// balance and a stray paste should not be able to fill the table.
function currencyCode(raw) {
  const code = String(raw == null ? '' : raw).trim().toUpperCase();
  if (!code) return 'USDT';
  // Only USDT and EGP. Simpler, fewer mistakes, and the sales sync always lands in USDT.
  if (code === 'USDT') return 'USDT';
  if (code === 'EGP') return 'EGP';
  throw badRequest('Currency must be USDT or EGP.');
}

// Accepts the loose truthy spellings a checkbox or query string produces.
function truthy(raw) {
  const value = String(raw == null ? '' : raw).trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function monthlyLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = cents(raw);
  if (!isFinite(value) || value < 0) throw badRequest('Monthly limit cannot be negative.');
  if (value > 999999999.99) throw badRequest('That monthly limit is too large.');
  return cents(value);
}

function last4(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 4) throw badRequest('Last 4 digits only, e.g. 4242.');
  return digits;
}

function short(raw, max, label) {
  const value = String(raw == null ? '' : raw).trim();
  if (value.length > max) throw badRequest(label + ' is too long (max ' + max + ' characters).');
  return value;
}

function amount(raw) {
  const value = cents(raw);
  if (!(value > 0)) throw badRequest('Enter an amount greater than zero.');
  if (value > 9999999.99) throw badRequest('That amount is too large.');
  return value;
}

function occurredOn(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw badRequest('Date must be in YYYY-MM-DD form.');
  // Reject a date the calendar does not have, e.g. 2026-02-31, which would
  // otherwise be stored and then read back as a different day.
  const parsed = new Date(text + 'T00:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw badRequest('That date does not exist.');
  }
  return text;
}

function uuid(raw, label) {
  const value = String(raw == null ? '' : raw).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw badRequest(label + ' is not a valid id.');
  }
  return value;
}

async function assertBucket(bucketId) {
  const rows = await rest(
    'money_buckets?id=eq.' + encodeURIComponent(bucketId) + '&select=id,name,role,asset_tag,currency,monthly_limit,archived&limit=1',
    {}
  );
  if (!rows || !rows.length) throw badRequest('Pick a bucket that exists.');
  return rows[0];
}

// Enforce the safe-to-spend cap.
//
// The rule is deliberately narrow: it only bites on money OUT of a PERSONAL
// bucket that has a cap set. It does not police trading, does not police income,
// and does nothing at all when no limit is configured, so an existing ledger is
// never suddenly over budget.
//
// This returns a description rather than writing an error, because the caller
// decides how to react and the UI can offer "record it anyway" by resending with
// allowOver. Blocking outright would leave the operator unable to enter a real
// expense they have already paid, which is the one thing a ledger must always
// accept.
async function personalLimitCheck(bucket, direction, scope, amountValue) {
  const out = { limited: false, over: false, limit: 0, spent: 0, after: 0, currency: '' };
  if (!bucket || direction !== 'OUT' || scope !== 'PERSONAL') return out;
  if (bucket.role !== 'PERSONAL_SPENDING') return out;
  const limit = cents(bucket.monthly_limit);
  if (!(limit > 0)) return out;

  const month = new Date().toISOString().slice(0, 7);
  const currency = String(bucket.currency || NO_CURRENCY);
  let spent = 0;
  try {
    const rows = await rest(
      'money_monthly?month=eq.' + month + '-01&currency=eq.' + encodeURIComponent(currency)
        + '&scope=eq.PERSONAL&direction=eq.OUT&select=total&limit=1',
      {}
    );
    spent = cents(rows && rows.length ? rows[0].total : 0);
  } catch (err) {
    if (isMissingTable(err)) throw err;
    // A failed read must not silently authorise the write. Treat it as unlimited
    // here and let the caller surface the database error instead.
    return out;
  }
  const after = cents(spent + amountValue);
  return {
    limited: true,
    over: after > limit,
    limit: limit,
    spent: spent,
    after: after,
    currency: currency
  };
}

/* ---------------- reads ---------------- */

// Everything here is grouped by currency on purpose. A single "total" across
// mixed units is the kind of number that looks authoritative and means nothing,
// so the shape is always a list of per-currency figures.

function sumBy(buckets, currencyKey, roleFilter) {
  const out = {};
  buckets.forEach(function (b) {
    if (roleFilter && b.role !== roleFilter) return;
    const key = b[currencyKey] || NO_CURRENCY;
    if (!out[key]) out[key] = { currency: key, balance: 0, in: 0, out: 0, buckets: 0 };
    out[key].balance = cents(out[key].balance + b.balance);
    out[key].in = cents(out[key].in + b.totalIn);
    out[key].out = cents(out[key].out + b.totalOut);
    out[key].buckets++;
  });
  return Object.keys(out).sort().map(function (k) { return out[k]; });
}

function totalsView(live) {
  return {
    // Retained as per-currency lists. The old single-number shape summed mixed
    // currencies, which is why it went.
    byCurrency: sumBy(live, 'currency', null),
    balance: sumBy(live, 'currency', null).reduce(function (s, r) { return cents(s + r.balance); }, 0),
    in: sumBy(live, 'currency', null).reduce(function (s, r) { return cents(s + r.in); }, 0),
    out: sumBy(live, 'currency', null).reduce(function (s, r) { return cents(s + r.out); }, 0),
    mixedCurrencies: new Set(live.map(function (b) { return b.currency || NO_CURRENCY; })).size > 1
  };
}

// The four headline tiles. Kept as per-currency lists for the same reason.
function summaryView(live, monthRows, limitRows) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const limitByCurrency = {};
  (limitRows || []).forEach(function (row) {
    limitByCurrency[String(row.currency || NO_CURRENCY)] = cents(row.limit_total);
  });
  const personalSpend = {};
  (monthRows || []).forEach(function (row) {
    if (String(row.month).slice(0, 7) !== thisMonth) return;
    if (row.scope !== 'PERSONAL' || row.direction !== 'OUT') return;
    const key = String(row.currency || NO_CURRENCY);
    personalSpend[key] = cents((personalSpend[key] || 0) + cents(row.total));
  });

  const personal = sumBy(live, 'currency', 'PERSONAL_SPENDING');
  const safeToSpend = personal.map(function (row) {
    const limit = limitByCurrency[row.currency] || 0;
    const spent = personalSpend[row.currency] || 0;
    return {
      currency: row.currency,
      // The envelope: what is actually left in the personal buckets. Spending
      // draws it down, so this needs no arithmetic on flows to be correct.
      amount: row.balance,
      limit: limit,
      limited: limit > 0,
      spentThisMonth: spent,
      // Red when the envelope is gone, amber when it is nearly so, green
      // otherwise. Without a cap there is nothing to be near, so it stays neutral.
      state: row.balance <= 0 ? 'empty' : (limit > 0 && row.balance <= limit * 0.2 ? 'low' : 'ok'),
      over: limit > 0 && spent > limit
    };
  });

  return {
    liquid: sumBy(live, 'currency', 'LIQUID_ASSETS'),
    trading: sumBy(live, 'currency', 'TRADING_CAPITAL'),
    personal: personal,
    safeToSpend: safeToSpend,
    month: thisMonth
  };
}

function bucketView(row) {
  return {
    id: row.bucket_id,
    name: row.bucket_name,
    role: row.bucket_role || 'LIQUID_ASSETS',
    assetTag: row.bucket_asset_tag || '',
    currency: row.bucket_currency || '',
    monthlyLimit: cents(row.bucket_monthly_limit),
    method: row.bucket_method || '',
    identifier: row.bucket_identifier || '',
    last4: row.bucket_last4 || '',
    notes: row.bucket_notes || '',
    archived: !!row.bucket_archived,
    createdAt: row.bucket_created_at,
    totalIn: cents(row.total_in),
    totalOut: cents(row.total_out),
    balance: cents(row.balance)
  };
}

// Fold the grouped aggregate rows into one figure per month. A month only appears
// once, with business and personal kept apart so "what the trading made" and
// "what living cost" can be read separately and then added.
// Fold the grouped aggregate rows into one figure per month *and currency*.
// Business and personal stay apart so "what the trading made" and "what living
// cost" can be read separately and then added.
//
// TRANSFER rows are skipped outright. Moving money between your own buckets is
// not income and not spending; letting it fall through to the personal branch
// would invent spending, and counting the outgoing leg as trading cost would
// understate profit.
function monthView(rows, categoryRows) {
  const byKey = {};
  function slot(month, currency) {
    const key = month + '|' + currency;
    if (!byKey[key]) {
      byKey[key] = {
        month: month,
        currency: currency,
        businessIn: 0,
        businessOut: 0,
        personalIn: 0,
        personalOut: 0,
        transferred: 0,
        gained: 0,
        spent: 0,
        saved: 0,
        netProfit: 0,
        categories: []
      };
    }
    return byKey[key];
  }
  rows.forEach(function (row) {
    const month = String(row.month).slice(0, 7);
    const currency = String(row.currency || NO_CURRENCY);
    const total = cents(row.total);
    const ref = slot(month, currency);
    if (row.scope === 'BUSINESS') {
      if (row.direction === 'IN') ref.businessIn += total;
      else ref.businessOut += total;
    } else if (row.scope === 'PERSONAL') {
      if (row.direction === 'IN') ref.personalIn += total;
      else ref.personalOut += total;
    } else if (row.direction === 'OUT') {
      // Only the departing leg is counted. Both legs of a movement carry the same
      // amount in the same currency, so adding both would report every transfer
      // and conversion at twice the figure that actually moved.
      ref.transferred += total;
    }
  });
  (categoryRows || []).forEach(function (row) {
    const month = String(row.month).slice(0, 7);
    const currency = String(row.currency || NO_CURRENCY);
    const ref = byKey[month + '|' + currency];
    // Transfers are excluded here too, so a bucket move never appears as a
    // category of spending.
    if (!ref || row.scope === 'TRANSFER') return;
    ref.categories.push({
      scope: row.scope,
      category: row.category,
      total: cents(row.total),
      entries: Number(row.entries) || 0
    });
  });
  return Object.keys(byKey).sort().reverse().map(function (key) {
    const m = byKey[key];
    m.businessIn = cents(m.businessIn);
    m.businessOut = cents(m.businessOut);
    m.personalIn = cents(m.personalIn);
    m.personalOut = cents(m.personalOut);
    m.transferred = cents(m.transferred);
    // Saved is what is left after everything that went out, which is the
    // headline the operator asked to see each month.
    m.gained = cents(m.businessIn + m.personalIn);
    m.spent = cents(m.businessOut + m.personalOut);
    m.saved = cents(m.gained - m.spent);
    // Trading profit on its own, ignoring personal spending. This is the number
    // that funds the next purchase, so it must not move when the operator buys
    // lunch.
    m.netProfit = cents(m.businessIn - m.businessOut);
    m.categories.sort(function (a, b) { return b.total - a.total; });
    return m;
  });
}

async function listMoney(req, res) {
  const month = String((req.query && req.query.month) || '').trim();
  let balances, months, categoryRows, entries, limits;
  try {
    balances = await rest('money_bucket_balances?select=*&order=bucket_created_at.asc', {});
    months = await rest('money_monthly?select=*', {});
    categoryRows = await rest('money_monthly_by_category?select=*', {});
    limits = await rest('money_personal_limits?select=*', {});
  } catch (err) {
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load money data.');
  }

  // One page of entries for display. A month filter narrows it further.
  const limitRaw = Number((req.query && req.query.limit) || 0);
  const limit = limitRaw > 0 ? Math.min(limitRaw, MAX_ENTRY_LIMIT) : DEFAULT_ENTRY_LIMIT;
  let query = 'money_entries?select=*,money_buckets(name)&order=occurred_on.desc,created_at.desc&limit=' + limit;
  if (/^\d{4}-\d{2}$/.test(month)) {
    // Exclusive upper bound at the first of the next month, rather than
    // "lte.<month>-31". A calendar has no 31st in February, so that form either
    // errors or silently drops the last day depending on the driver.
    const parts = month.split('-');
    const nextYear = Number(parts[0]) + (Number(parts[1]) === 12 ? 1 : 0);
    const nextMonth = (Number(parts[1]) % 12) + 1;
    const exclusive = nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01';
    query += '&occurred_on=gte.' + month + '-01'
      + '&occurred_on=lt.' + exclusive;
  }
  try {
    entries = await rest(query, {});
  } catch (err) {
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load entries.');
  }

  const buckets = (balances || []).map(bucketView);
  const live = buckets.filter(function (b) { return !b.archived; });
  return json(res, 200, {
    success: true,
    data: {
      buckets: buckets,
      totals: totalsView(live),
      // The four headline figures the money page leads with. Each is a per-currency
      // list, never a single number, because the currencies do not add up.
      summary: summaryView(live, months || [], limits || []),
      months: monthView(months || [], categoryRows || []),
      entries: (entries || []).map(function (row) {
        return {
          id: row.id,
          bucketId: row.bucket_id,
          bucketName: (row.money_buckets && row.money_buckets.name) || '',
          bucketRole: (row.money_buckets && row.money_buckets.role) || '',
          bucketCurrency: (row.money_buckets && row.money_buckets.currency) || '',
          direction: row.direction,
          amount: cents(row.amount),
          scope: row.scope,
          category: row.category,
          occurredOn: row.occurred_on,
          note: row.note || '',
          source: row.source,
          // Both legs of a movement share this, so a transfer or a conversion can
          // be undone as one thing instead of leaving half a movement behind.
          linkKey: row.link_key || '',
          meta: row.meta || null,
          // Three different reasons an entry may resist editing, so the UI can
          // explain the right one: an account owns its rows, and a correction is
          // rewritten wholesale by "Set balance" rather than edited by hand.
          accountDerived: ACCOUNT_SOURCES.indexOf(row.source) !== -1,
          adjustment: row.source === 'ADJUSTMENT',
          // Anything not MANUAL is driven from elsewhere, so the Add Money form
          // must not offer to edit it.
          locked: row.source !== 'MANUAL',
          accountId: row.account_id
        };
      })
    }
  });
}

/* ---------------- writes ---------------- */

async function createBucket(req, res) {
  const body = await readBody(req);
  let row;
  try {
    row = {
      name: bucketName(body.name),
      role: bucketRole(body.role),
      asset_tag: assetTag(body.asset_tag),
      currency: currencyCode(body.currency),
      monthly_limit: monthlyLimit(body.monthly_limit) || 0,
      method: short(body.method, 60, 'Method'),
      identifier: short(body.identifier, 80, 'Identifier'),
      last4: last4(body.last4),
      notes: short(body.notes, 300, 'Notes')
    };
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid bucket.');
  }
  try {
    const inserted = await rest('money_buckets', { method: 'POST', body: row });
    return json(res, 200, { success: true, data: inserted && inserted[0] });
  } catch (err) {
    if (err && err.code === '23505') {
      return fail(res, 409, 'A bucket with that name already exists.');
    }
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not save the bucket.');
  }
}

async function updateBucket(req, res, id) {
  const body = await readBody(req);
  const patch = {};
  try {
    if (body.name !== undefined) patch.name = bucketName(body.name);
    if (body.role !== undefined) patch.role = bucketRole(body.role);
    if (body.asset_tag !== undefined) patch.asset_tag = assetTag(body.asset_tag);
    if (body.currency !== undefined) patch.currency = currencyCode(body.currency);
    if (body.monthly_limit !== undefined) {
      const limit = monthlyLimit(body.monthly_limit);
      // 0 is a legitimate value here meaning "no cap", so only skip when the
      // field was absent entirely.
      if (limit !== undefined) patch.monthly_limit = limit;
    }
    if (body.method !== undefined) patch.method = short(body.method, 60, 'Method');
    if (body.identifier !== undefined) patch.identifier = short(body.identifier, 80, 'Identifier');
    if (body.last4 !== undefined) patch.last4 = last4(body.last4);
    if (body.notes !== undefined) patch.notes = short(body.notes, 300, 'Notes');
    if (typeof body.archived === 'boolean') patch.archived = body.archived;
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid bucket.');
  }
  if (!Object.keys(patch).length) return fail(res, 400, 'Nothing to update.');
  // PostgREST answers PATCH with return=minimal, so "matched no rows" and
  // "wrote the row" both come back as an empty body. Without this check a stale
  // id reports success and changes nothing.
  try {
    const existing = await rest('money_buckets?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1', {});
    if (!existing || !existing.length) return fail(res, 404, 'That bucket no longer exists. Refresh and try again.');
  } catch (err) {
    if (isMissingTable(err)) return fail(res, 503, MISSING_TABLES_MESSAGE);
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load the bucket.');
  }
  try {
    const updated = await rest('money_buckets?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
    return json(res, 200, { success: true, data: updated && updated[0] });
  } catch (err) {
    if (err && err.code === '23505') {
      return fail(res, 409, 'A bucket with that name already exists.');
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not update the bucket.');
  }
}

async function deleteBucket(req, res, id) {
  let bucketRows;
  try {
    bucketRows = await rest('money_buckets?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1', {});
  } catch (err) {
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load the bucket.');
  }
  if (!bucketRows || !bucketRows.length) return fail(res, 404, 'That bucket no longer exists. Refresh and try again.');
  let entries;
  try {
    entries = await rest('money_entries?bucket_id=eq.' + encodeURIComponent(id) + '&select=id&limit=1', {});
  } catch (err) {
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not check the bucket.');
  }
  // Deleting a bucket that has history would silently rewrite past months, since
  // the entries go with it. Archive it instead: the balance leaves the totals but
  // the record stays.
  if (entries && entries.length) {
    return fail(res, 409, 'This bucket has entries. Archive it instead so past months keep their figures.');
  }
  try {
    await rest('money_buckets?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    return json(res, 200, { success: true });
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not delete the bucket.');
  }
}

/* ---------------- balance corrections ---------------- */

// Make a bucket's balance equal a figure the operator can actually see, by
// writing one correction row for the difference. Nothing is overwritten, so the
// month the correction lands in is restated and no earlier month moves.
//
// The difference is measured against money_bucket_base_balances, which excludes
// corrections. Correcting against the visible balance instead would make the
// second call compute zero and quietly do nothing.
async function adjustBalance(req, res) {
  const body = await readBody(req);
  let bucketId;
  let target;
  let scope;
  try {
    bucketId = uuid(field(body, 'bucketId', 'bucket_id'), 'Bucket');
    if (body.balance === undefined || body.balance === null || body.balance === '') {
      throw badRequest('Enter the balance you actually have.');
    }
    target = Number(body.balance);
    if (!isFinite(target)) throw badRequest('Enter the balance as a number, for example 123.45.');
    // A negative target is allowed: a bucket can genuinely be overdrawn. The
    // correction still stores a positive amount and lets `direction` carry the
    // sign, so the amount check on the column stays meaningful.
    if (Math.abs(target) > 99999999999.99) throw badRequest('That balance is too large to be real.');
    target = cents(target);
    scope = String(body.scope == null ? '' : body.scope).trim().toUpperCase() || 'PERSONAL';
    // Same rule as a hand-entered entry: a correction is not a movement between
    // buckets, so TRANSFER is not a scope it can claim.
    if (ENTRY_SCOPES.indexOf(scope) === -1) throw badRequest('Scope must be Business or Personal.');
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid balance.');
  }

  let bucketRows;
  let baseRows;
  try {
    bucketRows = await rest('money_buckets?id=eq.' + encodeURIComponent(bucketId) + '&select=id,name,archived&limit=1', {});
    baseRows = await rest('money_bucket_base_balances?bucket_id=eq.' + encodeURIComponent(bucketId) + '&select=base_balance&limit=1', {});
  } catch (err) {
    if (isMissingTable(err)) return fail(res, 503, MISSING_TABLES_MESSAGE);
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load the bucket.');
  }
  if (!bucketRows || !bucketRows.length) return fail(res, 404, 'That bucket no longer exists. Refresh and try again.');
  if (bucketRows[0].archived) {
    return fail(res, 409, 'This bucket is archived, so its balance is not counted. Unarchive it first.');
  }

  const base = cents(baseRows && baseRows.length ? baseRows[0].base_balance : 0);
  const delta = cents(target - base);
  const key = ADJUSTMENT_KEY_PREFIX + bucketId;
  const today = new Date().toISOString().slice(0, 10);

  let existing;
  try {
    existing = await rest('money_entries?source_key=eq.' + encodeURIComponent(key) + '&select=id&limit=1', {});
  } catch (err) {
    if (isMissingTable(err)) return fail(res, 503, MISSING_TABLES_MESSAGE);
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not read the current correction.');
  }
  const currentId = (existing && existing.length) ? existing[0].id : null;

  // Nothing to correct: drop any correction that was there, so setting the
  // balance back to the real figure leaves the ledger clean instead of holding a
  // pointless zero-ish row.
  if (delta === 0) {
    if (currentId) {
      try {
        await rest('money_entries?id=eq.' + encodeURIComponent(currentId), { method: 'DELETE' });
      } catch (err) {
        return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not clear the correction.');
      }
    }
    return json(res, 200, {
      success: true,
      data: {
        balance: base,
        base: base,
        delta: 0,
        changed: false,
        cleared: !!currentId,
        message: 'That is already the balance, so no correction was needed.'
      }
    });
  }

  const direction = delta > 0 ? 'IN' : 'OUT';
  const magnitude = Math.abs(delta);
  const row = {
    bucket_id: bucketId,
    direction: direction,
    amount: magnitude.toFixed(2),
    scope: scope,
    category: ADJUSTMENT_CATEGORY,
    occurred_on: today,
    note: short(body.note, 300, 'Note') || ('Balance set to ' + target.toFixed(2) + ' (was ' + base.toFixed(2) + ')'),
    source: 'ADJUSTMENT',
    source_key: key
  };

  try {
    if (currentId) {
      await rest('money_entries?id=eq.' + encodeURIComponent(currentId), { method: 'PATCH', body: row });
    } else {
      await rest('money_entries', { method: 'POST', body: row });
    }
  } catch (err) {
    if (err && err.code === '23505') {
      // Two corrections raced. The other one won, so the stored figure is
      // already correct and re-reading it is the honest answer.
      return json(res, 200, {
        success: true,
        data: { balance: target, base: base, delta: delta, changed: true, message: 'Balance saved.' }
      });
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not save the balance.');
  }

  return json(res, 200, {
    success: true,
    data: {
      balance: target,
      base: base,
      delta: delta,
      changed: true,
      message: delta > 0
        ? 'Added ' + magnitude.toFixed(2) + ' to match the balance you have.'
        : 'Removed ' + magnitude.toFixed(2) + ' to match the balance you have.'
    }
  });
}

/* ---------------- movements between buckets ---------------- */

// Write both legs of a movement, or neither.
//
// PostgREST gives us one row per request and no transaction across requests, so a
// transfer that fails on its second leg would otherwise leave money vanished from
// one bucket and credited to nothing. The second leg failing therefore triggers a
// compensating delete of the first, and the operator is told the whole thing was
// rolled back rather than half-applied.
async function writeMovementPair(legs) {
  const linkKey = legs.linkKey;
  let firstId = null;
  try {
    const inserted = await rest('money_entries', { method: 'POST', body: legs.out });
    firstId = inserted && inserted[0] ? inserted[0].id : null;
  } catch (err) {
    return { ok: false, error: err };
  }
  try {
    await rest('money_entries', { method: 'POST', body: legs.in });
  } catch (err) {
    if (firstId) {
      try {
        await rest('money_entries?id=eq.' + encodeURIComponent(firstId), { method: 'DELETE' });
      } catch (rollbackErr) {
        // The first leg is stranded. Say so explicitly: a silent partial write is
        // worse than an ugly error, because the operator would not know to look.
        err.partialWrite = true;
        err.rollbackMessage = (rollbackErr && rollbackErr.message) || 'Could not be undone automatically.';
        return { ok: false, error: err };
      }
    }
    return { ok: false, error: err };
  }
  return { ok: true, linkKey: linkKey };
}

function movementLinkKey(prefix) {
  return prefix + ':' + new Date().toISOString().slice(0, 10) + ':'
    + Math.random().toString(36).slice(2, 10);
}

function movementFailure(res, result, what) {
  const err = result.error || {};
  if (isMissingTable(err)) return fail(res, 503, MISSING_TABLES_MESSAGE);
  if (err.partialWrite) {
    return fail(res, 500, what + ' failed halfway and could not be rolled back ('
      + (err.rollbackMessage || 'unknown error') + '). Set the balance on both buckets to correct it.');
  }
  return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || (what + ' failed.'));
}

// Move money between two buckets.
//
// Same currency only. Adding 500 EGP to 2 USDT is not a transfer, it is a
// conversion, and it needs a rate - which is what op=crypto_convert records. This
// is the guard that stops a mixed-unit mistake being filed as a simple move.
async function transferFunds(req, res) {
  const body = await readBody(req);
  let fromId;
  let toId;
  let value;
  let date;
  let note;
  try {
    fromId = uuid(field(body, 'fromBucketId', 'from_bucket_id'), 'Source bucket');
    toId = uuid(field(body, 'toBucketId', 'to_bucket_id'), 'Target bucket');
    if (fromId === toId) throw badRequest('Pick two different buckets.');
    value = amount(body.amount);
    date = occurredOn(body.occurredOn);
    note = short(body.note, 300, 'Note');
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid transfer.');
  }

  let fromBucket;
  let toBucket;
  try {
    fromBucket = await assertBucket(fromId);
    toBucket = await assertBucket(toId);
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid transfer.');
  }
  if (fromBucket.archived || toBucket.archived) {
    return fail(res, 409, 'Archived buckets cannot be used. Unarchive it first.');
  }
  const fromCurrency = String(fromBucket.currency || '');
  const toCurrency = String(toBucket.currency || '');
  if (fromCurrency !== toCurrency) {
    return fail(res, 400, 'These buckets hold different currencies (' + (fromCurrency || 'none set')
      + ' and ' + (toCurrency || 'none set') + '). Use "Convert Crypto to Cash" to record an exchange rate.');
  }

  const linkKey = movementLinkKey('transfer');
  const common = {
    scope: 'TRANSFER',
    amount: value.toFixed(2),
    occurred_on: date,
    source: 'TRANSFER',
    link_key: linkKey
  };
  const result = await writeMovementPair({
    linkKey: linkKey,
    out: Object.assign({}, common, {
      bucket_id: fromId,
      direction: 'OUT',
      category: 'TRANSFER_OUT',
      note: note || ('To ' + toBucket.name)
    }),
    in: Object.assign({}, common, {
      bucket_id: toId,
      direction: 'IN',
      category: 'TRANSFER_IN',
      note: note || ('From ' + fromBucket.name)
    })
  });
  if (!result.ok) return movementFailure(res, result, 'Transfer');

  return json(res, 200, {
    success: true,
    data: {
      linkKey: linkKey,
      amount: value,
      currency: fromCurrency || NO_CURRENCY,
      from: fromBucket.name,
      to: toBucket.name,
      message: 'Moved ' + value.toFixed(2) + ' from ' + fromBucket.name + ' to ' + toBucket.name + '.'
    }
  });
}

// Record selling crypto for local currency.
//
// This exists so the arithmetic is never done by hand. The operator states what
// they sold and what they received; the rate is recorded alongside both figures,
// and a disagreement between rate and outcome is stored rather than corrected, so
// the real fee that was paid is visible in a report later.
async function convertCrypto(req, res) {
  const body = await readBody(req);
  let fromId;
  let toId;
  let sold;
  let received;
  let rate;
  let fee;
  let date;
  let note;
  try {
    fromId = uuid(field(body, 'fromBucketId', 'from_bucket_id'), 'Crypto bucket');
    toId = uuid(field(body, 'toBucketId', 'to_bucket_id'), 'Cash bucket');
    if (fromId === toId) throw badRequest('Pick two different buckets.');
    sold = amount(field(body, 'cryptoAmountSold', 'crypto_amount_sold'));
    received = amount(field(body, 'localCurrencyReceived', 'local_currency_received'));
    date = occurredOn(body.occurredOn);
    note = short(body.note, 300, 'Note');
    // A rate is optional only if both figures were given, which they always are:
    // the recorded amount is what actually moved, and the rate is derived from it
    // when omitted.
    const rawRate = field(body, 'exchangeRate', 'exchange_rate');
    if (rawRate === undefined || rawRate === null || rawRate === '') {
      rate = null;
    } else {
      rate = Number(rawRate);
      if (!isFinite(rate) || rate <= 0) throw badRequest('Exchange rate must be a number greater than zero.');
      if (rate > 1000000000) throw badRequest('That exchange rate looks wrong.');
    }
    if (fee === undefined) fee = 0;
    const rawFee = (body.fee === undefined || body.fee === null || body.fee === '') ? 0 : Number(body.fee);
    if (!isFinite(rawFee) || rawFee < 0) throw badRequest('Fee cannot be negative.');
    fee = cents(rawFee);
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid conversion.');
  }

  let fromBucket;
  let toBucket;
  try {
    fromBucket = await assertBucket(fromId);
    toBucket = await assertBucket(toId);
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid conversion.');
  }
  if (fromBucket.archived || toBucket.archived) {
    return fail(res, 409, 'Archived buckets cannot be used. Unarchive it first.');
  }
  if (fromId === toId) return fail(res, 400, 'Pick two different buckets.');

  const expected = cents(sold * (rate === null ? 0 : rate));
  // Derive the effective rate from what was actually received, so the stored
  // figures always reconcile with each other even if the operator typed the rate
  // loosely or left it out.
  const effective = Math.round((received / sold) * 1e8) / 1e8;
  const mismatch = rate !== null ? Math.abs(expected - received) >= 0.01 : false;

  const linkKey = movementLinkKey('convert');
  const meta = {
    sold: sold.toFixed(2),
    received: received.toFixed(2),
    from_currency: String(fromBucket.currency || ''),
    to_currency: String(toBucket.currency || ''),
    rate: String(effective),
    typed_rate: rate === null ? null : String(rate),
    fee: fee.toFixed(2),
    mismatch: mismatch
  };
  const common = {
    scope: 'TRANSFER',
    occurred_on: date,
    source: 'CONVERT',
    link_key: linkKey,
    meta: meta
  };
  const result = await writeMovementPair({
    linkKey: linkKey,
    out: Object.assign({}, common, {
      bucket_id: fromId,
      direction: 'OUT',
      amount: sold.toFixed(2),
      category: 'CRYPTO_SOLD',
      note: note || ('Sold for ' + received.toFixed(2) + ' at ' + effective)
    }),
    in: Object.assign({}, common, {
      bucket_id: toId,
      direction: 'IN',
      amount: received.toFixed(2),
      category: 'CRYPTO_BUY',
      note: note || ('Bought with ' + sold.toFixed(2) + ' at ' + effective)
    })
  });
  if (!result.ok) return movementFailure(res, result, 'Conversion');

  return json(res, 200, {
    success: true,
    data: {
      linkKey: linkKey,
      sold: sold,
      received: received,
      rate: effective,
      typedRate: rate,
      fee: fee,
      mismatch: mismatch,
      from: fromBucket.name,
      to: toBucket.name,
      message: 'Recorded ' + sold.toFixed(2) + ' ' + (fromBucket.currency || 'sold')
        + ' into ' + received.toFixed(2) + ' ' + (toBucket.currency || 'received')
        + ' at ' + effective + '.'
    }
  });
}

// The dashboard speaks camelCase and the database speaks snake_case, and the
// movement operations were written snake_case first. Resolving both at the edge
// is cheaper than making every caller remember which door a given field uses,
// and it keeps the old dashboard working while the new screens are being built.
function field(body, camelName, snakeName) {
  if (!body) return undefined;
  const camel = body[camelName];
  if (camel !== undefined && camel !== null && camel !== '') return camel;
  return body[snakeName];
}

function entryRow(body, existingBucketId) {
  const wanted = field(body, 'bucketId', 'bucket_id');
  const bucketId = wanted !== undefined && wanted !== null && wanted !== ''
    ? uuid(wanted, 'Bucket')
    : (existingBucketId || '');
  if (!bucketId) throw badRequest('Choose which bucket this money went through.');
  const direction = String(body.direction == null ? '' : body.direction).trim().toUpperCase();
  if (DIRECTIONS.indexOf(direction) === -1) throw badRequest('Choose money in or money out.');
  const scope = String(body.scope == null ? '' : body.scope).trim().toUpperCase() || 'PERSONAL';
  // TRANSFER is deliberately not offered by hand: it is written by the transfer
  // and convert operations, where the other leg is guaranteed to exist. Accepting
  // it here would let someone record a transfer with nothing on the other side.
  if (ENTRY_SCOPES.indexOf(scope) === -1) throw badRequest('Scope must be Business or Personal.');
  // source, source_key, link_key and meta are never taken from the request. They
  // mark who owns the row, and a hand-entered entry is always MANUAL. The source
  // is set explicitly rather than left to the column default, so provenance stays
  // correct even if the migration is edited or reapplied later.
  return {
    bucket_id: bucketId,
    direction: direction,
    amount: amount(body.amount),
    scope: scope,
    category: short(body.category, 40, 'Category') || 'OTHER',
    occurred_on: occurredOn(body.occurredOn),
    note: short(body.note, 300, 'Note'),
    source: 'MANUAL'
  };
}

async function createEntry(req, res) {
  const body = await readBody(req);
  let row;
  let bucket;
  let limit;
  try {
    row = entryRow(body, null);
    bucket = await assertBucket(row.bucket_id);
    limit = await personalLimitCheck(bucket, row.direction, row.scope, row.amount);
  } catch (err) {
    if (isMissingTable(err)) return fail(res, 503, MISSING_TABLES_MESSAGE);
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid entry.');
  }
  if (limit.over && !truthy(body.allowOver)) {
    return json(res, 409, {
      success: false,
      error: 'That would take you past your safe-to-spend limit.',
      limit: limit
    });
  }
  try {
    const inserted = await rest('money_entries', { method: 'POST', body: row });
    return json(res, 200, {
      success: true,
      data: inserted && inserted[0],
      limit: limit
    });
  } catch (err) {
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not save the entry.');
  }
}

async function updateEntry(req, res, id) {
  const body = await readBody(req);
  let rows;
  try {
    rows = await rest('money_entries?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', {});
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load the entry.');
  }
  if (!rows || !rows.length) return fail(res, 404, 'Entry not found.');
  const existing = rows[0];
  // Two different reasons to refuse, because the operator can only act on one of
  // them. A correction is not hand-editable because "Set balance" recomputes it
  // from the difference; editing the figure would leave the bucket sitting at
  // whatever was typed until the next correction.
  if (existing.source === 'ADJUSTMENT') {
    return fail(res, 409, 'This is a balance correction. Use "Set balance" to change the figure instead.');
  }
  if (existing.source === 'TRANSFER' || existing.source === 'CONVERT') {
    return fail(res, 409, 'This row is one leg of a movement between buckets. Undo that movement instead of editing one side.');
  }
  if (existing.source !== 'MANUAL') {
    return fail(res, 409, 'This entry came from an account and follows it. Edit the account instead.');
  }
  let patch;
  try {
    patch = entryRow(body, existing.bucket_id);
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 400, (err && err.message) || 'Invalid entry.');
  }
  try {
    await assertBucket(patch.bucket_id);
    const updated = await rest('money_entries?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
    return json(res, 200, { success: true, data: updated && updated[0] });
  } catch (err) {
    if (isMissingTable(err)) {
      return fail(res, 503, MISSING_TABLES_MESSAGE);
    }
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not update the entry.');
  }
}

async function deleteEntry(req, res, id) {
  let rows;
  try {
    rows = await rest('money_entries?id=eq.' + encodeURIComponent(id) + '&select=source&limit=1', {});
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load the entry.');
  }
  if (!rows || !rows.length) return fail(res, 404, 'Entry not found.');
  const source = rows[0].source;
  // Deleting a row that something else owns is allowed but pointless: it comes
  // back on its own. Say which case this is rather than letting a delete look
  // like it stuck.
  let note = null;
  if (source === 'ADJUSTMENT') {
    note = 'Correction cleared. The balance is back to whatever the actual movements add up to.';
  } else if (source !== 'MANUAL') {
    note = 'Removed. It will reappear when that account is next saved, because the account is the source of truth.';
  }
  try {
    await rest('money_entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    return json(res, 200, {
      success: true,
      data: { source: source, note: note }
    });
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not delete the entry.');
  }
}

// Re-derive one account's entries. Saving an account already does this, so this
// is the manual repair button for when buckets were added after the fact.
async function syncAccount(req, res) {
  let id;
  try {
    id = uuid((req.query && req.query.id) || '', 'Account');
  } catch (err) {
    return fail(res, (err && err.status) || 400, (err && err.message) || 'Invalid account.');
  }
  let rows;
  try {
    rows = await rest('discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', {});
  } catch (err) {
    return fail(res, (err && err.status) ? err.status : 500, (err && err.message) || 'Could not load the account.');
  }
  if (!rows || !rows.length) return fail(res, 404, 'Account not found.');
  const result = await syncAccountMoney(rows[0], {});
  if (!result.ok) {
    return fail(res, 503, result.reason || 'Could not update the money ledger.');
  }
  return json(res, 200, { success: true, data: result.posted });
}

/* ---------------- router ---------------- */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return handleOptions(res);

  const op = String((req.query && req.query.op) || '').trim();
  const id = String((req.query && req.query.id) || '').trim();

  if (req.method === 'GET') {
    if (!authed(req, res)) return;
    return listMoney(req, res);
  }

  if (req.method === 'POST') {
    if (!authed(req, res)) return;
    if (op === 'bucket') return createBucket(req, res);
    if (op === 'entry') return createEntry(req, res);
    if (op === 'adjust') return adjustBalance(req, res);
    if (op === 'transfer') return transferFunds(req, res);
    if (op === 'crypto_convert') return convertCrypto(req, res);
    if (op === 'sync') return syncAccount(req, res);
    return fail(res, 400, 'Unknown operation.');
  }

  if (req.method === 'PATCH') {
    if (!authed(req, res)) return;
    if (!id) return fail(res, 400, 'Id is required.');
    if (op === 'bucket') return updateBucket(req, res, id);
    if (op === 'entry') return updateEntry(req, res, id);
    return fail(res, 400, 'Unknown operation.');
  }

  if (req.method === 'DELETE') {
    if (!authed(req, res)) return;
    if (!id) return fail(res, 400, 'Id is required.');
    if (op === 'bucket') return deleteBucket(req, res, id);
    if (op === 'entry') return deleteEntry(req, res, id);
    return fail(res, 400, 'Unknown operation.');
  }

  return fail(res, 405, 'Method not allowed');
};