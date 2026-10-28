'use strict';

// At-rest encryption for Discord tokens saved from the admin console.
//
// A Discord token is a full session credential, so it is never stored as
// plaintext in Supabase and never returned to the browser by the account list.
// AES-256-GCM gives confidentiality plus tamper detection: a modified
// ciphertext fails to decrypt instead of yielding a corrupted token.
//
// The key comes from TOKEN_ENCRYPTION_KEY when set, otherwise from
// LICENSE_ADMIN_SECRET, which is already server-side only. Rotating either
// makes previously saved tokens undecryptable, so keep it stable.

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function encryptionSecret() {
  return process.env.TOKEN_ENCRYPTION_KEY || process.env.LICENSE_ADMIN_SECRET || '';
}

function key() {
  const secret = encryptionSecret();
  if (!secret) {
    const err = new Error('Token encryption is not configured. Set TOKEN_ENCRYPTION_KEY or LICENSE_ADMIN_SECRET in the Vercel project settings.');
    err.status = 503;
    throw err;
  }
  // Hashing gives the cipher a fixed 32-byte key whatever length the operator
  // used for the secret.
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a token for storage.
 * @returns {{ciphertext: string, iv: string, tag: string}}
 */
function encryptToken(token) {
  const value = String(token || '');
  if (!value) {
    const err = new Error('A Discord token is required.');
    err.status = 400;
    throw err;
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

/**
 * Decrypt a discord_accounts row. Returns '' when the row has no stored token.
 */
function decryptToken(row) {
  const ciphertext = row && row.discord_token_enc;
  const iv = row && row.discord_token_iv;
  const tag = row && row.discord_token_tag;
  if (!ciphertext || !iv || !tag) return '';
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final()
    ]);
    return plain.toString('utf8');
  } catch (e) {
    const err = new Error('The saved Discord token could not be decrypted. The encryption key changed, or the row was edited outside the console.');
    err.status = 422;
    throw err;
  }
}

// Enough to recognise a stored token in the UI without revealing it.
function tokenHint(token) {
  const value = String(token || '');
  return value.length >= 8 ? '...' + value.slice(-4) : '';
}

module.exports = {
  encryptToken: encryptToken,
  decryptToken: decryptToken,
  tokenHint: tokenHint
};
