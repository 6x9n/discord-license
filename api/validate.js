'use strict';

const { hashKey, parseIso, rest, json, handleOptions, readBody } = require('./_lib/supabase.js');

async function currentDeviceCount(licenseId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&not.is.null.device_hash&discord_user_id=is.null', {});
  return (rows && rows.length) || 0;
}

async function currentAccountCount(licenseId) {
  const rows = await rest('license_activations?select=discord_user_id&license_id=eq.' + encodeURIComponent(licenseId) + '&not.is.null.discord_user_id', {});
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
  const key = String(body.key || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const accountId = String(body.accountId || '').trim();

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
  try {
    devicesUsed = await currentDeviceCount(row.id);
  } catch (e) { }
  try {
    accountsUsed = await currentAccountCount(row.id);
  } catch (e) { }

  const maxDevices = row.max_devices || 1;
  const maxActivations = row.max_activations || 1;
  const thisDeviceRecorded = await deviceRecorded(row.id, deviceId);
  const thisAccountRecorded = await accountRecorded(row.id, accountId);

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