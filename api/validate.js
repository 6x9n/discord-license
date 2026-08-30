const { readKeys } = require('./lib/store');
const { setCors } = require('./lib/utils');

module.exports = async function (req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, message: 'Method not allowed.' });
  }
  const body = req.body || {};
  const input = String(body.key || '').trim();
  if (!input) {
    return res.status(400).json({ valid: false, message: 'Missing license key.' });
  }
  const keys = await readKeys();
  const entry = keys.find(function (k) {
    return String(k.key).toUpperCase() === input.toUpperCase();
  });
  if (!entry) {
    return res.json({ valid: false, message: 'Invalid license key.' });
  }
  if (entry.status === 'revoked') {
    return res.json({ valid: false, message: 'This license key has been revoked.' });
  }
  if (entry.expiresAt <= Date.now()) {
    return res.json({ valid: false, message: 'This license key has expired.' });
  }
  return res.json({ valid: true, plan: entry.plan, expiresAt: entry.expiresAt });
};