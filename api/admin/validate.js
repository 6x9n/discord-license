'use strict';

const { json, handleOptions, isAuthorized } = require('../_lib/supabase.js');

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

module.exports = async function handler(request) {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }
  if (request.method !== 'POST') {
    return json(request, 405, { success: false, error: 'Method not allowed' });
  }

  const body = await readBody(request);
  const secret = String(body.secret || '').trim();
  const adminSecret = process.env.LICENSE_ADMIN_SECRET || '';

  if (!adminSecret || secret !== adminSecret) {
    return json(request, 401, { success: false, error: 'Access denied.' });
  }

  return json(request, 200, { success: true, data: { role: 'admin' } });
}