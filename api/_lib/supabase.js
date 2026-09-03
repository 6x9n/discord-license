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

function getBearer(req) {
  const h = (req && req.headers && req.headers.authorization) || '';
  return h.replace(/^Bearer\s+/i, '');
}

function isAuthorized(req) {
  if (!adminSecret) {
    return { ok: false, error: 'Server not configured. Missing LICENSE_ADMIN_SECRET environment variable.' };
  }
  if (getBearer(req) !== adminSecret) {
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: true };
}

// Read the request body as a parsed JSON object (Node http.IncomingMessage style).
function readBody(req) {
  return new Promise(function (resolve) {
    let data = '';
    req.on('data', function (chunk) {
      data += chunk;
    });
    req.on('end', function () {
      if (!data) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', function () {
      resolve({});
    });
  });
}

// Write a JSON response using the Node http.ServerResponse.
function json(res, status, body) {
  const payload = JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  res.writeHead(status, headers);
  res.end(payload);
}

function handleOptions(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end();
}

const NOT_CONFIGURED_MESSAGE = (function () {
  const missing = [];
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!adminSecret) missing.push('LICENSE_ADMIN_SECRET');
  if (!missing.length) return null;
  return 'Server not configured. Missing environment variable' + (missing.length > 1 ? 's: ' : ': ') + missing.join(', ') + '. Set these in the Vercel project settings and redeploy.';
})();

async function rest(path, options) {
  if (!SERVICE_KEY) {
    const err = new Error(NOT_CONFIGURED_MESSAGE || 'Service key not configured.');
    err.status = 503;
    err.configError = true;
    throw err;
  }
  const opts = options || {};
  const reqOpts = {
    method: opts.method || 'GET',
    headers: Object.assign({
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    }, opts.headers || {})
  };
  if (opts.body !== undefined) {
    reqOpts.body = JSON.stringify(opts.body);
  }

  let res;
  let bodyText;
  try {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API not available in this runtime.');
    }
    res = await fetch(restBase + path, reqOpts);
    bodyText = await res.text();
  } catch (e) {
    const err = new Error((e && e.message === 'Fetch API not available in this runtime.') ? e.message : 'Unable to reach Supabase. Check SUPABASE_URL.');
    err.status = 502;
    err.detail = e && e.message;
    throw err;
  }

  let data = null;
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      data = bodyText;
    }
  }

  if (!res.ok) {
    const pgrstMessage = (bodyText && typeof bodyText === 'string') ? bodyText : null;
    const message = pgrstMessage && pgrstMessage.length < 300 ? pgrstMessage : ('Supabase error ' + res.status);
    const err = new Error(message);
    err.status = res.status;
    err.detail = data;
    err.code = (data && data.code) ? data.code : null;
    throw err;
  }
  return data;
}

module.exports = {
  normalizeKey: normalizeKey,
  hashKey: hashKey,
  parseIso: parseIso,
  configState: configState,
  isAuthorized: isAuthorized,
  readBody: readBody,
  json: json,
  handleOptions: handleOptions,
  rest: rest
};