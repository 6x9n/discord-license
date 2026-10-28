'use strict';

// Consolidated serverless handler for the /summary dashboard.
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions, so all
// summary operations share a single file and are routed by method + ?op=.
//
//   GET    /api/summary?op=check            -> session status
//   POST   /api/summary?op=login            -> { password }
//   POST   /api/summary?op=logout           -> clear session
//   POST   /api/summary?op=fetch            -> { token } Discord profile parse
//   POST   /api/summary?op=token-add        -> fetch + save an account from a token
//   POST   /api/summary?op=register-tool    -> bind a saved token to the tool
//   GET    /api/summary                     -> list accounts
//   POST   /api/summary                     -> create account
//   PATCH  /api/summary?id=<uuid>           -> update / mark sold
//   DELETE /api/summary?id=<uuid>           -> delete account

const crypto = require('crypto');
const { rest, readBody, json, handleOptions } = require('./_lib/supabase.js');
const { encryptToken, decryptToken, tokenHint } = require('./_lib/token-crypto.js');
const { syncAccountMoney } = require('./_lib/money-sync.js');
const {
  secretMatches,
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
      error: 'No access secret is configured on the server. Set SUMMARY_PASSWORD or LICENSE_ADMIN_SECRET in the Vercel project settings and redeploy.'
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

function reject400(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

// Shared field validation for both create and update payloads.
function assertProfile(body) {
  const did = String(body.discordId || '').trim();
  if (did && !/^[0-9]{15,21}$/.test(did)) {
    reject400('Discord ID must be 15 to 21 digits when provided.');
  }
  const username = String(body.username || '').trim();
  if (username.length > 40) {
    reject400('Username is too long (max 40 characters).');
  }
  const email = String(body.email || '').trim();
  if (email && email.indexOf('@') !== -1 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    reject400('Email address format looks invalid.');
  }
  const phone = String(body.phone || '').trim();
  if (phone && !/^[0-9()+\-.\s]{6,30}$/.test(phone)) {
    reject400('Phone number looks invalid.');
  }
  const notes = String(body.notes || '').trim();
  if (notes.length > 2000) {
    reject400('Notes are too long (max 2000 characters).');
  }
  const buyerName = String(body.buyerName || '').trim();
  if (buyerName.length > 120) {
    reject400('Buyer name is too long (max 120 characters).');
  }
  const buyerTelegram = String(body.buyerTelegram || '').trim();
  if (buyerTelegram.length > 200) {
    reject400('Buyer telegram reference is too long (max 200 characters).');
  }
  if (body.badges !== undefined) {
    if (!Array.isArray(body.badges)) reject400('Badges must be a list.');
    if (body.badges.length > 120) reject400('Too many badges (max 120).');
    body.badges.forEach(function (b) {
      if (String(b).trim().length > 60) reject400('A badge label is too long (max 60 characters).');
    });
  }
  if (body.decorations !== undefined) {
    if (!Array.isArray(body.decorations)) reject400('Decorations must be a list.');
    if (body.decorations.length > 40) reject400('Too many decorations (max 40).');
    body.decorations.forEach(function (d) {
      if (String(d).trim().length > 60) reject400('A decoration label is too long (max 60 characters).');
    });
  }
  // Credentials, workflow status and provenance. Length-capped so a row can
  // never be used as an unbounded blob.
  const emailPassword = String(body.emailPassword || '').trim();
  if (emailPassword.length > 200) reject400('Email password is too long (max 200 characters).');
  const discordPassword = String(body.discordPassword || '').trim();
  if (discordPassword.length > 200) reject400('Discord password is too long (max 200 characters).');
  const source = String(body.source || '').trim();
  if (source.length > 300) reject400('Source is too long (max 300 characters).');
  const statusLabel = String(body.statusLabel || '').trim();
  if (statusLabel.length > 60) reject400('Status is too long (max 60 characters).');
  const globalName = String(body.globalName || '').trim();
  if (globalName.length > 100) reject400('Global name is too long (max 100 characters).');
  const soldLink1 = String(body.soldLink1 || body.sold_link_1 || '').trim();
  if (soldLink1.length > 500) reject400('Sold 1 link or note is too long (max 500 characters).');
  const soldLink2 = String(body.soldLink2 || body.sold_link_2 || '').trim();
  if (soldLink2.length > 500) reject400('Sold 2 link or note is too long (max 500 characters).');
  const nitroEnds = String(body.nitroEnds || '').trim();
  if (nitroEnds && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(nitroEnds)) {
    reject400('Nitro end must be a date in YYYY-MM-DD form.');
  }
  return true;
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

function discordAvatarUrl(user) {
  if (!user || !user.id) return '';
  if (user.avatar) {
    const extension = String(user.avatar).indexOf('a_') === 0 ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.' + extension + '?size=128';
  }
  let index = 0;
  try {
    index = Number(BigInt(String(user.id)) % 5n);
  } catch (e) {
    index = 0;
  }
  if (!isFinite(index) || index < 0 || index > 4) index = 0;
  return 'https://cdn.discordapp.com/embed/avatars/' + index + '.png';
}

function mapDiscordUser(user) {
  const flags = user.public_flags !== undefined ? user.public_flags : user.flags;
  const badges = decodeFlags(flags);
  const decorations = [];
  if (user.avatar_decoration_data && user.avatar_decoration_data.name) {
    decorations.push(String(user.avatar_decoration_data.name));
  }
  return {
    discordId: String(user.id || ''),
    // username is the handle, globalName is the display name. Keeping both
    // means the tool can show "Display (@handle)" instead of losing one.
    username: String(user.username || ''),
    globalName: user.global_name ? String(user.global_name) : '',
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
    decorations: decorations,
    avatar: user.avatar || '',
    avatarUrl: discordAvatarUrl(user),
    publicFlags: Number(flags) || 0
  };
}

// One place for the Discord call so the profile preview and the save path can
// never disagree about which account a token belongs to.
async function fetchDiscordUser(token) {
  if (typeof fetch !== 'function') {
    const err = new Error('Fetch API not available in this runtime.');
    err.status = 502;
    throw err;
  }
  let response;
  let raw;
  try {
    response = await fetch(DISCORD_API + '/users/@me', {
      method: 'GET',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      }
    });
    raw = await response.text();
  } catch (e) {
    const err = new Error('Could not reach the Discord API. Check your network and try again.');
    err.status = 502;
    err.detail = (e && e.message) || null;
    throw err;
  }
  if (!response.ok) {
    let message = 'Discord rejected the token.';
    if (response.status === 401) message = 'Invalid or expired token. Check that you pasted the full token.';
    else if (response.status === 403) message = 'Discord blocked this token. It may have been flagged or the account requires verification.';
    else if (response.status === 429) message = 'Discord is rate-limiting requests right now. Wait a moment and try again.';
    const err = new Error(message);
    err.status = response.status === 429 ? 429 : (response.status === 401 || response.status === 403 ? 400 : 502);
    err.discordStatus = response.status;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error('Unexpected response from Discord.');
    err.status = 502;
    err.detail = String(raw || '').slice(0, 200);
    throw err;
  }
}

function publicAccount(row) {
  if (!row || typeof row !== 'object') return row;
  const copy = Object.assign({}, row);
  // Never let the encrypted material leave the server. The list only needs to
  // know whether a token exists and what its last characters are.
  copy.has_token = !!copy.discord_token_enc;
  copy.token_hint = String(copy.token_hint || '');
  delete copy.discord_token_enc;
  delete copy.discord_token_iv;
  delete copy.discord_token_tag;
  return copy;
}

function ownerContext() {
  return String(process.env.OWNER_KEY_LABEL || process.env.TOOL_OWNER_LABEL || 'Owner').trim() || 'Owner';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a === undefined || a === null ? '' : a));
  const right = Buffer.from(String(b === undefined || b === null ? '' : b));
  if (!left.length || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (e) {
    return false;
  }
}

// The admin console signs in with the master admin secret, while a dedicated
// owner key can also be configured. Accept either so setting LICENSE_OWNER_KEY
// does not lock the master account out of token operations.
function ownerGuard(req, res) {
  const expected = [process.env.LICENSE_OWNER_KEY, process.env.LICENSE_ADMIN_SECRET]
    .map(function (value) { return String(value || '').trim(); })
    .filter(Boolean);
  if (!expected.length) {
    json(res, 503, {
      success: false,
      error: 'Owner action is not configured. Set LICENSE_OWNER_KEY or LICENSE_ADMIN_SECRET in the Vercel project settings.'
    });
    return false;
  }
  const headerKey = String((req.headers && req.headers['x-owner-key']) || '').trim();
  const bearer = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '').trim();
  const supplied = headerKey || bearer;
  const accepted = expected.some(function (secret) {
    return safeEqual(supplied, secret);
  });
  if (!accepted) {
    json(res, 403, {
      success: false,
      error: 'Owner authorization required. Sign in with the master admin key to add or register a Discord token.'
    });
    return false;
  }
  return true;
}

function sanitizeCreate(body) {
  const buyPrice = parseMoney(body.buyPrice);
  if (buyPrice === null || buyPrice < 0) {
    const err = new Error('Buy price is required and must be a valid non-negative number.');
    err.status = 400;
    throw err;
  }
  assertProfile(body);
  // A pasted record that already contains a sale is created as sold, so its
  // revenue and outstanding balance count from the first render. The caller
  // must say so explicitly; an asking price alone does not make a sale.
  const status = String(body.status || '').toUpperCase() === 'SOLD' ? 'SOLD' : 'AVAILABLE';
  let soldAt = null;
  if (status === 'SOLD') {
    const ts = body.soldAt ? Date.parse(String(body.soldAt)) : Date.now();
    soldAt = new Date(isNaN(ts) ? Date.now() : ts).toISOString();
  }
  const row = {
    discord_id: String(body.discordId || '').trim(),
    username: String(body.username || '').trim(),
    global_name: String(body.globalName || '').trim(),
    email: String(body.email || '').trim(),
    email_password: String(body.emailPassword || '').trim(),
    discord_password: String(body.discordPassword || '').trim(),
    phone: String(body.phone || '').trim(),
    two_factor_enabled: !!body.twoFactorEnabled,
    verified: !!body.verified,
    nitro_tier: String(body.nitroTier || 'None').trim(),
    badges: Array.isArray(body.badges) ? body.badges.map(String) : [],
    decorations: Array.isArray(body.decorations) ? body.decorations.map(String) : [],
    buy_price: buyPrice,
    // New rows start AVAILABLE, but never silently drop a price the operator
    // typed into the form.
    sell_price: (function () {
      const s = parseMoney(body.sellPrice);
      return s === null || s < 0 ? 0 : s;
    })(),
    status: status,
    sold_at: soldAt,
    status_label: String(body.statusLabel || '').trim(),
    // A new account is not sold, so it starts with nothing received against a
    // split. The columns are still written so the insert does not depend on
    // their server-side default.
    sell_paid_first: (function () {
      const f = parseMoney(body.sellPaidFirst);
      return f === null || f < 0 ? 0 : f;
    })(),
    sell_paid_second: (function () {
      const s = parseMoney(body.sellPaidSecond);
      return s === null || s < 0 ? 0 : s;
    })(),
    // The raw "sold 1" / "sold 2" values, kept as text so a payment note or a
    // link survives even when the value is not an amount.
    sold_link_1: String(body.soldLink1 || body.sold_link_1 || '').trim(),
    sold_link_2: String(body.soldLink2 || body.sold_link_2 || '').trim(),
    source: String(body.source || '').trim(),
    notes: String(body.notes || '').trim(),
    buyer_name: String(body.buyerName || '').trim(),
    buyer_telegram: String(body.buyerTelegram || '').trim()
  };
  if (body.creationDate) {
    const ts = Date.parse(String(body.creationDate));
    if (!isNaN(ts)) row.creation_date = new Date(ts).toISOString();
  }
  if (body.nitroEnds) row.nitro_ends = String(body.nitroEnds).trim();
  return row;
}

function sanitizeUpdate(body) {
  assertProfile(body);
  const patch = {};
  // The admin console posts camelCase while older/standalone callers may post
  // the raw column name, so accept either spelling for every mapped field.
  const fieldAliases = {
    username: 'username',
    global_name: 'globalName',
    email: 'email',
    phone: 'phone',
    notes: 'notes',
    nitro_tier: 'nitroTier',
    nitro_ends: 'nitroEnds',
    email_password: 'emailPassword',
    discord_password: 'discordPassword',
    source: 'source',
    status_label: 'statusLabel',
    sold_link_1: 'soldLink1',
    sold_link_2: 'soldLink2'
  };
  Object.keys(fieldAliases).forEach(function (key) {
    const camel = fieldAliases[key];
    if (body[camel] !== undefined && body[camel] !== null) patch[key] = String(body[camel]);
    else if (body[key] !== undefined && body[key] !== null) patch[key] = String(body[key]);
  });
  if (body.discordId !== undefined && body.discordId !== null) patch.discord_id = String(body.discordId).trim();
  else if (body.discord_id !== undefined && body.discord_id !== null) patch.discord_id = String(body.discord_id).trim();
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
  // The two received instalments of a split sale. Only these are stored; the
  // second instalment and the outstanding balance are derived from them and
  // sell_price, so nothing can be posted that contradicts the total.
  ['sellPaidFirst', 'sellPaidSecond'].forEach(function (key) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === '') return;
    const n = Number(raw);
    if (isFinite(n) && n >= 0) patch[key === 'sellPaidFirst' ? 'sell_paid_first' : 'sell_paid_second'] = n;
  });
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
  if (body.buyerName !== undefined && body.buyerName !== null) {
    patch.buyer_name = String(body.buyerName);
  }
  if (body.buyerTelegram !== undefined && body.buyerTelegram !== null) {
    patch.buyer_telegram = String(body.buyerTelegram);
  }
  return patch;
}

/* ---------------- operations ---------------- */
async function opLogin(req, res) {
  if (!cookieConfigured()) {
    return json(res, 503, {
      success: false,
      error: 'No access secret is configured on the server. Set SUMMARY_PASSWORD or LICENSE_ADMIN_SECRET in the Vercel project settings and redeploy.'
    });
  }
  const body = await readBody(req);
  // Accepts either the standalone summary password or the admin console
  // secret, so the merged dashboard only asks for one credential.
  const supplied = body.password !== undefined ? body.password : body.secret;
  if (!secretMatches(supplied)) {
    return json(res, 401, { success: false, error: 'Incorrect password.' });
  }
  setAuthCookie(res);
  return json(res, 200, { success: true });
}

function opCheck(req, res) {
  if (!cookieConfigured()) {
    return json(res, 503, {
      success: false,
      error: 'No access secret is configured on the server. Set SUMMARY_PASSWORD or LICENSE_ADMIN_SECRET in the Vercel project settings and redeploy.'
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
  if (!authGuard(req, res)) return;
  const body = await readBody(req);
  const token = String(body.token || '').trim();
  if (!token) {
    return json(res, 400, { success: false, error: 'Discord token is required.' });
  }

  let user;
  try {
    user = await fetchDiscordUser(token);
  } catch (err) {
    return json(res, (err && err.status) || 502, {
      success: false,
      error: (err && err.message) || 'Could not fetch the Discord profile.',
      detail: (err && err.detail) || null,
      discordStatus: (err && err.discordStatus) || null
    });
  }

  return json(res, 200, {
    success: true,
    data: mapDiscordUser(user)
  });
}

async function opTokenAdd(req, res) {
  if (!authGuard(req, res)) return;
  if (!ownerGuard(req, res)) return;

  const body = await readBody(req);
  const token = String(body.token || '').trim();
  if (!token) {
    return json(res, 400, { success: false, error: 'Discord token is required.' });
  }
  if (/\s/.test(token) || token.length < 20) {
    return json(res, 400, {
      success: false,
      error: 'That does not look like a full Discord token. Copy the whole token, with no spaces, and try again.'
    });
  }

  let user;
  try {
    user = await fetchDiscordUser(token);
  } catch (err) {
    return json(res, (err && err.status) || 502, {
      success: false,
      error: (err && err.message) || 'Discord rejected the token.',
      detail: (err && err.detail) || null,
      discordStatus: (err && err.discordStatus) || null
    });
  }

  const profile = mapDiscordUser(user);
  if (!profile.discordId) {
    return json(res, 502, { success: false, error: 'Discord did not return an account ID for this token.' });
  }

  // The preview call is deliberately read-only: the admin can look at what the
  // token resolves to before anything is written.
  if (body.previewOnly) {
    return json(res, 200, { success: true, preview: true, data: profile });
  }

  let encrypted;
  try {
    encrypted = encryptToken(token);
  } catch (err) {
    return json(res, (err && err.status) || 500, {
      success: false,
      error: (err && err.message) || 'Could not encrypt the token.'
    });
  }

  const tokenFields = {
    discord_token_enc: encrypted.ciphertext,
    discord_token_iv: encrypted.iv,
    discord_token_tag: encrypted.tag,
    token_hint: tokenHint(token),
    owner_context: ownerContext(),
    is_registered_in_tool: false,
    tool_registered_at: null
  };
  const profileFields = {
    username: profile.username,
    global_name: profile.globalName,
    email: profile.email,
    phone: profile.phone,
    two_factor_enabled: profile.twoFactorEnabled,
    verified: profile.verified,
    nitro_tier: profile.nitroTier,
    badges: profile.badges,
    decorations: profile.decorations,
    avatar: profile.avatar,
    avatar_url: profile.avatarUrl
  };

  let existing;
  try {
    existing = await rest(
      'discord_accounts?discord_id=eq.' + encodeURIComponent(profile.discordId) + '&select=*&limit=1',
      {}
    );
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, {
      success: false,
      error: (err && err.message) || 'Account lookup failed.'
    });
  }

  if (existing && existing.length) {
    // Re-adding the same Discord account refreshes the stored token instead of
    // creating a duplicate. Prices, buyer, status and notes are untouched, so
    // a refresh can never erase the sales record.
    const patch = Object.assign({}, profileFields, tokenFields);
    // A token without the email scope returns no email. Keep the address the
    // operator already has rather than blanking it.
    if (!profile.email) delete patch.email;
    if (!profile.phone) delete patch.phone;
    if (!existing[0].creation_date && profile.creationDate) {
      patch.creation_date = profile.creationDate;
    }
    let updated;
    try {
      updated = await rest(
        'discord_accounts?id=eq.' + encodeURIComponent(existing[0].id) + '&select=*',
        { method: 'PATCH', body: patch }
      );
    } catch (err) {
      const friendly = friendlyDbError(err, 'Could not refresh the saved account.');
      return json(res, friendly.status || 500, { success: false, error: friendly.message });
    }
    return json(res, 200, {
      success: true,
      created: false,
      data: publicAccount((updated && updated[0]) || Object.assign({}, existing[0], patch))
    });
  }

  const row = Object.assign({
    discord_id: profile.discordId,
    // A token-added account starts with no purchase or sale price. The columns
    // are nullable after sql/quick_add_and_discord_token.sql, so the editor opens
    // with empty money fields instead of a misleading 0.
    buy_price: null,
    sell_price: null,
    status: 'AVAILABLE',
    status_label: '',
    source: '',
    notes: '',
    buyer_name: '',
    buyer_telegram: '',
    sold_link_1: '',
    sold_link_2: ''
  }, profileFields, tokenFields);
  if (profile.creationDate) row.creation_date = profile.creationDate;

  let inserted;
  try {
    inserted = await rest('discord_accounts?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: row
    });
  } catch (err) {
    const friendly = friendlyDbError(err, 'Could not save the account.');
    return json(res, friendly.status || 500, { success: false, error: friendly.message });
  }

  return json(res, 200, {
    success: true,
    created: true,
    data: publicAccount((inserted && inserted[0]) || row)
  });
}

async function opRegisterTool(req, res) {
  if (!authGuard(req, res)) return;
  if (!ownerGuard(req, res)) return;

  const body = await readBody(req);
  const id = String(body.id || req.query.id || '').trim();
  if (!id) {
    return json(res, 400, { success: false, error: 'Account id is required.' });
  }

  let rows;
  try {
    rows = await rest('discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', {});
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, {
      success: false,
      error: (err && err.message) || 'Account lookup failed.'
    });
  }
  const row = rows && rows[0];
  if (!row) return json(res, 404, { success: false, error: 'Account not found.' });

  let token;
  try {
    token = decryptToken(row);
  } catch (err) {
    return json(res, (err && err.status) || 500, {
      success: false,
      error: (err && err.message) || 'Could not decrypt the saved token.'
    });
  }
  if (!token) {
    return json(res, 400, {
      success: false,
      error: 'This account has no saved Discord token. Add it with "Add via Discord Token" first.'
    });
  }

  // A deployment can point at an external tool API. When it does not, the
  // browser binds the token into the tool's own saved-account store (same
  // origin) and opens it, which is the tool's native registration path.
  const registerUrl = String(process.env.TOOL_REGISTER_URL || '').trim();
  let registeredVia = 'local';
  if (registerUrl) {
    const headers = { 'Content-Type': 'application/json' };
    const registerKey = String(process.env.TOOL_REGISTER_API_KEY || '').trim();
    if (registerKey) headers.Authorization = 'Bearer ' + registerKey;
    let response;
    let raw;
    try {
      response = await fetch(registerUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          token: token,
          accountId: row.id,
          discordId: row.discord_id || '',
          username: row.username || '',
          email: row.email || ''
        })
      });
      raw = await response.text();
    } catch (e) {
      return json(res, 502, {
        success: false,
        error: 'Could not reach the tool registration endpoint.',
        detail: (e && e.message) || null
      });
    }
    if (!response.ok) {
      return json(res, 502, {
        success: false,
        error: 'The tool rejected the registration (HTTP ' + response.status + ').',
        detail: String(raw || '').slice(0, 300)
      });
    }
    registeredVia = 'api';
  }

  let updated;
  try {
    updated = await rest('discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=*', {
      method: 'PATCH',
      body: {
        is_registered_in_tool: true,
        tool_registered_at: new Date().toISOString()
      }
    });
  } catch (err) {
    return json(res, (err && err.status) ? err.status : 500, {
      success: false,
      error: (err && err.message) || 'The token was registered but the account record could not be updated.'
    });
  }

  const toolUrl = String(process.env.TOOL_OPEN_URL || '/index.html').trim() || '/index.html';
  const payload = {
    success: true,
    data: publicAccount((updated && updated[0]) || row),
    toolUrl: toolUrl,
    registeredVia: registeredVia
  };
  // Only the local path needs the plaintext token in the browser, and only so
  // it can be written into the tool's own store. An external registration API
  // receives the token directly and never sends it back.
  if (registeredVia === 'local') {
    payload.toolToken = token;
  }
  return json(res, 200, payload);
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
  return json(res, 200, { success: true, data: (rows || []).map(publicAccount) });
}

// PostgREST hands back the raw driver message, which for a unique index reads
// like "duplicate key value violates unique constraint ...". Translate the
// cases an operator can actually trigger into something actionable.
function friendlyDbError(err, fallback) {
  if (err && err.code === '23505') {
    const wrapped = new Error('That Discord ID is already saved. Edit the existing account instead.');
    wrapped.status = 409;
    return wrapped;
  }
  // PGRST204 means PostgREST's schema cache does not know a column the API
  // wrote. In this project that is almost always a missing migration, so name
  // the file instead of showing the raw JSON.
  if (err && (err.code === 'PGRST204' || err.code === '42703' || /schema cache|column .* does not exist/i.test(String(err.message || '')))) {
    const wrapped = new Error('The database is missing a column this save needs. Run sql/quick_add_and_discord_token.sql in Supabase, then retry.');
    wrapped.status = 500;
    return wrapped;
  }
  // A token-added account deliberately saves an empty purchase price. If the
  // base table still has its old NOT NULL constraint, that is the migration not
  // having been run rather than bad input.
  if (err && err.code === '23502') {
    const wrapped = new Error('The database still requires a price on every account. Run sql/quick_add_and_discord_token.sql in Supabase, then retry.');
    wrapped.status = 500;
    return wrapped;
  }
  return new Error((err && err.message) || fallback);
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
    // return=representation is what gives the caller the new row's UUID, which
    // the Quick Add flow uses to open the record for badge editing immediately.
    inserted = await rest('discord_accounts?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: row
    });
  } catch (err) {
    const friendly = friendlyDbError(err, 'Failed to save account.');
    return json(res, friendly.status || 500, { success: false, error: friendly.message });
  }
  const saved = (inserted && inserted[0]) || row;
  // Buying an account is money leaving a bucket, so it posts itself. Idempotent,
  // and a ledger problem never blocks the account from being saved.
  const money = await syncAccountMoney(saved, {});
  return json(res, 200, {
    success: true,
    data: publicAccount(saved),
    money: { synced: !!money.ok, reason: money.reason || null }
  });
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
    // select=* so the saved row comes back whole: the money ledger is reconciled
    // from it immediately below, and a partial row would post a stale figure.
    updated = await rest('discord_accounts?id=eq.' + encodeURIComponent(id) + '&select=*', { method: 'PATCH', body: patch });
  } catch (err) {
    const friendly = friendlyDbError(err, 'Update failed.');
    return json(res, friendly.status || 500, { success: false, error: friendly.message });
  }
  const saved = (updated && updated[0]) || null;
  // An account moving money - bought, sold, or a corrected price - re-derives its
  // ledger entries. Idempotent by source_key, so this is safe on every save and
  // never doubles up. Never allowed to fail the save: the account row is already
  // written and correct without it.
  const money = saved ? await syncAccountMoney(saved, {}) : { ok: false, reason: 'No saved row.' };
  return json(res, 200, { success: true, data: publicAccount(saved), money: { synced: !!money.ok, reason: money.reason || null } });
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
    if (op === 'token-add') return opTokenAdd(req, res);
    if (op === 'register-tool') return opRegisterTool(req, res);
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