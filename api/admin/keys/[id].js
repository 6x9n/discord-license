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

  const id = decodeURIComponent((req.params && req.params.id) || '');
  if (!id) {
    return json(res, 400, { success: false, error: 'Missing key id.' });
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const patch = {};
    if (body.label !== undefined) patch.label = String(body.label);
    if (body.expires_at !== undefined) patch.expires_at = body.expires_at ? String(body.expires_at) : null;
    if (body.max_activations !== undefined) {
      const m = parseInt(body.max_activations, 10);
      patch.max_activations = isNaN(m) || m < 1 ? 1 : m;
    }
    if (body.revoked !== undefined) patch.revoked = !!body.revoked;
    try {
      const updated = await rest('license_keys?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch, headers: { 'Prefer': 'return=representation' } });
      const row = updated && updated[0] ? updated[0] : null;
      return json(res, 200, { success: true, data: row });
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to update key.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await rest('license_activations?license_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      await rest('license_keys?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to delete key.' });
    }
  }

  return json(res, 405, { success: false, error: 'Method not allowed' });
}