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
const rowFunction = sourceBetween('  function accRowHtml(row) {', '  function renderAccounts() {');
const buyerTextFunction = sourceBetween('  function accBuyerMessageText(row) {', '  // ---------- split payment maths ----------');
const clipboardFunctions = sourceBetween(
  '  function copyToClipboard(text, okMsg) {',
  '  function copyKey(k) {'
) + sourceBetween('  function fallbackCopy(text) {', '  function extendKey(k) {');

function makeBuyerTextHarness() {
  const formattedInputs = [];
  const context = {
    fmtDate: function (value) {
      formattedInputs.push(value);
      return value === '2027-07-26T12:00:00' ? 'Jul 26, 2027' : '�';
    }
  };
  vm.createContext(context);
  vm.runInContext(buyerTextFunction + '\nthis.buyerText = accBuyerMessageText;', context);
  return { context: context, formattedInputs: formattedInputs };
}

function makeRowHarness() {
  const context = {
    accMoney: function (value) { return String(value); },
    accBadgesHtml: function () { return ''; },
    accBuyerHtml: function () { return ''; },
    accPwCell: function () { return ''; },
    accSourceHtml: function () { return ''; },
    accStockAgeHtml: function () { return ''; },
    esc: function (value) { return String(value == null ? '' : value); },
    fmtDate: function () { return ''; }
  };
  vm.createContext(context);
  vm.runInContext(
    moneyFunctions + rowFunction + '\nthis.renderAccRow = accRowHtml;',
    context
  );
  return context;
}

function makeClipboardHarness(options) {
  options = options || {};
  const toasts = [];
  const written = [];
  const textareas = [];
  const body = {
    appendChild: function (element) {
      element.parentNode = body;
      textareas.push(element);
    },
    removeChild: function (element) {
      element.parentNode = null;
    }
  };
  const context = {
    toast: function (message, kind) { toasts.push([message, kind]); },
    navigator: options.clipboard === undefined ? {} : { clipboard: options.clipboard },
    document: {
      createElement: function () {
        return { style: {}, value: '', select: function () {} };
      },
      body: body,
      execCommand: function (command) {
        assert.equal(command, 'copy');
        return options.execResult;
      }
    }
  };
  if (options.clipboard && options.captureClipboard) {
    options.clipboard.writeText = function (text) {
      written.push(text);
      return Promise.resolve();
    };
  }
  vm.createContext(context);
  vm.runInContext(clipboardFunctions
    + '\nthis.copyToClipboard = copyToClipboard;', context);
  return { context: context, toasts: toasts, written: written, textareas: textareas };
}

test('buyer message uses the requested fields and formats the Nitro end', function () {
  const harness = makeBuyerTextHarness();
  const output = harness.context.buyerText({
    discord_id: '123456789012345678',
    email: 'buyer@example.test',
    email_password: 'fake-email-password',
    discord_password: 'fake-discord-password',
    status_label: 'Pullback Test',
    nitro_ends: '2027-07-26'
  });

  assert.equal(output, [
    'Account ID: 123456789012345678',
    'Email: buyer@example.test',
    'Email password: fake-email-password',
    'Discord password: fake-discord-password',
    'Status: Pullback Test',
    'Nitro ends: Jul 26, 2027'
  ].join('\n'));
  assert.deepEqual(harness.formattedInputs, ['2027-07-26T12:00:00']);
});

test('empty fields are omitted and missing or invalid Nitro dates use a dash', function () {
  const harness = makeBuyerTextHarness();
  assert.equal(harness.context.buyerText({
    discord_id: '',
    email: null,
    email_password: '',
    discord_password: '',
    status_label: '  ',
    nitro_ends: ''
  }), 'Nitro ends: -');

  assert.equal(harness.context.buyerText({ nitro_ends: '2027-02-31' }), 'Nitro ends: -');
});

test('SOLD and AVAILABLE rows keep Details and include the separate copy action', function () {
  const renderAccRow = makeRowHarness().renderAccRow;
  for (const status of ['AVAILABLE', 'SOLD']) {
    const html = renderAccRow({
      id: 'fake-row',
      status: status,
      buy_price: 10,
      sell_price: status === 'SOLD' ? 20 : null
    });
    assert.match(html, /data-acc-act="export"[^>]*>Details<\/button>/);
    assert.match(html, /data-acc-act="copy-buyer-message"[^>]*>Copy buyer message<\/button>/);
  }
});

test('clipboard API and fallback show success only after copying succeeds', async function () {
  const apiSuccess = makeClipboardHarness({
    clipboard: {},
    captureClipboard: true,
    execResult: false
  });
  await apiSuccess.context.copyToClipboard('fake buyer message', 'Buyer message copied.');
  assert.deepEqual(apiSuccess.written, ['fake buyer message']);
  assert.deepEqual(apiSuccess.toasts, [['Buyer message copied.', 'success']]);
  assert.equal(apiSuccess.textareas.length, 0);

  const succeeded = makeClipboardHarness({
    clipboard: { writeText: function () { return Promise.reject(new Error('fake failure')); } },
    execResult: true
  });
  await succeeded.context.copyToClipboard('fake buyer message', 'Buyer message copied.');
  assert.deepEqual(succeeded.toasts, [['Buyer message copied.', 'success']]);
  assert.equal(succeeded.textareas.length, 1);
  assert.equal(succeeded.textareas[0].parentNode, null);

  const failed = makeClipboardHarness({ execResult: false });
  await failed.context.copyToClipboard('fake buyer message', 'Buyer message copied.');
  assert.deepEqual(failed.toasts, [['Could not copy to clipboard.', 'error']]);
});
