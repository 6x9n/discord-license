'use strict';

const { rest, json, handleOptions, readBody, isAuthorized } = require('../../_lib/supabase.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return json(res, auth.error === 'Unauthorized' ? 401 : 503, { success: false, error: auth.error });
  }

  const id = decodeURIComponent((req.params && (req.params.id || req.query.id)) || (req.query && req.query.id) || '');
  if (!id) {
    return json(res, 400, { success: false, error: 'Missing plan id.' });
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const patch = {};
    if (body.name !== undefined && String(body.name).trim()) patch.name = String(body.name).trim();
    if (body.max_accounts !== undefined) {
      const v = parseInt(body.max_accounts, 10);
      patch.max_accounts = isNaN(v) || v < 1 ? 1 : v;
    }
    if (body.max_devices !== undefined) {
      const v = parseInt(body.max_devices, 10);
      patch.max_devices = isNaN(v) || v < 1 ? 1 : v;
    }
    if (body.duration_days !== undefined) {
      const v = parseInt(body.duration_days, 10);
      patch.duration_days = isNaN(v) ? 0 : Math.max(0, v);
    }
    if (body.notes !== undefined) patch.notes = String(body.notes || '').trim();
    try {
      const updated = await rest('plans?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch, headers: { 'Prefer': 'return=representation' } });
      const row = updated && updated[0] ? updated[0] : null;
      return json(res, 200, { success: true, data: row });
    } catch (err) {
      if (err && err.status === 409) {
        return json(res, 409, { success: false, error: 'A plan with that name already exists.' });
      }
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to update plan.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await rest('plans?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to delete plan.' });
    }
  }

  return json(res, 405, { success: false, error: 'Method not allowed' });
}