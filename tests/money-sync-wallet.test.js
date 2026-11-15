'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const syncModulePath = path.resolve(__dirname, '../api/_lib/money-sync.js');

function makeHarness(options) {
  options = options || {};
  const bucket = options.bucket === undefined
    ? { id: 'fake-usdt-bucket', name: 'USDT', currency: 'USDT', archived: false }
    : options.bucket;
  const entries = (options.entries || []).map(function (entry) {
    return Object.assign({}, entry);
  });
  const calls = { bucketQueries: [], posts: [], patches: [], deletes: [] };
  let nextId = 1;

  async function rest(endpoint, request) {
    request = request || {};
    if (endpoint.indexOf('money_buckets?') === 0) {
      calls.bucketQueries.push(endpoint);
      if (bucket
        && bucket.name === 'USDT'
        && bucket.currency === 'USDT'
        && bucket.archived === false
        && endpoint.indexOf('name=eq.USDT') !== -1
        && endpoint.indexOf('currency=eq.USDT') !== -1
        && endpoint.indexOf('archived=eq.false') !== -1) {
        return [Object.assign({}, bucket)];
      }
      return [];
    }

    if (endpoint.indexOf('money_entries?source_key=eq.') === 0) {
      const encodedKey = endpoint.split('source_key=eq.')[1].split('&')[0];
      const sourceKey = decodeURIComponent(encodedKey);
      const entry = entries.find(function (item) { return item.source_key === sourceKey; });
      return entry ? [Object.assign({}, entry)] : [];
    }

    if (endpoint === 'money_entries' && request.method === 'POST') {
      if (entries.some(function (item) { return item.source_key === request.body.source_key; })) {
        const duplicateError = new Error('Fake unique source_key violation.');
        duplicateError.code = '23505';
        throw duplicateError;
      }
      const entry = Object.assign({ id: 'fake-entry-' + nextId++ }, request.body);
      entries.push(entry);
      calls.posts.push(Object.assign({}, entry));
      return [Object.assign({}, entry)];
    }

    if (endpoint.indexOf('money_entries?id=eq.') === 0) {
      const id = decodeURIComponent(endpoint.split('id=eq.')[1].split('&')[0]);
      const index = entries.findIndex(function (item) { return item.id === id; });
      if (request.method === 'PATCH') {
        assert.notEqual(index, -1, 'patched entry must exist');
        Object.assign(entries[index], request.body);
        calls.patches.push({ id: id, body: Object.assign({}, request.body) });
        return [Object.assign({}, entries[index])];
      }
      if (request.method === 'DELETE') {
        assert.notEqual(index, -1, 'deleted entry must exist');
        calls.deletes.push(id);
        entries.splice(index, 1);
        return [];
      }
    }

    throw new Error('Unexpected mocked money-sync database operation.');
  }

  const originalLoad = Module._load;
  delete require.cache[syncModulePath];
  Module._load = function (request, parent, isMain) {
    if (request === './supabase.js' && parent && parent.filename === syncModulePath) {
      return { rest: rest };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let syncAccountMoney;
  try {
    syncAccountMoney = require(syncModulePath).syncAccountMoney;
  } finally {
    Module._load = originalLoad;
    delete require.cache[syncModulePath];
  }

  return { syncAccountMoney: syncAccountMoney, entries: entries, calls: calls };
}

function soldAccount() {
  return {
    id: 'fake-account-row',
    discord_id: 'fake-discord-id',
    username: 'fake-user',
    buy_price: 100,
    sell_paid_first: 50,
    sell_paid_second: 100,
    created_at: '2026-01-01',
    sold_at: '2026-01-02'
  };
}

test('new buys and received sale payments post once each to the exact USDT bucket', async function () {
  const harness = makeHarness();
  const result = await harness.syncAccountMoney(soldAccount());

  assert.equal(result.ok, true);
  assert.equal(harness.calls.posts.length, 3);
  assert.deepEqual(
    harness.entries.map(function (entry) { return entry.source_key; }).sort(),
    ['buy:fake-discord-id', 'sale1:fake-discord-id', 'sale2:fake-discord-id']
  );
  assert.ok(harness.entries.every(function (entry) {
    return entry.bucket_id === 'fake-usdt-bucket';
  }));
  assert.ok(!harness.entries.some(function (entry) {
    return entry.source_key.indexOf('usdt:sale') === 0;
  }));
  assert.match(harness.calls.bucketQueries[0], /name=eq\.USDT/);
  assert.match(harness.calls.bucketQueries[0], /currency=eq\.USDT/);
  assert.match(harness.calls.bucketQueries[0], /archived=eq\.false/);
});

test('re-saving does not duplicate entries', async function () {
  const harness = makeHarness();
  const account = soldAccount();

  await harness.syncAccountMoney(account);
  await harness.syncAccountMoney(account);

  assert.equal(harness.calls.posts.length, 3);
  assert.equal(harness.calls.patches.length, 0);
  assert.equal(harness.entries.length, 3);
});

test('double-saved account reconciles concurrent inserts without duplicates', async function () {
  const harness = makeHarness();
  const account = soldAccount();

  const results = await Promise.all([
    harness.syncAccountMoney(account),
    harness.syncAccountMoney(account)
  ]);

  assert.ok(results.every(function (result) { return result.ok; }));
  assert.equal(harness.entries.length, 3);
  assert.equal(harness.calls.posts.length, 3);
  assert.equal(harness.calls.patches.length, 0);
});

test('changing prices updates existing source-keyed entries instead of duplicating them', async function () {
  const harness = makeHarness();
  const account = soldAccount();

  await harness.syncAccountMoney(account);
  account.buy_price = 125;
  account.sell_paid_first = 75;
  await harness.syncAccountMoney(account);

  assert.equal(harness.calls.posts.length, 3);
  assert.equal(harness.calls.patches.length, 2);
  assert.equal(harness.entries.length, 3);
  assert.equal(harness.entries.find(function (entry) {
    return entry.source_key === 'buy:fake-discord-id';
  }).amount, 125);
  assert.equal(harness.entries.find(function (entry) {
    return entry.source_key === 'sale1:fake-discord-id';
  }).amount, 75);
});

test('an existing derived entry with the same amount is moved into USDT on re-save', async function () {
  const harness = makeHarness({
    entries: [{
      id: 'fake-old-buy',
      source_key: 'buy:fake-discord-id',
      bucket_id: 'fake-trading-bucket',
      amount: 100,
      direction: 'OUT',
      scope: 'BUSINESS',
      category: 'ACCOUNT_BUY',
      source: 'ACCOUNT_BUY'
    }]
  });
  const account = soldAccount();
  account.sell_paid_first = 0;
  account.sell_paid_second = 0;

  const result = await harness.syncAccountMoney(account);

  assert.equal(result.ok, true);
  assert.equal(harness.calls.posts.length, 0);
  assert.equal(harness.calls.patches.length, 1);
  assert.equal(harness.calls.patches[0].body.bucket_id, 'fake-usdt-bucket');
  assert.equal(harness.entries[0].bucket_id, 'fake-usdt-bucket');
});

test('a missing, archived, or wrong-currency USDT bucket returns a clear error without fallback writes', async function () {
  const unavailableBuckets = [
    null,
    { id: 'fake-archived-usdt', name: 'USDT', currency: 'USDT', archived: true },
    { id: 'fake-egp-usdt', name: 'USDT', currency: 'EGP', archived: false }
  ];
  for (const bucket of unavailableBuckets) {
    const harness = makeHarness({ bucket: bucket });
    const result = await harness.syncAccountMoney(soldAccount());

    assert.equal(result.ok, false);
    assert.match(result.reason, /live "USDT" bucket with currency USDT was not found/i);
    assert.equal(harness.calls.bucketQueries.length, 1);
    assert.equal(harness.calls.posts.length, 0);
    assert.equal(harness.entries.length, 0);
  }
});

test('a stale mirror key is reported and left unchanged without creating entries', async function () {
  const mirror = {
    id: 'fake-stale-mirror',
    source_key: 'usdt:sale1:fake-discord-id',
    bucket_id: 'fake-usdt-bucket',
    amount: 50,
    direction: 'IN',
    scope: 'BUSINESS',
    category: 'ACCOUNT_SALE',
    source: 'ACCOUNT_SALE'
  };
  const harness = makeHarness({ entries: [mirror] });
  const result = await harness.syncAccountMoney(soldAccount());

  assert.equal(result.ok, false);
  assert.match(result.reason, /stale duplicate account-sale ledger entry/i);
  assert.equal(harness.calls.posts.length, 0);
  assert.equal(harness.calls.patches.length, 0);
  assert.equal(harness.calls.deletes.length, 0);
  assert.equal(harness.entries.length, 1);
});
