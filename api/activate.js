'use strict';

const { hashKey, parseIso, rest, json, handleOptions, readBody } = require('./_lib/supabase.js');

async function activationExists(licenseId, accountId) {
  const rows = await rest('license_activations?select=id&license_id=eq.' + encodeURIComponent(licenseId) + '&discord_user_id=eq.' + encodeURIComponent(accountId) + '&limit=1', {});
  return !!(rows && rows.length);
}

async function currentActivationCount(licenseId) {
  const rows = await rest('license_activations?select=discord_user_id&license_id=eq.' + encodeURIComponent(licenseId) + '&not.is.null.discord_user_id', {});
  return (rows && rows.length) || 0;
}

async function recordActivation(licenseId, accountId, maxActivations) {
  const account = String(accountId || '').trim();
  if (!account) {
    return { ok: true, count: await currentActivationCount(licenseId) };
  }
  const exists = await activationExists(licenseId, account);
  if (exists) {
    return { ok: true, count: await currentActivationCount(licenseId) };
  }
  const count = await currentActivationCount(licenseId);
  if (count >= (maxActivations || 1)) {
    return { ok: false, full: true, count: count };
  }
  try {
    await rest('license_activations', {
      method: 'POST',
      body: { license_id: licenseId, device_hash: account, discord_user_id: account }
    });
    return { ok: true, count: await currentActivationCount(licenseId) };
  } catch (e) {
    const recheck = await activationExists(licenseId, account);
    return { ok: recheck, count: await currentActivationCount(licenseId) };
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
  const accountId = String(body.accountId || body.deviceId || '').trim();

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

  let activation;
  try {
    activation = await recordActivation(row.id, accountId, row.max_activations || 1);
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Activation check failed.' });
  }

  if (!activation.ok && activation.full) {
    return json(res, 403, { success: false, error: 'This license has reached its account limit.' });
  }
  if (!activation.ok) {
    return json(res, 403, { success: false, error: 'Unable to activate.' });
  }

  try {
    await rest('license_keys?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      body: { last_validated_at: new Date().toISOString() }
    });
  } catch (e) {
    // non-fatal; continue
  }

  let used = 0;
  try {
    used = await currentActivationCount(row.id);
  } catch (e) {
    used = activation.count || 0;
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
      activationsUsed: used
    }
  });
}