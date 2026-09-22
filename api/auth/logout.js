'use strict';

const { json, handleOptions } = require('../_lib/supabase.js');
const { clearAuthCookie } = require('../_lib/summary-auth.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }
  clearAuthCookie(res);
  return json(res, 200, { success: true });
};