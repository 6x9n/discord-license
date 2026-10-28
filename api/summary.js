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

const DISCORD_API = 'https://discord.com/api/v9';
const DISCORD_CLIENT_BUILD_NUMBER = 625378;
const DISCORD_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BADGE_MAP = [
  { bit: 1 << 0, label: 'Discord Staff' },
  { bit: 1 << 1, label: 'Partner' },
  { bit: 1 << 2, label: 'HypeSquad Events' },
  { bit: 1 << 3, label: 'Bug Hunter Level 1' },
  { bit: 1 << 6, label: 'HypeSquad Bravery' },
  { bit: 1 << 7, label: 'HypeSquad Brilliance' },
  { bit: 1 << 8, label: 'HypeSquad Balance' },
  { bit: 1 << 9, label: 'Early Supporter' },
  { bit: 1 << 10, label: 'Team User' },
  { bit: 1 << 14, label: 'Bug Hunter Level 2' },
  { bit: 1 << 17, label: 'Verified Developer' },
  { bit: 1 << 18, label: 'Discord Certified Moderator' },
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

/* ---------------- profile badges ---------------- */

// `/users/@me` only carries flag bits and the Nitro tier. Most of the artwork
// shown on a Discord profile (boosts, gifts, quests and the newer activity
// tiers) lives on `/users/{id}/profile`, so this translates that list into the
// same canonical labels the admin badge picker and artwork already use.
const PROFILE_BADGE_LABELS = {
  staff: 'Discord Staff',
  discord_staff: 'Discord Staff',
  partner: 'Partner',
  partnered_server_owner: 'Partner',
  hypesquad: 'HypeSquad Events',
  hypesquad_events: 'HypeSquad Events',
  hypesquad_house_1: 'HypeSquad Bravery',
  hypesquad_bravery: 'HypeSquad Bravery',
  bravery: 'HypeSquad Bravery',
  hypesquad_house_2: 'HypeSquad Brilliance',
  hypesquad_brilliance: 'HypeSquad Brilliance',
  brilliance: 'HypeSquad Brilliance',
  hypesquad_house_3: 'HypeSquad Balance',
  hypesquad_balance: 'HypeSquad Balance',
  balance: 'HypeSquad Balance',
  bug_hunter_level_1: 'Bug Hunter Level 1',
  bughunter1: 'Bug Hunter Level 1',
  bug_hunter_level_2: 'Bug Hunter Level 2',
  bughunter2: 'Bug Hunter Level 2',
  early_supporter: 'Early Supporter',
  earlysupporter: 'Early Supporter',
  verified_developer: 'Verified Developer',
  verified_bot_developer: 'Verified Developer',
  early_verified_bot_developer: 'Verified Developer',
  botdev: 'Verified Developer',
  certified_moderator: 'Discord Certified Moderator',
  moderator_programs_alumni: 'Discord Certified Moderator',
  moderator: 'Discord Certified Moderator',
  active_developer: 'Active Developer',
  activedeveloper: 'Active Developer',
  nitro_basic: 'Nitro Basic',
  nitro_classic: 'Nitro Classic',
  quest_completed: 'Completed a Quest',
  quest: 'Completed a Quest',
  quest_badge: 'Completed a Quest',
  premium: 'Nitro',
  nitro: 'Nitro',
  last_meadow: 'Last Meadow Online',
  lastmeadow: 'Last Meadow Online',
  orb: 'Orb',
  orbs_apprentice: 'Orb',
  leaf: 'Leaf',
  leaves: 'Leaf'
};

// Discord's beta activity badges level up, and the profile response gives the
// threshold in the description ("5,000+ hours"). The arrays below mirror the
// labels and thresholds in js/badge-icons.js.
const ACCOUNT_AGE_BADGES = [
  { value: 1, label: 'Seed' },
  { value: 2, label: 'Sprout' },
  { value: 3, label: 'Bud' },
  { value: 4, label: 'Sapling' },
  { value: 5, label: 'Blossom' },
  { value: 6, label: 'Redwood' },
  { value: 7, label: 'Sequoia' },
  { value: 8, label: 'Bristlecone' },
  { value: 9, label: 'Stromatolite' },
  { value: 10, label: 'Primordial' }
];

const STREAMING_BADGES = [
  { value: 1, label: 'Newcomer' },
  { value: 5, label: 'Fledgling' },
  { value: 20, label: 'Breakout' },
  { value: 75, label: 'Standout' },
  { value: 150, label: 'Trendsetter' },
  { value: 300, label: 'Headliner' },
  { value: 500, label: 'Star' },
  { value: 1000, label: 'Sensation' },
  { value: 2000, label: 'Visionary' },
  { value: 5000, label: 'Phenomenon' }
];

const GAME_TIME_BADGES = [
  { value: 1, label: 'Casual' },
  { value: 5, label: 'Recreational' },
  { value: 20, label: 'Dedicated' },
  { value: 75, label: 'Committed' },
  { value: 150, label: 'Serious' },
  { value: 300, label: 'Devoted' },
  { value: 500, label: 'Seasoned' },
  { value: 1000, label: 'Ironclad' },
  { value: 2000, label: 'Unshakeable' },
  { value: 5000, label: 'Eternal' }
];

const GAME_VARIETY_BADGES = [
  { value: 2, label: 'Sampler' },
  { value: 5, label: 'Dabbler' },
  { value: 10, label: 'Enthusiast' },
  { value: 15, label: 'Ranger' },
  { value: 20, label: 'Explorer' },
  { value: 30, label: 'Adventurer' },
  { value: 40, label: 'Voyager' },
  { value: 60, label: 'Maverick' },
  { value: 80, label: 'Polymath' },
  { value: 100, label: 'Universalist' }
];

const GIFT_BADGE_NAMES = ['Patron', 'Champion', 'Luminary', 'Icon', 'Hero', 'Legend'];

function pickBadgeTier(tiers, value) {
  let chosen = '';
  tiers.forEach(function (tier) {
    if (value >= tier.value) chosen = tier.label;
  });
  return chosen;
}

function badgeTierFromId(tiers, idStr) {
  const text = String(idStr || '');
  const match = text.match(/(?:level|lvl|tier|age)[_ -]?(\d+)/) || text.match(/(\d+)$/);
  if (!match) return '';
  let index = Number(match[1]);
  if (!isFinite(index) || index < 1) return '';
  index = Math.min(tiers.length, index);
  return tiers[index - 1].label;
}

function activityBadgeLabel(idStr, description) {
  const id = String(idStr || '').toLowerCase();
  const text = String(description || '');
  const lower = text.toLowerCase();
  const numberMatch = text.match(/([\d,]+)\+?/);
  const numberValue = numberMatch ? Number(numberMatch[1].replace(/,/g, '')) : null;

  if (id.indexOf('account_age') !== -1 || id.indexOf('accountage') !== -1 || id.indexOf('account-age') !== -1 ||
    (lower.indexOf('account') !== -1 && lower.indexOf('year') !== -1)) {
    const yearsMatch = text.match(/([\d,]+)\+?\s*year/i);
    const years = yearsMatch ? Number(yearsMatch[1].replace(/,/g, '')) : numberValue;
    return years != null && isFinite(years)
      ? pickBadgeTier(ACCOUNT_AGE_BADGES, years)
      : badgeTierFromId(ACCOUNT_AGE_BADGES, id);
  }

  if (id.indexOf('stream') !== -1 || lower.indexOf('stream') !== -1) {
    const hoursMatch = text.match(/([\d,]+)\+?\s*hour/i);
    const hours = hoursMatch ? Number(hoursMatch[1].replace(/,/g, '')) : numberValue;
    return hours != null && isFinite(hours)
      ? pickBadgeTier(STREAMING_BADGES, hours)
      : badgeTierFromId(STREAMING_BADGES, id);
  }

  if (id.indexOf('game_time') !== -1 || id.indexOf('gametime') !== -1 || id.indexOf('game-time') !== -1 ||
    (lower.indexOf('detectable pc games') !== -1 && lower.indexOf('hour') !== -1)) {
    const hoursMatch = text.match(/([\d,]+)\+?\s*hour/i);
    const hours = hoursMatch ? Number(hoursMatch[1].replace(/,/g, '')) : numberValue;
    return hours != null && isFinite(hours)
      ? pickBadgeTier(GAME_TIME_BADGES, hours)
      : badgeTierFromId(GAME_TIME_BADGES, id);
  }

  if (id.indexOf('game_variety') !== -1 || id.indexOf('gamevariety') !== -1 || id.indexOf('game-variety') !== -1 ||
    (lower.indexOf('detectable pc games') !== -1 && lower.indexOf('hour') === -1)) {
    const gamesMatch = text.match(/([\d,]+)\+?\s*(?:different\s+)?(?:detectable\s+)?(?:pc\s+)?games/i);
    const games = gamesMatch ? Number(gamesMatch[1].replace(/,/g, '')) : numberValue;
    return games != null && isFinite(games)
      ? pickBadgeTier(GAME_VARIETY_BADGES, games)
      : badgeTierFromId(GAME_VARIETY_BADGES, id);
  }

  if (id.indexOf('last_meadow') !== -1 || id.indexOf('lastmeadow') !== -1 || lower.indexOf('last meadow') !== -1) {
    return 'Last Meadow Online';
  }
  if (id.indexOf('orb') !== -1 || lower.indexOf('orbs apprentice') !== -1) {
    return 'Orb';
  }
  if (id.indexOf('leaf') !== -1 || lower.indexOf('leaves') !== -1) {
    return 'Leaf';
  }
  return '';
}

function isGiftBadgeId(idStr, description) {
  const a = String(idStr || '').toLowerCase();
  const b = String(description || '').toLowerCase();
  if (a.indexOf('gift') !== -1 || a.indexOf('gifter') !== -1) return true;
  return /gift(ing|er)?\s*badge/.test(b) || /^gift(ing|er)?\b/.test(b);
}

function giftBadgeLabel(idStr, description) {
  const text = (String(idStr || '') + ' ' + String(description || '')).toLowerCase();
  for (let i = 0; i < GIFT_BADGE_NAMES.length; i += 1) {
    if (new RegExp('\\b' + GIFT_BADGE_NAMES[i].toLowerCase() + '\\b').test(text)) {
      return GIFT_BADGE_NAMES[i];
    }
  }
  const match = text.match(/(?:gift(?:ing)?(?:[_ -]?badge)?|level|lvl)[_ -]?([1-6])/);
  return match ? GIFT_BADGE_NAMES[Number(match[1]) - 1] : '';
}

function profileBadgeLabel(entry) {
  if (!entry) return '';
  const rawId = typeof entry === 'object' ? (entry.id || '') : String(entry);
  const id = String(rawId).toLowerCase();
  const description = typeof entry === 'object' ? String(entry.description || '') : '';

  if (PROFILE_BADGE_LABELS[id]) return PROFILE_BADGE_LABELS[id];

  const activity = activityBadgeLabel(id, description);
  if (activity) return activity;

  if (isGiftBadgeId(id, description)) {
    return giftBadgeLabel(id, description) || 'Patron';
  }

  if (id.indexOf('guild_booster') !== -1 || id.indexOf('boost') !== -1) {
    const match = id.match(/(?:lvl|level|tier)[_ -]?(\d+)/) || id.match(/(\d+)$/);
    let level = match ? Number(match[1]) : 1;
    if (!isFinite(level) || level < 1) level = 1;
    if (level > 9) level = 9;
    return 'Boost Level ' + level;
  }

  // `legacy_username` is a real profile badge but has no entry in the admin
  // badge catalogue, so it is skipped rather than drawn as a bare label.
  return '';
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

function mapDiscordUser(user, profileData) {
  // `flags` is the private set Discord returns to the account itself and
  // `public_flags` is the smaller public set. Either can be missing or zero, so
  // merge both instead of preferring one; otherwise a private badge (or any
  // badge when public_flags is 0) disappears from the preview.
  const privateFlags = Number(user.flags) || 0;
  const publicFlags = Number(user.public_flags) || 0;
  const profile = profileData && typeof profileData === 'object' ? profileData : null;
  const profileUser = profile && profile.user && typeof profile.user === 'object' ? profile.user : null;
  // The profile endpoint repeats the user object. Fold its flag bits in too:
  // some token types omit them from /users/@me even though the profile has them.
  const flags = privateFlags | publicFlags
    | (Number(profileUser && profileUser.flags) || 0)
    | (Number(profileUser && profileUser.public_flags) || 0);
  const badges = decodeFlags(flags);
  const seen = {};
  badges.forEach(function (label) { seen[label] = true; });

  function addBadge(label) {
    if (!label || seen[label]) return;
    seen[label] = true;
    badges.push(label);
  }

  let nitroFromProfile = false;
  if (profile && Array.isArray(profile.badges)) {
    profile.badges.forEach(function (entry) {
      const label = profileBadgeLabel(entry);
      if (label === 'Nitro') {
        nitroFromProfile = true;
      } else if (label) {
        addBadge(label);
      }
    });
  }

  const premiumType = Number(user.premium_type)
    || Number(profile && profile.premium_type)
    || Number(profileUser && profileUser.premium_type)
    || 0;
  const nitroTier = PREMIUM_TIERS[premiumType] || 'Unknown';
  // Nitro is not a flag bit, so add the matching badge from premium_type. Keep
  // the union free of duplicates in case Discord ever reports both. An
  // unrecognised tier must not become an "Unknown" badge in the table.
  if (premiumType > 0 && nitroTier !== 'Unknown') {
    addBadge(nitroTier);
  } else if (nitroFromProfile) {
    // The profile can still report Nitro when premium_type is absent.
    addBadge('Nitro');
  }

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
    premiumType: premiumType,
    nitroTier: nitroTier,
    // Filled in best-effort by fetchNitroEnd(); an unavailable end date stays
    // empty rather than being guessed from the tier or account age.
    nitroEnds: '',
    badges: badges,
    // False means the profile call failed (or returned no badge list), so only
    // the flag badges above are present. The admin preview uses this to say the
    // list may be incomplete instead of silently presenting it as the whole set.
    badgesComplete: !!(profile && Array.isArray(profile.badges)),
    decorations: decorations,
    avatar: user.avatar || '',
    avatarUrl: discordAvatarUrl(user),
    publicFlags: publicFlags,
    privateFlags: privateFlags
  };
}

// One place for the Discord call so the profile preview and the save path can
// never disagree about which account a token belongs to.
function normalizeDiscordToken(raw) {
  let token = String(raw || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\u2060]+/g, '');
  if (token.toLowerCase().indexOf('bot ') === 0) {
    token = token.slice(4).trim();
  }
  if (token.toLowerCase().indexOf('bearer ') === 0) {
    token = token.slice(7).trim();
  }
  return token;
}

function discordSuperProperties() {
  return Buffer.from(JSON.stringify({
    os: 'Windows',
    browser: 'Chrome',
    device: '',
    system_locale: 'en-US',
    browser_user_agent: DISCORD_USER_AGENT,
    browser_version: '131.0.0.0',
    os_version: '10',
    referrer: '',
    referring_domain: '',
    referrer_current: '',
    referring_domain_current: '',
    release_channel: 'stable',
    client_build_number: DISCORD_CLIENT_BUILD_NUMBER,
    client_event_source: null
  })).toString('base64');
}

function discordHeaders(token) {
  // Mirror the browser client used by the tool. Discord is stricter about
  // user-token requests that look like bare server-side traffic and can answer
  // a valid token with 401 when the client headers are missing.
  return {
    Authorization: token,
    'User-Agent': DISCORD_USER_AGENT,
    'X-Super-Properties': discordSuperProperties(),
    'X-Discord-Locale': 'en-US',
    'X-Debug-Options': 'bugReporterEnabled',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9'
  };
}

async function fetchDiscordUser(rawToken) {
  if (typeof fetch !== 'function') {
    const err = new Error('Fetch API not available in this runtime.');
    err.status = 502;
    throw err;
  }

  const token = normalizeDiscordToken(rawToken);
  if (!token) {
    const err = new Error('Discord token is required.');
    err.status = 400;
    throw err;
  }

  const request = async function (auth) {
    const response = await fetch(DISCORD_API + '/users/@me', {
      method: 'GET',
      headers: discordHeaders(auth)
    });
    const body = await response.text();
    return { response: response, body: body };
  };

  let result;
  try {
    result = await request(token);
  } catch (e) {
    const err = new Error('Could not reach the Discord API. Check your network and try again.');
    err.status = 502;
    err.detail = (e && e.message) || null;
    throw err;
  }

  // Some saved credentials are OAuth2 bearer tokens rather than user tokens.
  // Retry once with the scheme Discord expects for those before declaring the
  // token invalid. A real user token already succeeded on the first call.
  if (result.response.status === 401) {
    try {
      const bearer = await request('Bearer ' + token);
      if (bearer.response.ok) result = bearer;
    } catch (e) {
      // Keep the original 401; the network failure is not the useful error.
    }
  }

  const response = result.response;
  const raw = result.body;
  if (!response.ok) {
    let message = 'Discord rejected the token.';
    if (response.status === 401) {
      message = 'Invalid or expired token. Check that you pasted the full token, without quotes or hidden characters.';
    } else if (response.status === 403) {
      message = 'Discord blocked this token. It may have been flagged or the account requires verification.';
    } else if (response.status === 429) {
      message = 'Discord is rate-limiting requests right now. Wait a moment and try again.';
    }
    const err = new Error(message);
    err.status = response.status === 429 ? 429 : (response.status === 401 || response.status === 403 ? 400 : 502);
    err.discordStatus = response.status;
    err.detail = String(raw || '').slice(0, 200);
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

function parseDiscordDate(value) {
  if (value === undefined || value === null || value === '') return null;
  let date;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    if (!isFinite(n) || n <= 0) return null;
    date = new Date(n < 1000000000000 ? n * 1000 : n);
  } else {
    date = new Date(String(value));
  }
  return isNaN(date.getTime()) ? null : date;
}

// A subscription can expose its end on the subscription itself or on each
// item. Take the earliest real date so a multi-item plan shows when the first
// paid period actually ends.
function subscriptionEndDate(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const direct = parseDiscordDate(sub.current_period_end || sub.expires_at);
  if (direct) return direct;
  const items = Array.isArray(sub.items) ? sub.items : [];
  const dates = items.map(function (item) {
    return parseDiscordDate(item && (item.current_period_end || item.expires_at));
  }).filter(function (date) { return !!date; });
  if (!dates.length) return null;
  dates.sort(function (left, right) { return left.getTime() - right.getTime(); });
  return dates[0];
}

// Best-effort request for additional account data. A failure here must never
// turn a valid token into an error, because the profile call already succeeded.
// The status is kept so callers can retry an OAuth bearer once, and so the UI
// can tell "no badges" apart from "the badge list could not be read".
async function discordGetJsonResult(token, path, timeoutMs) {
  if (typeof fetch !== 'function') return { status: 0, data: null };
  let timer = null;
  let controller = null;
  if (typeof AbortController === 'function') {
    controller = new AbortController();
    timer = setTimeout(function () {
      try { controller.abort(); } catch (e) {}
    }, timeoutMs || 8000);
  }
  try {
    const response = await fetch(DISCORD_API + path, {
      method: 'GET',
      headers: discordHeaders(token),
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) return { status: response.status, data: null };
    const text = await response.text();
    try {
      return { status: response.status, data: JSON.parse(text) };
    } catch (e) {
      return { status: response.status, data: null };
    }
  } catch (e) {
    return { status: 0, data: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function discordGetJson(token, path, timeoutMs) {
  const result = await discordGetJsonResult(token, path, timeoutMs);
  return result.data;
}

// The profile endpoint is where the real badge list lives. It can fail without
// invalidating the token, so a null result is allowed and only means the
// preview falls back to the flag bits from /users/@me.
async function fetchDiscordProfile(rawToken, userId) {
  const token = normalizeDiscordToken(rawToken);
  const id = String(userId || '').trim();
  if (!token || !id) return null;
  const path = '/users/' + encodeURIComponent(id) + '/profile';
  let result = await discordGetJsonResult(token, path);
  // Same OAuth2 fallback as fetchDiscordUser: a bearer token succeeds on the
  // second attempt even when the raw token was rejected.
  if (result.status === 401) {
    result = await discordGetJsonResult('Bearer ' + token, path);
  }
  return result.data;
}

// Nitro's expiry is not part of /users/@me. Discord exposes it through the
// billing subscriptions endpoint, so read the active Nitro subscription and
// return its end as YYYY-MM-DD. Anything Discord does not expose stays blank.
async function fetchNitroEnd(rawToken) {
  const token = normalizeDiscordToken(rawToken);
  if (!token) return '';
  const data = await discordGetJson(token, '/users/@me/billing/subscriptions');
  const subscriptions = Array.isArray(data)
    ? data
    : ((data && (data.subscriptions || data.items)) || []);
  if (!Array.isArray(subscriptions) || !subscriptions.length) return '';

  const now = Date.now();
  const live = subscriptions.filter(function (sub) {
    if (!sub || typeof sub !== 'object') return false;
    const status = String(sub.status === undefined || sub.status === null ? '' : sub.status).toLowerCase();
    if (status === '4' || status === 'ended' || status === 'expired' || status === 'inactive') {
      return false;
    }
    const end = subscriptionEndDate(sub);
    return end ? end.getTime() > now : true;
  });

  // 1 / 5 / 15 are the Nitro subscription types used by the Discord client
  // (including the legacy and basic plans). A boost-only subscription is not
  // Nitro and must not supply the end date.
  const nitro = live.filter(function (sub) {
    return [1, 5, 15].indexOf(Number(sub.type)) !== -1;
  });
  if (!nitro.length) return '';

  const dated = nitro.map(function (sub) {
    return { sub: sub, end: subscriptionEndDate(sub) };
  }).filter(function (entry) { return !!entry.end; });
  if (!dated.length) return '';
  dated.sort(function (left, right) { return left.end.getTime() - right.end.getTime(); });
  return dated[0].end.toISOString().slice(0, 10);
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
  const token = normalizeDiscordToken(body.token);
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

  // `/users/@me` alone does not carry the profile badge list. Read it here too,
  // so the summary form's badge field matches what the account actually shows.
  const discordProfile = await fetchDiscordProfile(token, user.id);

  return json(res, 200, {
    success: true,
    data: mapDiscordUser(user, discordProfile)
  });
}

async function opTokenAdd(req, res) {
  if (!authGuard(req, res)) return;
  if (!ownerGuard(req, res)) return;

  const body = await readBody(req);
  const token = normalizeDiscordToken(body.token);
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

  // The profile preview and the saved row should show the same badges and
  // Nitro expiry. Fetch the full profile badge list and the billing end in
  // parallel so a save is not slower than the preview.
  //
  // Reuse the date the preview already resolved so saving does not make a
  // second billing request (and cannot lose the date to a rate limit). A direct
  // API caller that sends no date gets a fresh best-effort lookup.
  const suppliedNitroEnd = String(body.nitroEnds || '').trim();
  const suppliedNitroTs = Date.parse(suppliedNitroEnd + 'T00:00:00Z');
  const suppliedNitroValid = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(suppliedNitroEnd)
    && !isNaN(suppliedNitroTs)
    && new Date(suppliedNitroTs).toISOString().slice(0, 10) === suppliedNitroEnd;
  const [discordProfile, resolvedNitroEnd] = await Promise.all([
    fetchDiscordProfile(token, user.id),
    suppliedNitroValid ? Promise.resolve(suppliedNitroEnd) : fetchNitroEnd(token)
  ]);

  const profile = mapDiscordUser(user, discordProfile);
  if (!profile.discordId) {
    return json(res, 502, { success: false, error: 'Discord did not return an account ID for this token.' });
  }
  profile.nitroEnds = resolvedNitroEnd;

  // The preview call is deliberately read-only: the admin can look at what the
  // token resolves to before anything is written.
  if (body.previewOnly) {
    return json(res, 200, { success: true, preview: true, data: profile });
  }

  // Optional sale data entered alongside the token. Existing accounts keep
  // their saved prices and buyer, so these values only apply to new rows.
  const buyRaw = body.buyPrice;
  let buyPrice = null;
  if (buyRaw !== undefined && buyRaw !== null && String(buyRaw).trim() !== '') {
    buyPrice = Number(buyRaw);
    if (!isFinite(buyPrice) || buyPrice < 0) {
      return json(res, 400, { success: false, error: 'Spent price must be a valid non-negative number.' });
    }
  }
  const sellRaw = body.sellPrice;
  let sellPrice = null;
  if (sellRaw !== undefined && sellRaw !== null && String(sellRaw).trim() !== '') {
    sellPrice = Number(sellRaw);
    if (!isFinite(sellPrice) || sellPrice < 0) {
      return json(res, 400, { success: false, error: 'Sold price must be a valid non-negative number.' });
    }
  }
  const requestedStatus = String(body.status || 'AVAILABLE').toUpperCase();
  if (requestedStatus !== 'AVAILABLE' && requestedStatus !== 'SOLD') {
    return json(res, 400, { success: false, error: 'Status must be AVAILABLE or SOLD.' });
  }
  const buyerName = String(body.buyerName || '').trim();
  if (buyerName.length > 120) {
    return json(res, 400, { success: false, error: 'Buyer name is too long (max 120 characters).' });
  }
  const buyerTelegram = String(body.buyerTelegram || '').trim();
  if (buyerTelegram.length > 200) {
    return json(res, 400, { success: false, error: 'Buyer telegram reference is too long (max 200 characters).' });
  }
  // Where the account came from (the seller). It is not sale data: a filled
  // value updates an existing row too, while an empty one leaves the saved
  // source untouched.
  const source = String(body.source || '').trim();
  if (source.length > 300) {
    return json(res, 400, { success: false, error: 'Source is too long (max 300 characters).' });
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
  // An unavailable end date must not blank a date the operator already saved
  // by hand, so only send the column when Discord actually reported one.
  if (profile.nitroEnds) profileFields.nitro_ends = profile.nitroEnds;

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
    // A failed profile call only yields flag badges. Do not replace a saved
    // badge list with that partial set; the next successful refresh updates it.
    if (!profile.badgesComplete) delete patch.badges;
    // Source is purchase provenance, not sale data, so a newly entered seller
    // is useful on a refresh. Leaving the field empty keeps the saved value.
    if (source) patch.source = source;
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
    // A token-added account has no purchase or sale price unless the operator
    // entered one before saving. The columns are nullable after
    // sql/quick_add_and_discord_token.sql, so empty money fields stay empty
    // instead of reading as a misleading 0.
    buy_price: buyPrice,
    sell_price: sellPrice,
    status: requestedStatus,
    sold_at: requestedStatus === 'SOLD' ? new Date().toISOString() : null,
    status_label: '',
    source: source,
    notes: '',
    buyer_name: buyerName,
    buyer_telegram: buyerTelegram,
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

  const saved = (inserted && inserted[0]) || row;
  // A token-added account can carry a spent price or a sale on its very first
  // render, so reconcile the ledger exactly like the create and update paths.
  // Idempotent, and a missing money table never fails the account save.
  const money = await syncAccountMoney(saved, {});
  return json(res, 200, {
    success: true,
    created: true,
    data: publicAccount(saved),
    money: { synced: !!money.ok, reason: money.reason || null }
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