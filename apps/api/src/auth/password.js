const crypto = require("crypto");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const DUMMY_SALT = Buffer.alloc(16, 7);
const DUMMY_HASH = Buffer.alloc(SCRYPT.keylen, 9);

function scryptAsync(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(String(password), salt, SCRYPT.keylen);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

async function verifyPassword(password, saltHex, hashHex) {
  const salt = saltHex ? Buffer.from(String(saltHex), "hex") : DUMMY_SALT;
  const expected = hashHex ? Buffer.from(String(hashHex), "hex") : DUMMY_HASH;
  let actual;
  try {
    actual = await scryptAsync(String(password ?? ""), salt, SCRYPT.keylen);
  } catch (_err) {
    actual = Buffer.alloc(SCRYPT.keylen);
  }
  const left = actual.length === expected.length ? actual : Buffer.alloc(expected.length);
  const right = expected.length ? expected : Buffer.alloc(left.length);
  const same = left.length === right.length && crypto.timingSafeEqual(left, right);
  return Boolean(saltHex && hashHex) && actual.length === expected.length && same;
}

module.exports = { hashPassword, verifyPassword, SCRYPT };
