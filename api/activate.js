'use strict';

const { hashKey, parseIso, rest, json, handleOptions, readBody } = require('./_lib/supabase.js');

async function deviceExists(licenseId, deviceId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&device_hash=eq.' + encodeURIComponent(deviceId) + '&discord_user_id=is.null&limit=1', {});
  return !!(rows && rows.length);
}

async function currentDeviceCount(licenseId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&not.is.null.device_hash&discord_user_id=is.null', {});
  return (rows && rows.length) || 0;
}

async function accountExists(licenseId, accountId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&discord_user_id=eq.' + encodeURIComponent(accountId) + '&limit=1', {});
  return !!(rows && rows.length);
}

async function currentAccountCount(licenseId) {
  const rows = await rest('license_activations?select=discord_user_id&license_id=eq.' + encodeURIComponent(licenseId) + '&not.is.null.discord_user_id', {});
  return (rows && rows.length) || 0;
}

// Register the device (device lock). Returns { ok } or { ok:false, deviceLimit:true }.
async function recordDevice(licenseId, deviceId, maxDevices) {
  const device = String(deviceId || '').trim();
  if (!device) {
    return { ok: true, deviceLocked: false };
  }
  const exists = await deviceExists(licenseId, device);
  if (exists) {
    return { ok: true, deviceLocked: false };
  }
  const count = await currentDeviceCount(licenseId);
  if (count >= (maxDevices || 1)) {
    return { ok: false, deviceLimit: true, count: count };
  }
  try {
    await rest('license_activations', {
      method: 'POST',
      body: { license_id: licenseId, device_hash: device, discord_user_id: null }
    });
    return { ok: true, deviceLocked: false };
  } catch (e) {
    const recheck = await deviceExists(licenseId, device);
    return { ok: recheck, deviceLocked: !recheck };
  }
}

// Register the account (account usage counter). Returns { ok } or { ok:false, accountFull:true }.
async function recordAccount(licenseId, accountId, deviceId, maxActivations) {
  const account = String(accountId || '').trim();
  if (!account) {
    return { ok: true };
  }
  const exists = await accountExists(licenseId, account);
  if (exists) {
    return { ok: true };
  }
  const count = await currentAccountCount(licenseId);
  if (count >= (maxActivations || 1)) {
    return { ok: false, accountFull: true, count: count };
  }
  try {
    await rest('license_activations', {
      method: 'POST',
      body: { license_id: licenseId, device_hash: String(deviceId || account), discord_user_id: account }
    });
    return { ok: true };
  } catch (e) {
    const recheck = await accountExists(licenseId, account);
    return { ok: recheck };
  }
}

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
    return json(res, 404, { success: false, error: 'Invalid license key.' });
  }
  if (row.revoked) {
    return json(res, 403, { success: false, error: 'This license has been revoked.' });
  }

  const expiresAt = parseIso(row.expires_at);
  if (expiresAt && expiresAt <= Date.now()) {
    return json(res, 403, { success: false, error: 'This license has expired.' });
  }

  // Device lock first.
  let device;
  try {
    device = await recordDevice(row.id, deviceId, row.max_devices || 1);
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Device check failed.' });
  }

  if (!device.ok && device.deviceLimit) {
    return json(res, 403, {
      success: false,
      error: 'This license is already active on another device. Contact Mythic on Telegram to reset the key or add a new device.',
      code: 'DEVICE_LIMIT'
    });
  }
  if (!device.ok && device.deviceLocked) {
    return json(res, 403, { success: false, error: 'Unable to register this device.' });
  }

  // Account usage counter (optional reporting of a logged-in Discord account).
  let account;
  try {
    account = await recordAccount(row.id, accountId, deviceId, row.max_activations || 1);
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Account check failed.' });
  }

  if (!account.ok && account.accountFull) {
    return json(res, 403, { success: false, error: 'This license has reached its account limit.' });
  }
  if (!account.ok) {
    return json(res, 403, { success: false, error: 'Unable to register this account.' });
  }

  try {
    await rest('license_keys?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      body: { last_validated_at: new Date().toISOString() }
    });
  } catch (e) {
    // non-fatal; continue
  }

  let accountsUsed = 0;
  try {
    accountsUsed = await currentAccountCount(row.id);
  } catch (e) {
    accountsUsed = account && account.count ? account.count : (row.activationCount || 0);
  }
  let devicesUsed = 0;
  try {
    devicesUsed = await currentDeviceCount(row.id);
  } catch (e) {
    devicesUsed = device && device.count ? device.count : 0;
  }

  return json(res, 200, {
    success: true,
    data: {
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
      endsAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      label: row.label || 'Standard',
      plan: row.label || 'Standard',
      owner: row.owner || null,
      notes: row.notes || '',
      maxActivations: row.max_activations || 1,
      maxDevices: row.max_devices || 1,
      activationsUsed: accountsUsed,
      activationsTotal: row.max_activations || 1,
      devicesUsed: devicesUsed
    }
  });
}