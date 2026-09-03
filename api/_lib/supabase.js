'use strict';

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cvjctplaotgfkkkzlsqj.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const adminSecret = process.env.LICENSE_ADMIN_SECRET || '';

const restBase = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';

function normalizeKey(raw) {
  return String(raw || '').trim().toUpperCase();
}

function hashKey(key) {
  return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex');
}

function parseIso(iso) {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return isNaN(ms) ? null : ms;
}

function configState() {
  return {
    serviceKeySet: !!SERVICE_KEY,
    adminSecretSet: !!adminSecret
  };
}

function notConfiguredMessage() {
  const st = configState();
  const missing = [];
  if (!st.serviceKeySet) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!st.adminSecretSet) missing.push('LICENSE_ADMIN_SECRET');
  return 'Server not configured. Missing environment variable' + (missing.length > 1 ? 's: ' : ': ') + missing.join(', ') + '. Set these in the Vercel project settings and redeploy.';
}

async function rest(path, options) {
  if (!SERVICE_KEY) {
    const err = new Error(notConfiguredMessage());
    err.status = 503;
    err.configError = true;
    throw err;
  }
  const opts = options || {};
  const req = {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    }, opts.headers || {})
  };
  if (opts.body !== undefined) {
    req.body = JSON.stringify(opts.body);
  }

  let res;
  try {
    res = await fetch(restBase + path, req);
  } catch (e) {
    const err = new Error('Unable to reach Supabase. Check SUPABASE_URL.');
    err.status = 502;
    err.detail = e && e.message;
    throw err;
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }

  if (!res.ok) {
    const err = new Error('Supabase error ' + res.status);
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

function isAuthorized(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!adminSecret) {
    return { ok: false, error: 'Server not configured. Missing LICENSE_ADMIN_SECRET environment variable.' };
  }
  if (token !== adminSecret) {
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: true };
}

function corsHeaders(req, extra) {
  const origin = req.headers.get('origin') || '*';
  return Object.assign({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  }, extra || {});
}

function json(req, status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: corsHeaders(req) });
}

function handleOptions(req) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

module.exports = {
  normalizeKey: normalizeKey,
  hashKey: hashKey,
  parseIso: parseIso,
  rest: rest,
  isAuthorized: isAuthorized,
  corsHeaders: corsHeaders,
  json: json,
  handleOptions: handleOptions
};