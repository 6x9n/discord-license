'use strict';

const { rest, json, handleOptions, isAuthorized } = require('../../../_lib/supabase.js');

module.exports = async function handler(request, ctx) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return json(request, auth.error === 'Unauthorized' ? 401 : 503, { success: false, error: auth.error });
  }

  const id = decodeURIComponent((ctx.params && ctx.params.id) || '');
  if (!id) {
    return json(request, 400, { success: false, error: 'Missing key id.' });
  }

  if (request.method === 'DELETE') {
    try {
      await rest('license_activations?license_id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return json(request, 200, { success: true });
    } catch (err) {
      return json(request, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Failed to clear activations.' });
    }
  }

  return json(request, 405, { success: false, error: 'Method not allowed' });
}