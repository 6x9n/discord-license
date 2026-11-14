'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalOwnerKey = process.env.LICENSE_OWNER_KEY;
const originalAdminSecret = process.env.LICENSE_ADMIN_SECRET;
const originalTokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

let existing = null;
let lastPatch = null;

process.env.LICENSE_OWNER_KEY = 'fake-owner-key';
process.env.LICENSE_ADMIN_SECRET = 'fake-admin-secret-for-tests';
process.env.TOKEN_ENCRYPTION_KEY = 'fake-token-encryption-key-for-tests';

Module._load = function (request, parent, isMain) {
  if (request === './_lib/supabase.js') {
    return {
      rest: async function (endpoint, options) {
        options = options || {};
        if (endpoint.indexOf('discord_accounts?discord_id=eq.') === 0) {
          return existing ? [Object.assign({}, existing)] : [];
        }
        if (options.method === 'PATCH') {
          lastPatch = Object.assign({}, options.body);
          existing = Object.assign({}, existing, options.body);
          return [Object.assign({}, existing)];
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
    return { syncAccountMoney: async function () { return { ok: true }; } };
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

const tokenCrypto = require('../api/_lib/token-crypto.js');
const handler = require(path.resolve(__dirname, '../api/summary.js'));

global.fetch = async function (url) {
  let value;
  if (url.endsWith('/users/@me')) {
    value = {
      id: '123456789012345678',
      username: 'fake_user',
      global_name: 'Fake User',
      email: 'fake@example.test',
      flags: 0,
      public_flags: 0,
      premium_type: 0
    };
  } else if (url.endsWith('/users/123456789012345678/profile')) {
    value = { badges: [] };
  } else if (url.endsWith('/users/@me/billing/subscriptions')) {
    value = [];
  } else {
    throw new Error('Unexpected mocked Discord request.');
  }
  return {
    ok: true,
    status: 200,
    text: async function () { return JSON.stringify(value); }
  };
};

test('preserves registration state only when the refreshed token is identical', async function () {
  const registeredAt = '2025-03-04T05:06:07.000Z';
  const initialToken = 'fake-token-for-identical-case';
  const encrypted = tokenCrypto.encryptToken(initialToken);
  existing = Object.assign({
    id: 'fake-account-row',
    discord_id: '123456789012345678',
    is_registered_in_tool: true,
    tool_registered_at: registeredAt,
    discord_token_enc: encrypted.ciphertext,
    discord_token_iv: encrypted.iv,
    discord_token_tag: encrypted.tag
  });

  async function refresh(token) {
    const res = {};
    await handler({
      method: 'POST',
      query: { op: 'token-add' },
      headers: { 'x-owner-key': 'fake-owner-key' },
      body: { token: token }
    }, res);
    return res;
  }

  const identicalResult = await refresh(initialToken);
  assert.equal(identicalResult.statusCode, 200);
  assert.equal(identicalResult.payload.success, true);
  assert.equal(lastPatch.is_registered_in_tool, true);
  assert.equal(lastPatch.tool_registered_at, registeredAt);

  const changedResult = await refresh('fake-token-for-changed-case');
  assert.equal(changedResult.statusCode, 200);
  assert.equal(changedResult.payload.success, true);
  assert.equal(lastPatch.is_registered_in_tool, false);
  assert.equal(lastPatch.tool_registered_at, null);

  const patchBeforeInvalidSavedToken = lastPatch;
  existing.discord_token_tag = 'invalid-authentication-tag';
  const invalidSavedResult = await refresh('fake-token-for-changed-case');
  assert.equal(invalidSavedResult.statusCode, 422);
  assert.equal(invalidSavedResult.payload.success, false);
  assert.equal(invalidSavedResult.payload.error, 'Could not verify the saved token before refreshing this account.');
  assert.equal(lastPatch, patchBeforeInvalidSavedToken);
});

test.after(function () {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  if (originalOwnerKey === undefined) delete process.env.LICENSE_OWNER_KEY;
  else process.env.LICENSE_OWNER_KEY = originalOwnerKey;
  if (originalAdminSecret === undefined) delete process.env.LICENSE_ADMIN_SECRET;
  else process.env.LICENSE_ADMIN_SECRET = originalAdminSecret;
  if (originalTokenEncryptionKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = originalTokenEncryptionKey;
});
