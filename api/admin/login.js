const { adminSecret, signToken, setCors } = require('../lib/utils');

module.exports = function (req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }
  if (!adminSecret()) {
    return res.status(500).json({ ok: false, message: 'ADMIN_SECRET is not configured on the server.' });
  }
  const body = req.body || {};
  const password = String(body.password || '');
  if (password !== adminSecret()) {
    return res.status(401).json({ ok: false, message: 'Invalid password.' });
  }
  const ttlMs = 12 * 60 * 60 * 1000;
  return res.json({ ok: true, token: signToken(ttlMs), expiresIn: ttlMs });
};