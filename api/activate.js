'use strict';

const { hashKey, parseIso, rest, json, handleOptions } = require('./_lib/supabase.js');

async function readBody(request) {
  const text = await request.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

async function activationExists(licenseId, deviceId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&device_hash=eq.' + encodeURIComponent(deviceId) + '&limit=1', {});
  return !!(rows && rows.length);
}

async function currentActivationCount(licenseId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId), {});
  return (rows && rows.length) || 0;
}

async function recordActivation(licenseId, deviceId, maxActivations) {
  const exists = await activationExists(licenseId, deviceId);
  if (exists) {
    return { ok: true };
  }
  const count = await currentActivationCount(licenseId);
  if (count >= (maxActivations || 1)) {
    return { ok: false, full: true };
  }
  try {
    await rest('license_activations', {
      method: 'POST',
      body: { license_id: licenseId, device_hash: deviceId }
    });
    return { ok: true };
  } catch (e) {
    const recheck = await activationExists(licenseId, deviceId);
    return { ok: recheck };
  }
}

module.exports = async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  if (request.method !== 'POST') {
    return json(request, 405, { success: false, error: 'Method not allowed' });
  }

  const body = await readBody(request);
  const key = String(body.key || '').trim();
  const deviceId = String(body.deviceId || '').trim();

  if (!key) {
    return json(request, 400, { success: false, error: 'License key is required.' });
  }
  if (!deviceId) {
    return json(request, 400, { success: false, error: 'Device identifier is required.' });
  }

  const keyHash = hashKey(key);

  let rows;
  try {
    rows = await rest('license_keys?select=*&key_hash=eq.' + encodeURIComponent(keyHash) + '&limit=1', {});
  } catch (err) {
    return json(request, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'License lookup failed.' });
  }

  const row = (rows && rows[0]) || null;
  if (!row) {
    return json(request, 404, { success: false, error: 'Invalid license key.' });
  }
  if (row.revoked) {
    return json(request, 403, { success: false, error: 'This license has been revoked.' });
  }

  const expiresAt = parseIso(row.expires_at);
  if (expiresAt && expiresAt <= Date.now()) {
    return json(request, 403, { success: false, error: 'This license has expired.' });
  }

  let activation;
  try {
    activation = await recordActivation(row.id, deviceId, maxActivations);
  } catch (err) {
    return json(request, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Activation check failed.' });
  }

  if (!activation.ok && activation.full) {
    return json(request, 403, { success: false, error: 'This license is already in use.' });
  }
  if (!activation.ok) {
    return json(request, 403, { success: false, error: 'Unable to activate on this device.' });
  }

  try {
    await rest('license_keys?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      body: { last_validated_at: new Date().toISOString() }
    });
  } catch (e) {
    // non-fatal; continue
  }

  return json(request, 200, {
    success: true,
    data: {
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
      label: row.label || 'Standard',
      plan: row.label || 'Standard',
      maxActivations: row.max_activations || 1
    }
  });
}