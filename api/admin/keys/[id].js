'use strict';

const { rest, json, handleOptions, isAuthorized } = require('../../_lib/supabase.js');

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

module.exports = async function handler(request, ctx) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  const { ok: authOk, error: authErr } = isAuthorized(request);
      if (!authOk) {
        return json(request, authErr === 'Unauthorized' ? 401 : 503, { success: false, error: authErr });
      }

  const id = decodeURIComponent((ctx.params && ctx.params.id) || '');
  if (!id) {
    return json(request, 400, { success: false, error: 'Missing key id.' });
  }

  if (request.method === 'PATCH') {
    const body = await readBody(request);
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
      return json(request, 200, { success: true, data: row });
    } catch (err) {
      return json(request, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to update key.' });
    }
  }

  if (request.method === 'DELETE') {
    try {
      await rest('license_activations?license_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      await rest('license_keys?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return json(request, 200, { success: true });
    } catch (err) {
      return json(request, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to delete key.' });
    }
  }

  return json(request, 405, { success: false, error: 'Method not allowed' });
}