'use strict';

// Keeps the money ledger in step with the accounts table.
//
// An account is supposed to move money twice at most: OUT by what it cost to
// acquire, and IN by each instalment of a sale that has actually been received.
// Both are derived, so they are recomputed from the account row every time rather
// than being posted once at save time. That matters because the figures move
// after the fact - a buy price gets corrected, a buyer pays the second half
// later - and an event log would drift out of step with the accounts it came
// from.
//
// Every derived entry carries a deterministic source_key and is uniquely indexed,
// so reconciliation is idempotent: re-saving an account updates the existing
// entry to the current figure instead of adding another. Nothing double-counts
// however many times the account is edited.
//
// NEVER THROWS. The accounts table must keep saving even when the money tables
// have not been created yet, so a missing migration degrades to "no ledger" and
// reports that back rather than failing the save.

const { rest } = require('./supabase.js');

const CATEGORY_BUY = 'ACCOUNT_BUY';
const CATEGORY_SALE = 'ACCOUNT_SALE';

function cents(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round(v * 100) / 100 + 0;
}

function money(raw) {
  const v = cents(raw);
  return v > 0 ? v : null;
}

// date_trunc buckets by calendar month, and the ledger stores a plain date, so
// the month a movement lands in is decided by that date rather than by whenever
// the row happened to be written.
function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Prefer the Discord ID for the key. It survives deleting an account row and
// adding the same account again, which a row UUID would not: the re-added row
// would get a new key and post the cost a second time. Accounts with no Discord
// ID fall back to the row ID, since there is nothing stable to key on.
function accountKey(account) {
  return String(account.discord_id || '').trim() || String(account.id || '');
}

// Account-derived movements use only the operator's canonical USDT wallet.
// Never fall back to a differently named bucket or a different currency.
async function findUSDTBucketId() {
  const rows = await rest(
    'money_buckets?name=eq.' + encodeURIComponent('USDT')
      + '&currency=eq.' + encodeURIComponent('USDT')
      + '&archived=eq.false&select=id&limit=1',
    {}
  );
  return (rows && rows[0] && rows[0].id) || null;
}

async function findEntry(sourceKey) {
  const rows = await rest(
    'money_entries?source_key=eq.' + encodeURIComponent(sourceKey)
      + '&select=id,amount,bucket_id&limit=1',
    {}
  );
  return (rows && rows[0]) || null;
}

// Bring one derived entry to the amount the account row implies. A nil target
// means the movement no longer exists (price zeroed, instalment removed), so the
// entry is deleted rather than left behind at a stale figure.
async function reconcile(spec) {
  const existing = await findEntry(spec.sourceKey);
  if (spec.amount === null) {
    if (existing) {
      await rest('money_entries?id=eq.' + encodeURIComponent(existing.id), { method: 'DELETE' });
      return 'deleted';
    }
    return 'absent';
  }
  if (existing) return updateExistingEntry(existing, spec);

  try {
    await rest('money_entries', {
      method: 'POST',
      body: {
        bucket_id: spec.bucketId,
        direction: spec.direction,
        amount: spec.amount,
        scope: 'BUSINESS',
        category: spec.category,
        occurred_on: spec.occurredOn,
        note: spec.note,
        source: spec.source,
        source_key: spec.sourceKey,
        account_id: spec.accountId
      }
    });
    return 'created';
  } catch (err) {
    // A concurrent save may win the unique source_key insert. Re-read and
    // reconcile that row instead of reporting a false sync failure.
    const concurrent = await findEntry(spec.sourceKey);
    if (!concurrent) throw err;
    return updateExistingEntry(concurrent, spec);
  }
}

async function updateExistingEntry(existing, spec) {
  // Re-saving also repairs a derived row left in an old bucket by a previous
  // version of the account sync.
  const sameAmount = cents(existing.amount) === spec.amount;
  const sameBucket = existing.bucket_id === spec.bucketId;
  if (sameAmount && sameBucket) return 'unchanged';
  await rest('money_entries?id=eq.' + encodeURIComponent(existing.id), {
    method: 'PATCH',
    body: {
      bucket_id: spec.bucketId,
      amount: spec.amount,
      occurred_on: spec.occurredOn,
      note: spec.note,
      account_id: spec.accountId
    }
  });
  return sameBucket ? 'updated' : 'moved';
}

/**
 * Reconcile the ledger for one account row.
 *
 * @param {object} account  A discord_accounts row, post-write.
 * @returns {Promise<{ok: boolean, reason?: string, posted?: object}>}
 */
async function syncAccountMoney(account) {
  if (!account || !account.id) {
    return { ok: false, reason: 'No account to reconcile.' };
  }
  try {
    const bucketId = await findUSDTBucketId();
    if (!bucketId) {
      return {
        ok: false,
        reason: 'The live "USDT" bucket with currency USDT was not found. Account money was not synced.'
      };
    }

    const key = accountKey(account);
    if (!key) return { ok: false, reason: 'Account has no id to reconcile against.' };

    const staleMirrorFirst = await findEntry('usdt:sale1:' + key);
    const staleMirrorSecond = await findEntry('usdt:sale2:' + key);
    if (staleMirrorFirst || staleMirrorSecond) {
      return {
        ok: false,
        reason: 'A stale duplicate account-sale ledger entry exists. It was left unchanged; run the approved cleanup migration before reconciling this account.'
      };
    }

    const label = account.username
      ? '@' + account.username
      : (account.discord_id ? 'account ' + account.discord_id : 'account');
    const soldAt = toDate(account.sold_at);
    const addedOn = toDate(account.created_at) || today();

    const posted = {
      buy: await reconcile({
        bucketId: bucketId,
        direction: 'OUT',
        amount: money(account.buy_price),
        category: CATEGORY_BUY,
        occurredOn: addedOn,
        note: 'Bought ' + label,
        source: 'ACCOUNT_BUY',
        sourceKey: 'buy:' + key,
        accountId: account.id
      }),
      saleFirst: await reconcile({
        bucketId: bucketId,
        direction: 'IN',
        amount: money(account.sell_paid_first),
        category: CATEGORY_SALE,
        occurredOn: soldAt || addedOn,
        note: 'Part 1 from ' + label,
        source: 'ACCOUNT_SALE',
        sourceKey: 'sale1:' + key,
        accountId: account.id
      }),
      saleSecond: await reconcile({
        bucketId: bucketId,
        direction: 'IN',
        amount: money(account.sell_paid_second),
        category: CATEGORY_SALE,
        occurredOn: soldAt || addedOn,
        note: 'Part 2 from ' + label,
        source: 'ACCOUNT_SALE',
        sourceKey: 'sale2:' + key,
        accountId: account.id
      }),
    };
    return { ok: true, posted: posted, bucketId: bucketId };
  } catch (err) {
    // Almost always "relation public.money_entries does not exist", i.e. the
    // migration has not been run. Either way the account row is already written
    // and must not be rolled back over a ledger problem.
    return { ok: false, reason: (err && err.message) || 'Could not update the money ledger.' };
  }
}

module.exports = {
  syncAccountMoney: syncAccountMoney,
  cents: cents
};