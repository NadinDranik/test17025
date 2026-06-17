const bcrypt = require('bcryptjs');

const BCRYPT_PREFIX = '$2';

function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith(BCRYPT_PREFIX);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (isPasswordHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

async function ensurePasswordHash(plainOrHash) {
  if (isPasswordHash(plainOrHash)) return plainOrHash;
  return hashPassword(plainOrHash);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function sanitizeUsers(users) {
  return (users || []).map(sanitizeUser);
}

module.exports = {
  hashPassword,
  verifyPassword,
  ensurePasswordHash,
  isPasswordHash,
  sanitizeUser,
  sanitizeUsers
};
