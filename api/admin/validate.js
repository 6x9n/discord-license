'use strict';

const { json, handleOptions, readBody } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }

  const body = await readBody(req);
  const secret = String(body.secret || '').trim();
  const adminSecret = process.env.LICENSE_ADMIN_SECRET || '';

  if (!adminSecret) {
    return json(res, 503, { success: false, error: 'Server not configured. Missing LICENSE_ADMIN_SECRET environment variable.' });
  }
  if (secret !== adminSecret) {
    return json(res, 401, { success: false, error: 'Access denied.' });
  }

  return json(res, 200, { success: true, data: { role: 'admin' } });
}