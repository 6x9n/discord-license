'use strict';

const crypto = require('crypto');
const { readBody, json, handleOptions } = require('../_lib/supabase.js');
const { summaryPassword, cookieConfigured, setAuthCookie } = require('../_lib/summary-auth.js');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }
  if (!cookieConfigured()) {
    return json(res, 503, {
      success: false,
      error: 'SUMMARY_PASSWORD is not configured on the server. Add it in the Vercel project settings and redeploy.'
    });
  }

  const body = await readBody(req);
  const candidate = String(body.password || '');
  const expected = summaryPassword();

  if (!safeEqual(candidate, expected)) {
    return json(res, 401, { success: false, error: 'Incorrect password.' });
  }

  setAuthCookie(res);
  return json(res, 200, { success: true });
};