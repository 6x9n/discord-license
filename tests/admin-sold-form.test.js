'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const adminSource = fs.readFileSync(
  path.resolve(__dirname, '../panel_x7k2n9p4h8r3/admin.js'),
  'utf8'
);

function sourceBetween(startMarker, endMarker) {
  const start = adminSource.indexOf(startMarker);
  const end = adminSource.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'source start marker must exist');
  assert.notEqual(end, -1, 'source end marker must exist');
  return adminSource.slice(start, end);
}

const moneyFunctions = sourceBetween('  function money2(n) {', '  function accBadgesHtml(row) {');
const kpiFunction = sourceBetween('  function renderAccKPIs() {', '  // ---------- tile drill-down ----------');
const rowFunction = sourceBetween('  function accRowHtml(row) {', '  function renderAccounts() {');
const soldFunctions = sourceBetween('  function syncSoldPaymentInputs() {', '  // Fallback for the unlikely case the sold modal markup is missing.');

function makeElement(value) {
  return {
    value: value === undefined ? '' : value,
    textContent: '',
    className: '',
    hidden: false,
    disabled: false,
    focused: false,
    focus: function () { this.focused = true; },
    classList: { toggle: function () {} }
  };
}

function makeHarness(options) {
  options = options || {};
  const calls = [];
  const elements = {
    soldPaidInFull: { checked: options.paidInFull !== false },
    soldAccId: makeElement('fake-account-id'),
    soldPrice: makeElement(options.price === undefined ? '150' : options.price),
    soldPaidFirst: makeElement(options.first === undefined ? '' : options.first),
    soldPaidSecond: makeElement(options.second === undefined ? '' : options.second),
    soldBuyerName: makeElement(''),
    soldBuyerTelegram: makeElement(''),
    soldBalanceHint: makeElement(),
    soldFormMsg: makeElement(),
    soldSubmitBtn: makeElement(),
    accStatCount: makeElement(),
    accStatSpent: makeElement(),
    accStatRevenue: makeElement(),
    accStatNet: makeElement(),
    accStatOwedCard: makeElement(),
    accStatOwed: makeElement(),
    accStatOwedLabel: makeElement()
  };
  const context = {
    MAX_ACCOUNT_MONEY: 9999999999.99,
    acc: { rows: [] },
    accMoney: function (amount) { return String(amount); },
    accBadgesHtml: function () { return ''; },
    accBuyerHtml: function () { return ''; },
    accPwCell: function () { return ''; },
    accSourceHtml: function () { return ''; },
    accStockAgeHtml: function () { return ''; },
    el: elements,
    esc: function (value) { return String(value || ''); },
    fmtDate: function () { return ''; },
    soldSaving: false,
    api: options.api || async function (url, request) {
      calls.push({ url: url, body: request.body });
      return {};
    },
    closeSoldModal: function () {},
    toast: function () {},
    loadAccounts: async function () {},
    setSoldFormMsg: function (message) {
      elements.soldFormMsg.textContent = message;
    }
  };
  vm.createContext(context);
  vm.runInContext(
    moneyFunctions + kpiFunction + rowFunction + soldFunctions
      + '\nthis.syncSoldPaymentInputs = syncSoldPaymentInputs;'
      + '\nthis.submitSoldForm = submitSoldForm;'
      + '\nthis.renderAccKPIs = renderAccKPIs;'
      + '\nthis.renderAccRow = accRowHtml;',
    context
  );
  return { context: context, calls: calls, elements: elements };
}

test('paid-in-full sets the full first payment and updates collected/owed totals', async function () {
  const harness = makeHarness();
  const context = harness.context;
  const elements = harness.elements;

  context.syncSoldPaymentInputs();
  assert.equal(elements.soldPaidFirst.value, '150');
  assert.equal(elements.soldPaidSecond.value, '0');
  assert.equal(elements.soldPaidFirst.disabled, true);
  assert.equal(elements.soldPaidSecond.disabled, true);
  assert.equal(elements.soldBalanceHint.textContent, 'Fully paid. Nothing outstanding.');

  context.acc.rows = [{
    status: 'SOLD',
    buy_price: 100,
    sell_price: 150,
    sell_paid_first: 150,
    sell_paid_second: 0
  }];
  context.renderAccKPIs();
  assert.equal(elements.accStatRevenue.textContent, '150');
  assert.equal(elements.accStatNet.textContent, '50');
  assert.equal(elements.accStatOwed.textContent, '0');
  assert.equal(elements.accStatOwedCard.hidden, true);
  assert.match(context.renderAccRow({
    id: 'fake-row',
    status: 'SOLD',
    buy_price: 100,
    sell_price: 150,
    sell_paid_first: 150,
    sell_paid_second: 0
  }), /paid in full/);
  assert.match(context.renderAccRow({
    id: 'fake-zero-row',
    status: 'SOLD',
    buy_price: 0,
    sell_price: 0,
    sell_paid_first: 0,
    sell_paid_second: 0
  }), /paid in full/);

  await context.submitSoldForm({ preventDefault: function () {} });
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].body.sellPrice, 150);
  assert.equal(harness.calls[0].body.sellPaidFirst, 150);
  assert.equal(harness.calls[0].body.sellPaidSecond, 0);
});

test('unchecked mode accepts split payments and rounds decimal values to cents', async function () {
  const harness = makeHarness({ price: '0.30000000000000004', first: '0.1', second: '0.2', paidInFull: false });
  await harness.context.submitSoldForm({ preventDefault: function () {} });
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].body.sellPrice, 0.3);
  assert.equal(harness.calls[0].body.sellPaidFirst, 0.1);
  assert.equal(harness.calls[0].body.sellPaidSecond, 0.2);
});

test('empty, zero, negative, oversized prices and duplicate submits are handled safely', async function () {
  const empty = makeHarness({ price: '' });
  await empty.context.submitSoldForm({ preventDefault: function () {} });
  assert.equal(empty.calls.length, 0);
  assert.equal(empty.elements.soldFormMsg.textContent, 'Sale price is required.');

  const zero = makeHarness({ price: '0' });
  await zero.context.submitSoldForm({ preventDefault: function () {} });
  assert.equal(zero.calls.length, 1);
  assert.equal(zero.calls[0].body.sellPrice, 0);
  assert.equal(zero.calls[0].body.sellPaidFirst, 0);
  assert.equal(zero.calls[0].body.sellPaidSecond, 0);

  for (const price of ['-0.01', '10000000000']) {
    const invalid = makeHarness({ price: price });
    await invalid.context.submitSoldForm({ preventDefault: function () {} });
    assert.equal(invalid.calls.length, 0);
  }

  let releaseRequest;
  let callCount = 0;
  const duplicate = makeHarness({
    api: async function () {
      callCount++;
      return new Promise(function (resolve) { releaseRequest = resolve; });
    }
  });
  const firstSubmit = duplicate.context.submitSoldForm({ preventDefault: function () {} });
  await duplicate.context.submitSoldForm({ preventDefault: function () {} });
  assert.equal(callCount, 1);
  releaseRequest({});
  await firstSubmit;
});
