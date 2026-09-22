'use strict';

const { readBody, json, handleOptions } = require('../_lib/supabase.js');

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

function decodeFlags(flags) {
  const n = Number(flags) || 0;
  const out = [];
  BADGE_MAP.forEach(function (entry) {
    if ((n & entry.bit) === entry.bit) out.push(entry.label);
  });
  return out;
}

// Discord snowflake -> creation timestamp: (id >> 22) + 1420070400000 (Discord epoch).
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }
  if (req.method !== 'POST') {
    return json(res, 405, { success: false, error: 'Method not allowed' });
  }

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
  if (user.profile_effect_data && user.profile_effect_data.id) {
    decorations.push('Profile Effect: ' + String(user.profile_effect_data.id));
  }

  return json(res, 200, {
    success: true,
    data: {
      discordId: String(user.id || ''),
      username: user.global_name ? String(user.global_name) : ((user.username ? String(user.username) : ''))
      + (user.discriminator && user.discriminator !== '0' ? '#' + String(user.discriminator) : ''),
      tag: user.username ? String(user.username)
        + (user.discriminator && user.discriminator !== '0' ? '#' + String(user.discriminator) : '') : '',
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
};