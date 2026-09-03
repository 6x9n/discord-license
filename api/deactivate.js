'use strict';

const { hashKey, readBody, json, handleOptions, rest } = require('./_lib/supabase.js');

// Release the device lock for a license key so the same key can be activated
// again on another device. Account usage counts are intentionally preserved
// (the saved data stays; only this device slot is freed). Called on logout.
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

  // Remove only the device lock row (device_hash set, discord_user_id null) so
  // account usage counters and saved account data are left untouched.
  try {
    await rest('license_activations?license_id=eq.' + encodeURIComponent(licenseId) + '&device_hash=eq.' + encodeURIComponent(deviceId) + '&discord_user_id=is.null', {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to release device.' });
  }

  return json(res, 200, { success: true, data: { released: true } });
};