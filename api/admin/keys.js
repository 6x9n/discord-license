const { readKeys, writeKeys } = require('../lib/store');
const { verifyToken, getBearer, setCors, genKey, planForDays, expiresFor } = require('../lib/utils');

module.exports = async function (req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  const token = getBearer(req);
  if (!verifyToken(token)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized. Login to the admin dashboard first.' });
  }

  const keys = await readKeys();

  if (req.method === 'GET') {
    return res.json({
      ok: true,
      keys: keys.slice().sort(function (a, b) {
        return b.createdAt - a.createdAt;
      })
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const days = Number(body.durationDays);
    const note = String(body.note || '').trim();
    let key = String(body.key || '').trim().toUpperCase();
    if (!key) {
      key = genKey();
    }
    if (keys.some(function (k) {
      return k.key === key;
    })) {
      return res.status(409).json({ ok: false, message: 'A key with that value already exists.' });
    }
    const createdAt = Date.now();
    const mapped = planForDays(days);
    const entry = {
      key: key,
      plan: mapped.plan,
      durationDays: mapped.durationDays,
      note: note,
      status: 'active',
      createdAt: createdAt,
      expiresAt: expiresFor(createdAt, mapped.durationDays)
    };
    keys.push(entry);
    await writeKeys(keys);
    return res.status(201).json({ ok: true, key: entry });
  }

  const query = req.query || {};
  const body = req.body || {};
  const keyVal = String(query.key || body.key || '').trim().toUpperCase();

  if (req.method === 'DELETE') {
    if (!keyVal) {
      return res.status(400).json({ ok: false, message: 'Missing key.' });
    }
    const index = keys.findIndex(function (k) {
      return k.key === keyVal;
    });
    if (index === -1) {
      return res.status(404).json({ ok: false, message: 'Key not found.' });
    }
    keys.splice(index, 1);
    await writeKeys(keys);
    return res.json({ ok: true });
  }

  if (req.method === 'PATCH') {
    if (!keyVal) {
      return res.status(400).json({ ok: false, message: 'Missing key.' });
    }
    const entry = keys.find(function (k) {
      return k.key === keyVal;
    });
    if (!entry) {
      return res.status(404).json({ ok: false, message: 'Key not found.' });
    }
    const action = String(body.action || '');
    if (action === 'revoke') {
      entry.status = 'revoked';
    } else if (action === 'extend') {
      const days = Math.max(1, Number(body.days) || 30);
      if (entry.durationDays) {
        entry.expiresAt = Math.max(entry.expiresAt, Date.now()) + days * 86400000;
      }
    } else {
      return res.status(400).json({ ok: false, message: 'Unknown action.' });
    }
    await writeKeys(keys);
    return res.json({ ok: true, key: entry });
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed.' });
};