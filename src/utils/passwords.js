const bcrypt = require('bcrypt');

const ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS || 12);

async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length < 6) {
    throw new Error('Password too short');
  }
  return bcrypt.hash(plain, ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
