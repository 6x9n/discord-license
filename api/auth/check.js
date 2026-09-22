'use strict';

const { json, handleOptions } = require('../_lib/supabase.js');
const { cookieConfigured, isAuthed } = require('../_lib/summary-auth.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  if (req.method !== 'GET') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }
  if (!cookieConfigured()) {
    return json(res, 503, {
      success: false,
      error: 'SUMMARY_PASSWORD is not configured on the server. Add it in the Vercel project settings and redeploy.'
    });
  }
  if (!isAuthed(req)) {
    return json(res, 401, { authenticated: false });
  }
  return json(res, 200, { authenticated: true });
};