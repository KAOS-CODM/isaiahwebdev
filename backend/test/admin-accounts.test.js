const test = require('node:test');
const assert = require('node:assert');

const accounts = require('../src/lib/admin-accounts.js');
const { parsePasswordHash } = require('../src/lib/admin-auth.js');
const { HttpError } = require('../src/lib/errors.js');

/**
 * Unit tests for the database-backed administrator store. The in-memory double
 * enforces the same `_id` uniqueness guarantee MongoDB provides, so the atomic
 * single-administrator behaviour can be verified without a live database.
 */

function createMockDb() {
  const docs = [];
  const collection = {
    async findOne(filter) {
      const found = docs.find((doc) => doc._id === filter._id);
      return found ? { ...found } : null;
    },
    async insertOne(doc) {
      if (docs.some((existing) => existing._id === doc._id)) {
        const err = new Error('E11000 duplicate key error collection: admins');
        err.code = 11000;
        throw err;
      }
      docs.push({ ...doc });
      return { insertedId: doc._id };
    },
  };
  return {
    collection(name) {
      assert.strictEqual(name, 'admins');
      return collection;
    },
    docs,
  };
}

const GOOD = { username: 'owner', password: 'a-very-strong-password' };

test('isSetupRequired reflects whether an administrator exists', async () => {
  const db = createMockDb();
  assert.strictEqual(await accounts.isSetupRequired(db), true);

  await accounts.createInitialAdmin(db, GOOD);
  assert.strictEqual(await accounts.isSetupRequired(db), false);
});

test('createInitialAdmin stores a scrypt hash and a signing secret, never the password', async () => {
  const db = createMockDb();
  const admin = await accounts.createInitialAdmin(db, GOOD);

  assert.strictEqual(admin._id, 'admin');
  assert.strictEqual(admin.username, 'owner');
  assert.ok(parsePasswordHash(admin.passwordHash), 'stored hash must parse as scrypt');
  assert.ok(!JSON.stringify(admin).includes(GOOD.password), 'plaintext must not be stored');
  assert.strictEqual(typeof admin.tokenSecret, 'string');
  assert.ok(admin.tokenSecret.length >= 32);

  const stored = await accounts.getAdmin(db);
  assert.strictEqual(stored.passwordHash, admin.passwordHash);
});

test('only the first administrator can be created (atomic on the fixed _id)', async () => {
  const db = createMockDb();

  const results = await Promise.allSettled([
    accounts.createInitialAdmin(db, GOOD),
    accounts.createInitialAdmin(db, { username: 'intruder', password: 'another-strong-one' }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.strictEqual(fulfilled.length, 1);
  assert.strictEqual(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof HttpError);
  assert.strictEqual(rejected[0].reason.status, 403);
  assert.strictEqual(rejected[0].reason.code, 'SETUP_CLOSED');
  assert.strictEqual(db.docs.length, 1);

  // A later attempt is also refused.
  await assert.rejects(
    () => accounts.createInitialAdmin(db, GOOD),
    (err) => err instanceof HttpError && err.code === 'SETUP_CLOSED'
  );
});

test('verifyCredentials accepts the right pair and rejects everything else', async () => {
  const db = createMockDb();
  await accounts.createInitialAdmin(db, GOOD);

  assert.ok(await accounts.verifyCredentials(db, 'owner', GOOD.password));
  assert.strictEqual(await accounts.verifyCredentials(db, 'owner', 'wrong-password'), null);
  assert.strictEqual(await accounts.verifyCredentials(db, 'someone-else', GOOD.password), null);
  assert.strictEqual(await accounts.verifyCredentials(db, undefined, GOOD.password), null);
  assert.strictEqual(await accounts.verifyCredentials(db, 'owner', undefined), null);
});

test('verifyCredentials returns null when no administrator exists', async () => {
  const db = createMockDb();
  assert.strictEqual(await accounts.verifyCredentials(db, 'owner', GOOD.password), null);
});

test('validateSetupInput enforces the username and password policy', () => {
  assert.deepStrictEqual(accounts.validateSetupInput({ username: '  owner  ', password: GOOD.password }), {
    username: 'owner',
    password: GOOD.password,
  });

  const cases = [
    ['not an object', 'nope'],
    ['missing username', { password: GOOD.password }],
    ['short username', { username: 'ab', password: GOOD.password }],
    ['invalid username', { username: 'bad name', password: GOOD.password }],
    ['short password', { username: 'owner', password: 'short' }],
    ['non-string password', { username: 'owner', password: 12345678901234 }],
  ];

  for (const [label, payload] of cases) {
    assert.throws(
      () => accounts.validateSetupInput(payload),
      (err) => err instanceof HttpError && err.status === 400 && err.code === 'VALIDATION_ERROR',
      label
    );
  }
});
