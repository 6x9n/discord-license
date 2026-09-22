'use strict';

// Consolidated serverless handler for the /summary dashboard.
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions, so all
// summary operations share a single file and are routed by method + ?op=.
//
//   GET    /api/summary?op=check            -> session status
//   POST   /api/summary?op=login            -> { password }
//   POST   /api/summary?op=logout           -> clear session
//   POST   /api/summary?op=fetch            -> { token } Discord profile parse
//   GET    /api/summary                     -> list accounts
//   POST   /api/summary                     -> create account
//   PATCH  /api/summary?id=<uuid>           -> update / mark sold
//   DELETE /api/summary?id=<uuid>           -> delete account

const crypto = require('crypto');
const { rest, readBody, json, handleOptions } = require('./_lib/supabase.js');
const {
  summaryPassword,
  cookieConfigured,
  isAuthed,
  setAuthCookie,
  clearAuthCookie
} = require('./_lib/summary-auth.js');

const DISCORD_API = 'https://discord.com/api/v10';

const BADGE_MAP = [
  { bit: 1 << 0, label: 'Discord Staff' },
  { bit: 1 << 1, label: 'Partner' },
  { bit: 1 << 2, label: 'HypeSquad Events' },
  { bit: 1 << 3, label: 'Bug Hunter' },
  { bit: 1 << 6, label: 'HypeSquad Bravery' },
  { bit: 1 << 7, label: 'HypeSquad Brilliance' },
  { bit: 1 << 8, label: 'HypeSquad Balance' },
  { bit: 1 << 9, label: 'Early Supporter' },
  { bit: 1 << 10, label: 'Team User' },
  { bit: 1 << 14, label: 'Bug Hunter Level 2' },
  { bit: 1 << 17, label: 'Verified Developer' },
  { bit: 1 << 18, label: 'Certified Moderator' },
  { bit: 1 << 22, label: 'Active Developer' }
];

const PREMIUM_TIERS = { 0: 'None', 1: 'Nitro Classic', 2: 'Nitro', 3: 'Nitro Basic' };

/* ---------------- helpers ---------------- */
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

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return isFinite(n) ? n : null;
}

function decodeFlags(flags) {
  const n = Number(flags) || 0;
  const out = [];
  BADGE_MAP.forEach(function (entry) {
    if ((n & entry.bit) === entry.bit) out.push(entry.label);
  });
  return out;
}

function snowflakeToDate(id) {
  const clean = String(id || '').replace(/[^0-9]/g, '');
  if (!clean || clean.length > 20) return null;
  try {
    const big = BigInt(clean);
    const ms = (big >> 22n) + 1420070400000n;
    const ts = Number(ms);
    if (isNaN(ts) || ts <= 0 || ts > Date.now() + 60000) return null;
    return new Date(ts).toISOString();
  } catch (e) {
    return null;
  }
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
  if (body.creationDate) {
    const ts = Date.parse(String(body.creationDate));
    if (!isNaN(ts)) row.creation_date = new Date(ts).toISOString();
  }
  if (body.nitroEnds) row.nitro_ends = String(body.nitroEnds).trim();
  return row;
}

function sanitizeUpdate(body) {
  const patch = {};
  const stringFields = ['username', 'email', 'phone', 'notes', 'nitro_tier', 'nitro_ends'];
  stringFields.forEach(function (key) {
    if (body[key] !== undefined && body[key] !== null) patch[key] = String(body[key]);
  });
  if (body.discordId !== undefined && body.discordId !== null) patch.discord_id = String(body.discordId).trim();
  if (typeof body.twoFactorEnabled === 'boolean') patch.two_factor_enabled = body.twoFactorEnabled;
  if (typeof body.verified === 'boolean') patch.verified = body.verified;
  if (Array.isArray(body.badges)) patch.badges = body.badges.map(String);
  if (Array.isArray(body.decorations)) patch.decorations = body.decorations.map(String);
  if (body.creationDate) {
    const ts = Date.parse(String(body.creationDate));
    if (!isNaN(ts)) patch.creation_date = new Date(ts).toISOString();
  } else if (body.creationDate === '') {
    patch.creation_date = null;
  }
  if (body.buyPrice !== undefined && body.buyPrice !== null && body.buyPrice !== '') {
    const n = Number(body.buyPrice);
    if (isFinite(n) && n >= 0) patch.buy_price = n;
  }
  if (body.sellPrice !== undefined && body.sellPrice !== null && body.sellPrice !== '') {
    const n = Number(body.sellPrice);
    if (isFinite(n) && n >= 0) patch.sell_price = n;
  }
  if (body.status) {
    const status = String(body.status).toUpperCase();
    if (status === 'AVAILABLE' || status === 'SOLD') {
      patch.status = status;
      if (status === 'SOLD' && !body.soldAt) patch.sold_at = new Date().toISOString();
    }
  }
  if (body.soldAt) {
    const ts = Date.parse(String(body.soldAt));
    if (!isNaN(ts)) patch.sold_at = new Date(ts).toISOString();
  } else if (body.soldAt === null) {
    patch.sold_at = null;
  }
  return patch;
}

/* ---------------- operations ---------------- */
async function opLogin(req, res) {
  if (!cookieConfigured()) {
    return json(res, 503, {
      success: false,
      error: 'SUMMARY_PASSWORD is not configured on the server. Add it in the Vercel project settings and redeploy.'
    });
  }
  const body = await readBody(req);
  if (!safeEqual(body.password || '', summaryPassword())) {
    return json(res, 401, { success: false, error: 'Incorrect password.' });
  }
  setAuthCookie(res);
  return json(res, 200, { success: true });
}

function opCheck(req, res) {
  if (!cookieConfigured()) {
    return json(res, 503, {
      success: false,
      error: 'SUMMARY_PASSWORD is not configured on the server. Add it in the Vercel project settings and redeploy.'
    });
  }
  if (!isAuthed(req)) return json(res, 401, { authenticated: false });
  return json(res, 200, { authenticated: true });
}

function opLogout(req, res) {
  clearAuthCookie(res);
  return json(res, 200, { success: true });
}

async function opFetch(req, res) {
  const body = await readBody(req);
  const token = String(body.token || '').trim();
  if (!token) {
    return json(res, 400, { success: false, error: 'Discord token is required.' });
  }

  let discordRes;
  let raw;
  try {
    if (typeof fetch !== 'function') {
      return json(res, 502, { success: false, error: 'Fetch API not available in this runtime.' });
    }
    discordRes = await fetch(DISCORD_API + '/users/@me', {
      method: 'GET',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      }
    });
    raw = await discordRes.text();
  } catch (e) {
    return json(res, 502, {
      success: false,
      error: 'Could not reach the Discord API. Check your network and try again.',
      detail: (e && e.message) || null
    });
  }

  if (!discordRes.ok) {
    const status = discordRes.status;
    let message = 'Discord rejected the token.';
    if (status === 401) message = 'Invalid or expired token. Check that you pasted the full token.';
    else if (status === 403) message = 'Discord blocked this token. It may have been flagged or the account requires verification.';
    else if (status === 429) message = 'Discord is rate-limiting requests right now. Wait a moment and try again.';
    return json(res, status === 401 || status === 403 ? 400 : (status === 429 ? 429 : 502), {
      success: false,
      error: message,
      discordStatus: status
    });
  }

  let user;
  try {
    user = JSON.parse(raw);
  } catch (e) {
    return json(res, 502, { success: false, error: 'Unexpected response from Discord.', detail: raw.slice(0, 200) });
  }

  const badges = decodeFlags(user.public_flags !== undefined ? user.public_flags : user.flags);
  const decorations = [];
  if (user.avatar_decoration_data && user.avatar_decoration_data.name) {
    decorations.push(String(user.avatar_decoration_data.name));
  }

  return json(res, 200, {
    success: true,
    data: {
      discordId: String(user.id || ''),
      username: user.global_name
        ? String(user.global_name)
        : String(user.username || ''),
      tag: user.username
        ? String(user.username) + (user.discriminator && user.discriminator !== '0' ? '#' + String(user.discriminator) : '')
        : '',
      email: user.email || '',
      phone: user.phone || '',
      emailLinked: !!user.email,
      phoneLinked: !!user.phone,
      twoFactorEnabled: !!user.mfa_enabled,
      verified: !!user.verified,
      creationDate: snowflakeToDate(user.id),
      nitroTier: PREMIUM_TIERS[Number(user.premium_type)] || 'Unknown',
      nitroEnds: '',
      badges: badges,
      decorations: decorations
    }
  });
}

async function opList(req, res) {
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

async function opCreate(req, res) {
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

async function opUpdate(req, res, id) {
  const body = await readBody(req);
  const patch = sanitizeUpdate(body);
  if (!Object.keys(patch).length) {
    return json(res, 400, { success: false, error: 'Nothing to update.' });
  }
  const query = 'discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1';
  let rows;
  try {
    rows = await rest(query, {});
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Account lookup failed.' });
  }
  if (!rows || !rows.length) return json(res, 404, { success: false, error: 'Account not found.' });
  let updated;
  try {
    updated = await rest('discord_accounts?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Update failed.' });
  }
  return json(res, 200, { success: true, data: (updated && updated[0]) || null });
}

async function opDelete(req, res, id) {
  let rows;
  try {
    rows = await rest('discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1', {});
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Delete failed.' });
  }
  if (!rows || !rows.length) return json(res, 404, { success: false, error: 'Account not found.' });
  try {
    await rest('discord_accounts?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Delete failed.' });
  }
  return json(res, 200, { success: true });
}

/* ---------------- router ---------------- */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }

  const op = String((req.query && req.query.op) || '').trim();
  const id = String((req.query && req.query.id) || '').trim();

  if (req.method === 'POST') {
    if (op === 'login') return opLogin(req, res);
    if (op === 'logout') return opLogout(req, res);
    if (op === 'fetch') return opFetch(req, res);
    if (!op) {
      if (!authGuard(req, res)) return;
      return opCreate(req, res);
    }
    return json(res, 400, { success: false, error: 'Unknown operation.' });
  }

  if (req.method === 'GET') {
    if (op === 'check') return opCheck(req, res);
    if (op === 'logout') return opLogout(req, res);
    if (!op) {
      if (!authGuard(req, res)) return;
      return opList(req, res);
    }
    return json(res, 400, { success: false, error: 'Unknown operation.' });
  }

  if (req.method === 'PATCH') {
    if (!id) return json(res, 400, { success: false, error: 'Account id is required.' });
    if (!authGuard(req, res)) return;
    return opUpdate(req, res, id);
  }

  if (req.method === 'DELETE') {
    if (!id) return json(res, 400, { success: false, error: 'Account id is required.' });
    if (!authGuard(req, res)) return;
    return opDelete(req, res, id);
  }

  return json(res, 405, { success: false, error: 'Method not allowed' });
};