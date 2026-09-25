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
// Always resolves to a plain object so callers can dereference safely:
//   * JSON.parse('null') / JSON.parse('5') / JSON.parse('"x"') succeed but are
//     not objects, and previously leaked a null/undefined out of here which
//     made `body.key` throw a TypeError and returned a non-JSON 500.
//   * The body is size-capped so a large upload cannot exhaust memory.
const MAX_BODY_BYTES = 64 * 1024;

function readBody(req) {
  return new Promise(function (resolve) {
    let data = '';
    let size = 0;
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }
    if (!req || typeof req.on !== 'function') {
      // Not a Node IncomingMessage (e.g. an edge runtime or a rewritten
      // invocation). Degrade to an empty object instead of throwing.
      return finish({});
    }
    req.on('data', function (chunk) {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        return finish({});
      }
      data += chunk;
    });
    req.on('end', function () {
      if (settled) return;
      if (!data) {
        return finish({});
      }
      try {
        const parsed = JSON.parse(data);
        finish(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch (e) {
        finish({});
      }
    });
    req.on('error', function () {
      finish({});
    });
    req.on('aborted', function () {
      finish({});
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

// Build the "not configured" message once. Only the service key matters for the
// public license endpoints, so never name LICENSE_ADMIN_SECRET here: this text
// is returned verbatim to anonymous callers on the activation screen.
const NOT_CONFIGURED_MESSAGE = (function () {
  if (SERVICE_KEY) return null;
  return 'Server not configured. Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Set it in the Vercel project settings and redeploy.';
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
  let timer = null;
  try {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API not available in this runtime.');
    }
    const joinPath = (String(path).charAt(0) === '/') ? String(path) : '/' + path;
    // Abort hung Supabase calls. Without this a stalled request blocks the
    // function until the platform limit and the client promise never settles.
    if (typeof AbortController === 'function') {
      const controller = new AbortController();
      reqOpts.signal = controller.signal;
      const timeoutMs = opts.timeoutMs || 12000;
      timer = setTimeout(function () {
        try { controller.abort(); } catch (e) {}
      }, timeoutMs);
    }
    res = await fetch(restBase + joinPath, reqOpts);
    bodyText = await res.text();
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    const err = new Error(aborted
      ? 'Supabase request timed out. Retry in a moment.'
      : ((e && e.message === 'Fetch API not available in this runtime.') ? e.message : 'Unable to reach Supabase. Check SUPABASE_URL.'));
    // 504 here is a client-side timeout, not a database problem, so the
    // generic "check SUPABASE_URL" wording would misdirect the user.
    err.status = aborted ? 504 : 502;
    err.detail = e && e.message;
    throw err;
  } finally {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
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
    const pgrstMessage = (bodyText && typeof bodyText === 'string' && bodyText.trim()) ? bodyText.trim() : null;
    const statusGuide = {
      522: 'Supabase is unreachable (HTTP 522) - the database looks paused or is restarting. Open supabase.com/dashboard, restore or restart the project, and retry.',
      503: 'Supabase is temporarily unavailable (HTTP 503). Wait a moment and retry.',
      504: 'Supabase timed out (HTTP 504) - the database may be paused. Restore it in the Supabase dashboard and retry.'
    };
    const message = statusGuide[res.status]
      || ((pgrstMessage && pgrstMessage.length < 300) ? pgrstMessage : ('Supabase error ' + res.status));
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