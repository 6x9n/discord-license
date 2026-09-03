'use strict';

const { rest, json, handleOptions, readBody, isAuthorized } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return json(res, auth.error === 'Unauthorized' ? 401 : 503, { success: false, error: auth.error });
  }

  if (req.method === 'GET') {
    let rows;
    try {
      rows = await rest('plans?select=*&order=created_at.asc', {}) || [];
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to list plans.' });
    }
    return json(res, 200, { success: true, data: rows });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      return json(res, 400, { success: false, error: 'Plan name is required.' });
    }
    const maxAccounts = parseInt(body.max_accounts, 10);
    const maxDevices = parseInt(body.max_devices, 10);
    const durationDays = parseInt(body.duration_days, 10);
    const payload = {
      name: name,
      max_accounts: isNaN(maxAccounts) || maxAccounts < 1 ? 1 : maxAccounts,
      max_devices: isNaN(maxDevices) || maxDevices < 1 ? 1 : maxDevices,
      duration_days: isNaN(durationDays) ? 0 : Math.max(0, durationDays),
      notes: String(body.notes || '').trim()
    };
    try {
      const inserted = await rest('plans', { method: 'POST', body: payload });
      const row = inserted && inserted[0] ? inserted[0] : payload;
      return json(res, 200, { success: true, data: row });
    } catch (err) {
      if (err && err.status === 409) {
        return json(res, 409, { success: false, error: 'A plan with that name already exists.' });
      }
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to create plan.' });
    }
  }

  return json(res, 405, { success: false, error: 'Method not allowed' });
}