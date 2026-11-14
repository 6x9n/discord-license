'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const originalLoad = Module._load;
let record = {
  id: 'fake-account-row',
  buy_price: 100,
  sell_price: 0,
  sell_paid_first: 0,
  sell_paid_second: 0,
  status: 'AVAILABLE'
};
let patchCount = 0;
let syncCount = 0;

Module._load = function (request, parent, isMain) {
  if (request === './_lib/supabase.js') {
    return {
      rest: async function (endpoint, options) {
        options = options || {};
        if (endpoint.indexOf('discord_accounts?id=eq.') === 0 && !options.method) {
          return [{ id: record.id }];
        }
        if (options.method === 'PATCH') {
          patchCount++;
          record = Object.assign({}, record, options.body);
          return [Object.assign({}, record)];
        }
        throw new Error('Unexpected mocked database operation.');
      },
      readBody: async function (req) { return req.body || {}; },
      json: function (res, status, value) {
        res.statusCode = status;
        res.payload = value;
        return res;
      },
      handleOptions: function () {}
    };
  }
  if (request === './_lib/money-sync.js') {
    return {
      syncAccountMoney: async function () {
        syncCount++;
        return { ok: true };
      }
    };
  }
  if (request === './_lib/summary-auth.js') {
    return {
      secretMatches: function () { return true; },
      cookieConfigured: function () { return true; },
      isAuthed: function () { return true; },
      setAuthCookie: function () {},
      clearAuthCookie: function () {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const handler = require(path.resolve(__dirname, '../api/summary.js'));

async function update(body) {
  const res = {};
  await handler({
    method: 'PATCH',
    query: { id: record.id },
    headers: {},
    body: body
  }, res);
  return res;
}

test('mark-sold and later payment edits store valid rounded amounts', async function () {
  const paidInFull = await update({
    status: 'SOLD',
    sellPrice: 150,
    sellPaidFirst: 150,
    sellPaidSecond: 0
  });
  assert.equal(paidInFull.statusCode, 200);
  assert.equal(paidInFull.payload.data.sell_price, 150);
  assert.equal(paidInFull.payload.data.sell_paid_first, 150);
  assert.equal(paidInFull.payload.data.sell_paid_second, 0);

  const editedPayment = await update({ sellPaidFirst: '100.10', sellPaidSecond: '25.20' });
  assert.equal(editedPayment.statusCode, 200);
  assert.equal(editedPayment.payload.data.sell_price, 150);
  assert.equal(editedPayment.payload.data.sell_paid_first, 100.1);
  assert.equal(editedPayment.payload.data.sell_paid_second, 25.2);

  const zeroSale = await update({
    status: 'SOLD',
    sellPrice: '0',
    sellPaidFirst: '0',
    sellPaidSecond: '0'
  });
  assert.equal(zeroSale.statusCode, 200);
  assert.equal(zeroSale.payload.data.sell_price, 0);
  assert.equal(zeroSale.payload.data.sell_paid_first, 0);
  assert.equal(zeroSale.payload.data.sell_paid_second, 0);

  const decimalSale = await update({
    status: 'SOLD',
    sellPrice: '0.30000000000000004',
    sellPaidFirst: '0.1',
    sellPaidSecond: '0.2'
  });
  assert.equal(decimalSale.statusCode, 200);
  assert.equal(decimalSale.payload.data.sell_price, 0.3);
  assert.equal(decimalSale.payload.data.sell_paid_first, 0.1);
  assert.equal(decimalSale.payload.data.sell_paid_second, 0.2);
  assert.equal(patchCount, 4);
  assert.equal(syncCount, 4);
});

test('rejects empty sold price, negative amounts, and values above numeric(12,2)', async function () {
  const before = patchCount;
  const emptyPrice = await update({ status: 'SOLD', sellPrice: '' });
  assert.equal(emptyPrice.statusCode, 400);
  assert.equal(emptyPrice.payload.error, 'Sale price is required when marking an account sold.');

  const negativePrice = await update({ status: 'SOLD', sellPrice: '-0.01' });
  assert.equal(negativePrice.statusCode, 400);

  const oversizedPrice = await update({ status: 'SOLD', sellPrice: '10000000000' });
  assert.equal(oversizedPrice.statusCode, 400);

  const negativePart = await update({ sellPaidFirst: '-1' });
  assert.equal(negativePart.statusCode, 400);

  const oversizedPart = await update({ sellPaidSecond: '10000000000' });
  assert.equal(oversizedPart.statusCode, 400);
  assert.equal(patchCount, before);
});

test.after(function () {
  Module._load = originalLoad;
});
