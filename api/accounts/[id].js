'use strict';

const { rest, readBody, json, handleOptions } = require('../_lib/supabase.js');
const { cookieConfigured, isAuthed } = require('../_lib/summary-auth.js');

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

function notFound(res) {
  return json(res, 404, { success: false, error: 'Account not found.' });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }

  const id = String(req.query.id || '').trim();
  if (!id) {
    return json(res, 400, { success: false, error: 'Account id is required.' });
  }
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }
  if (!authGuard(req, res)) return;

  const query = 'discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1';

  if (req.method === 'DELETE') {
    let rows;
    try {
      rows = await rest(query, {});
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Delete failed.' });
    }
    if (!rows || !rows.length) return notFound(res);
    try {
      await rest('discord_accounts?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    } catch (err) {
      return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Delete failed.' });
    }
    return json(res, 200, { success: true });
  }

  const body = await readBody(req);
  const patch = sanitizeUpdate(body);
  if (!Object.keys(patch).length) {
    return json(res, 400, { success: false, error: 'Nothing to update.' });
  }

  let rows;
  try {
    rows = await rest(query, {});
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Account lookup failed.' });
  }
  if (!rows || !rows.length) return notFound(res);

  let updated;
  try {
    updated = await rest('discord_accounts?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, { success: false, error: (err && err.message) || 'Update failed.' });
  }
  return json(res, 200, { success: true, data: (updated && updated[0]) || null });
};