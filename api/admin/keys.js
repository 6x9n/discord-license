'use strict';

const crypto = require('crypto');
const { hashKey, rest, json, handleOptions, isAuthorized } = require('../_lib/supabase.js');

async function readBody(request) {
  const text = await request.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

function randSegment(n) {
  let out = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < n; i++) {
    out += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return out;
}

function generateKey() {
  const seg = function (n) { return randSegment(n); };
  return ['DMT', seg(6), seg(6), seg(6), seg(6)].join('-');
}

module.exports = async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  if (!isAuthorized(request)) {
    return json(request, 401, { success: false, error: 'Unauthorized' });
  }

  if (request.method === 'GET') {
    let rows;
    try {
      rows = await rest('license_keys?order=created_at.desc', {});
    } catch (err) {
      return json(request, 500, { success: false, error: 'Failed to list keys.' });
    }

    let acts = [];
    try {
      acts = await rest('license_activations?select=license_id,id', {}) || [];
    } catch (e) {
      acts = [];
    }

    const counts = {};
    acts.forEach(function (a) {
      const lid = a.license_id;
      counts[lid] = (counts[lid] || 0) + 1;
    });

    const rowsOut = (rows || []).map(function (r) {
      const copy = Object.assign({}, r);
      copy.activationCount = counts[r.id] || 0;
      return copy;
    });

    return json(request, 200, { success: true, data: rowsOut });
  }

  if (request.method === 'POST') {
    const body = await readBody(request);
    const label = String(body.label || '').trim() || 'Standard';
    const expiresIso = body.expires_at ? String(body.expires_at) : null;
    const maxActivations = parseInt(body.max_activations, 10);
    const activatedAt = new Date().toISOString();
    const plain = generateKey();
    const payload = {
      key_hash: hashKey(plain),
      plain_key: plain,
      label: label,
      expires_at: expiresIso,
      max_activations: isNaN(maxActivations) || maxActivations < 1 ? 1 : maxActivations,
      revoked: false,
      created_at: activatedAt
    };
    try {
      const inserted = await rest('license_keys', { method: 'POST', body: payload });
      const row = inserted && inserted[0] ? inserted[0] : payload;
      return json(request, 200, {
        success: true,
        data: {
          id: row.id,
          key: plain,
          key_hash: row.key_hash,
          label: row.label,
          expires_at: row.expires_at,
          max_activations: row.max_activations,
          revoked: row.revoked,
          created_at: row.created_at
        }
      });
    } catch (err) {
      return json(request, 500, { success: false, error: 'Failed to create key.' });
    }
  }

  return json(request, 405, { success: false, error: 'Method not allowed' });
}