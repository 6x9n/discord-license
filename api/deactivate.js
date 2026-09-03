'use strict';

const { hashKey, readBody, json, handleOptions, rest } = require('./_lib/supabase.js');

// Release a device (and optionally its account) for a license key so the same
// key can be activated again on another device. Called when a user logs out.
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
  if (!deviceId) {
    return json(res, 400, { success: false, error: 'deviceId is required.' });
  }

  const keyHash = hashKey(key);
  let rows;
  try {
    rows = await rest('license_keys?select=id&key_hash=eq.' + encodeURIComponent(keyHash) + '&limit=1', {});
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'License lookup failed.' });
  }

  const row = (rows && rows[0]) || null;
  if (!row) {
    return json(res, 404, { success: false, error: 'Invalid license key.' });
  }
  const licenseId = row.id;

  try {
    await rest('license_activations?license_id=eq.' + encodeURIComponent(licenseId) + '&device_hash=eq.' + encodeURIComponent(deviceId), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to release device.' });
  }

  // Also release the account slot so the same account can log in on the new device.
  if (accountId) {
    try {
      await rest('license_activations?license_id=eq.' + encodeURIComponent(licenseId) + '&discord_user_id=eq.' + encodeURIComponent(accountId), {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
    } catch (e) {
      // non-fatal; account slot may not exist
    }
  }

  return json(res, 200, { success: true, data: { released: true } });
};