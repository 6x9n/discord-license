const crypto = require('crypto');

const DAY_MS = 86400000;
const LIFETIME_MS = 4102444800000;

function adminSecret() {
  return process.env.ADMIN_SECRET || '';
}

function signToken(ttlMs) {
  const secret = adminSecret();
  const exp = Date.now() + ttlMs;
  const data = 'dmt-admin:' + exp;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return exp + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    return false;
  }
  const secret = adminSecret();
  if (!secret) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update('dmt-admin:' + exp).digest('hex');
  const supplied = parts[1];
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function getBearer(req) {
  const headers = req.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : null;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function genKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = function () {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += alphabet[crypto.randomInt(alphabet.length)];
    }
    return s;
  };
  return block() + '-' + block() + '-' + block() + '-' + block();
}

function planForDays(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) {
    return { plan: 'Lifetime', durationDays: 0 };
  }
  if (d >= 365) {
    return { plan: 'Yearly', durationDays: 365 };
  }
  if (d >= 90) {
    return { plan: 'Quarterly', durationDays: 90 };
  }
  if (d >= 30) {
    return { plan: 'Monthly', durationDays: 30 };
  }
  return { plan: 'Trial', durationDays: 1 };
}

function expiresFor(createdAt, durationDays) {
  if (!durationDays) {
    return LIFETIME_MS;
  }
  return createdAt + durationDays * DAY_MS;
}

module.exports = {
  DAY_MS,
  LIFETIME_MS,
  adminSecret,
  signToken,
  verifyToken,
  getBearer,
  setCors,
  genKey,
  planForDays,
  expiresFor
};