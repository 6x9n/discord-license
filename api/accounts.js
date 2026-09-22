'use strict';

const { rest, readBody, json, handleOptions } = require('./_lib/supabase.js');
const { cookieConfigured, isAuthed } = require('./_lib/summary-auth.js');

function authGuard(req, res) {
  if (!cookieConfigured()) {
    json(res, 503, {
      success: false,
      error: 'SUMMARY_PASSWORD is not configured on the server. Add it in the Vercel project settings and redeploy.'
    });
    return false;
  }
  if (!isAuthed(req)) {
    json(res, 401, { success: false, error: 'Unauthorized.' });
    return false;
  }
  return true;
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return isFinite(n) ? n : null;
}

function sanitizeCreate(body) {
  const buyPrice = parseMoney(body.buyPrice);
  if (buyPrice === null || buyPrice < 0) {
    const err = new Error('Buy price is required and must be a valid non-negative number.');
    err.status = 400;
    throw err;
  }
  const row = {
    discord_id: String(body.discordId || '').trim(),
    username: String(body.username || '').trim(),
    email: String(body.email || '').trim(),
    phone: String(body.phone || '').trim(),
    two_factor_enabled: !!body.twoFactorEnabled,
    verified: !!body.verified,
    nitro_tier: String(body.nitroTier || 'None').trim(),
    badges: Array.isArray(body.badges) ? body.badges.map(String) : [],
    decorations: Array.isArray(body.decorations) ? body.decorations.map(String) : [],
    buy_price: buyPrice,
    sell_price: 0,
    status: 'AVAILABLE',
    notes: String(body.notes || '').trim()
  };
  const cd = body.creationDate;
  if (cd) {
    const ts = Date.parse(String(cd));
    if (!isNaN(ts)) row.creation_date = new Date(ts).toISOString();
  }
  const ne = body.nitroEnds;
  if (ne) row.nitro_ends = String(ne).trim();
  return row;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }

  if (req.method === 'GET') {
    if (!authGuard(req, res)) return;
    let rows;
    try {
      rows = await rest('discord_accounts?select=*&order=created_at.desc', {});
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, {
        success: false,
        error: (err && err.message) || 'Failed to load accounts.'
      });
    }
    return json(res, 200, { success: true, data: rows || [] });
  }

  if (req.method === 'POST') {
    if (!authGuard(req, res)) return;
    const body = await readBody(req);
    let row;
    try {
      row = sanitizeCreate(body);
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 400, {
        success: false,
        error: (err && err.message) || 'Invalid account data.'
      });
    }
    let inserted;
    try {
      inserted = await rest('discord_accounts', { method: 'POST', body: row });
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, {
        success: false,
        error: (err && err.message) || 'Failed to save account.'
      });
    }
    return json(res, 200, { success: true, data: (inserted && inserted[0]) || row });
  }

  return json(res, 405, { success: false, error: 'Method not allowed' });
};