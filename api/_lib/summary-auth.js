'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'summary_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days (seconds)

function summaryPassword() {
  return process.env.SUMMARY_PASSWORD || '';
}

// The admin console can now drive the Summary section, so its secret is
// accepted here too. Without this, merging the two dashboards would mean two
// logins in the same page.
function adminSecret() {
  return process.env.LICENSE_ADMIN_SECRET || '';
}

// The session cookie has to be derivable from whichever secret is actually
// configured, otherwise a deployment that only sets LICENSE_ADMIN_SECRET could
// never mint a cookie and every read would 401.
function sessionSecret() {
  return summaryPassword() || adminSecret();
}

function cookieConfigured() {
  return !!sessionSecret();
}

// Constant-time compare against every accepted secret. Returns true if any
// matches, and still touches both operands so the timing does not leak which
// secret was close.
function secretMatches(candidate) {
  const value = Buffer.from(String(candidate === undefined || candidate === null ? '' : candidate));
  const accepted = [summaryPassword(), adminSecret()].filter(Boolean);
  if (!accepted.length) return false;
  let ok = false;
  for (let i = 0; i < accepted.length; i++) {
    const ref = Buffer.from(accepted[i]);
    if (ref.length !== value.length) continue;
    if (crypto.timingSafeEqual(ref, value)) ok = true;
  }
  return ok;
}

// Stateless token derived from the session secret. Changing the env var
// invalidates every existing session without needing a store.
function cookieValue() {
  const pw = sessionSecret();
  if (!pw) return null;
  return crypto.createHmac('sha256', pw).update('summary-auth-v1').digest('base64url');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach(function (part) {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function isAuthed(req) {
  if (!cookieConfigured()) return false;
  const v = cookieValue();
  if (!v) return false;
  const cookies = parseCookies(req && req.headers && req.headers.cookie);
  const got = String(cookies[COOKIE_NAME] || '');
  const a = Buffer.from(got);
  const b = Buffer.from(v);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function setAuthCookie(res) {
  const v = cookieValue();
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + v + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + COOKIE_MAX_AGE);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}

module.exports = {
  COOKIE_NAME: COOKIE_NAME,
  summaryPassword: summaryPassword,
  adminSecret: adminSecret,
  sessionSecret: sessionSecret,
  secretMatches: secretMatches,
  cookieConfigured: cookieConfigured,
  isAuthed: isAuthed,
  setAuthCookie: setAuthCookie,
  clearAuthCookie: clearAuthCookie,
  parseCookies: parseCookies
};