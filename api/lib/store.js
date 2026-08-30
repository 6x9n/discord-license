const fs = require('fs');
const path = require('path');

const REDIS_KEY = 'dmt:keys:v1';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function filePath() {
  return path.join(process.cwd(), 'data', 'keys.json');
}

function useRedis() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function readFileKeys() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function writeFileKeys(arr) {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(arr, null, 2), 'utf8');
}

async function readRedisKeys() {
  try {
    const res = await fetch(REDIS_URL + '/get/' + REDIS_KEY, {
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN }
    });
    const data = await res.json();
    const raw = data && data.result;
    if (raw == null) {
      return null;
    }
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function writeRedisKeys(arr) {
  const res = await fetch(REDIS_URL + '/set/' + REDIS_KEY + '/' + encodeURIComponent(JSON.stringify(arr)), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REDIS_TOKEN,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error('Redis write failed: ' + res.status);
  }
}

async function readKeys() {
  if (useRedis()) {
    const cached = await readRedisKeys();
    if (cached !== null) {
      return cached;
    }
    return [];
  }
  return readFileKeys();
}

async function writeKeys(arr) {
  if (useRedis()) {
    await writeRedisKeys(arr);
    return;
  }
  writeFileKeys(arr);
}

module.exports = { readKeys, writeKeys, useRedis };