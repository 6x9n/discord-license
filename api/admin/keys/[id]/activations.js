'use strict';

const { rest, json, handleOptions, isAuthorized } = require('../../../_lib/supabase.js');

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

  if (req.method === 'DELETE') {
    try {
      await rest('license_activations?license_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to clear activations.' });
    }
  }

  return json(res, 405, { success: false, error: 'Method not allowed' });
}