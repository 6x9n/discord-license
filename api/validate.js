'use strict';

const { hashKey, parseIso, rest, json, handleOptions, readBody } = require('./_lib/supabase.js');

async function currentDeviceCount(licenseId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&device_hash=not.is.null&discord_user_id=is.null', {});
  return (rows && rows.length) || 0;
}

async function currentAccountCount(licenseId) {
  const rows = await rest('license_activations?select=discord_user_id&license_id=eq.' + encodeURIComponent(licenseId) + '&discord_user_id=not.is.null', {});
  return (rows && rows.length) || 0;
}

async function deviceRecorded(licenseId, deviceId) {
  const device = String(deviceId || '').trim();
  if (!device) {
    return false;
  }
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&device_hash=eq.' + encodeURIComponent(device) + '&discord_user_id=is.null&limit=1', {});
  return !!(rows && rows.length);
}

async function accountRecorded(licenseId, accountId) {
  const account = String(accountId || '').trim();
  if (!account) {
    return false;
  }
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&discord_user_id=eq.' + encodeURIComponent(account) + '&limit=1', {});
  return !!(rows && rows.length);
}

// Lightweight, side-effect-free status check used by the periodic license
// health poll. Never writes to the DB.
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }

  const body = await readBody(req);
  const key = String((body && body.key) || '').trim();
  const deviceId = String((body && body.deviceId) || '').trim();
  const accountId = String((body && body.accountId) || '').trim();

  if (!key) {
    return json(res, 400, { success: false, error: 'License key is required.' });
  }

  const keyHash = hashKey(key);
  let rows;
  try {
    rows = await rest('license_keys?select=*&key_hash=eq.' + encodeURIComponent(keyHash) + '&limit=1', {});
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'License lookup failed.' });
  }

  const row = (rows && rows[0]) || null;
  if (!row) {
    return json(res, 404, { success: false, code: 'INVALID', error: 'Invalid license key.' });
  }
  if (row.revoked) {
    return json(res, 403, { success: false, code: 'REVOKED', error: 'This license has been revoked.' });
  }

  const expiresAt = parseIso(row.expires_at);
  if (expiresAt && expiresAt <= Date.now()) {
    return json(res, 403, { success: false, code: 'EXPIRED', error: 'This license has expired.', data: { expiresAt: new Date(expiresAt).toISOString() } });
  }

  let devicesUsed = 0;
  let accountsUsed = 0;
  // Track whether the usage counts are trustworthy. Previously the failures
  // were swallowed and the counts stayed 0, which made the limit checks below
  // silently pass ("fail open") during a database outage.
  let usageCountsReliable = true;
  try {
    devicesUsed = await currentDeviceCount(row.id);
  } catch (e) {
    usageCountsReliable = false;
  }
  try {
    accountsUsed = await currentAccountCount(row.id);
  } catch (e) {
    usageCountsReliable = false;
  }

  const maxDevices = row.max_devices || 1;
  const maxActivations = row.max_activations || 1;

  // These two used to be unguarded, so any database error rejected out of the
  // handler and returned a non-JSON 500. The client treats a non-JSON body as
  // "license invalid" and force-logs the user out, so a transient Supabase
  // error was enough to kick every licensed user off the app.
  let thisDeviceRecorded = false;
  let thisAccountRecorded = false;
  let recordedLookupFailed = false;
  try {
    thisDeviceRecorded = await deviceRecorded(row.id, deviceId);
  } catch (e) {
    recordedLookupFailed = true;
  }
  try {
    thisAccountRecorded = await accountRecorded(row.id, accountId);
  } catch (e) {
    recordedLookupFailed = true;
  }

  if (!usageCountsReliable || recordedLookupFailed) {
    // Report the infrastructure failure honestly with a 5xx so the client can
    // distinguish "could not check" from "license is invalid".
    return json(res, 503, {
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Could not verify license usage right now. Please retry.'
    });
  }

  return json(res, 200, {
    success: true,
    data: {
      valid: true,
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
      endsAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      devicesUsed: devicesUsed,
      devicesTotal: maxDevices,
      activationsUsed: accountsUsed,
      activationsTotal: maxActivations,
      devicesFull: devicesUsed >= maxDevices && !thisDeviceRecorded,
      accountsFull: accountsUsed >= maxActivations && !thisAccountRecorded
    }
  });
};