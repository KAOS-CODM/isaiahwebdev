const test = require('node:test');
const assert = require('node:assert');

const auth = require('../src/lib/admin-auth.js');
const { createRateLimiter } = require('../src/lib/rate-limit.js');
const {
  validateProjectInput,
  deriveSlug,
  buildProjectDoc,
} = require('../src/lib/admin-projects.js');
const { loadProjectSchema } = require('../src/lib/project-schema.js');
const { HttpError } = require('../src/lib/errors.js');

const schemaPromise = loadProjectSchema();

/**
 * Unit tests for the admin authentication primitives, the login rate limiter and
 * project-payload validation. No HTTP, no database, no real secrets.
 */

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

test('hashPassword/verifyPassword round-trips and rejects the wrong password', () => {
  const hash = auth.hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('scrypt$'));
  assert.strictEqual(auth.verifyPassword('correct horse battery staple', hash), true);
  assert.strictEqual(auth.verifyPassword('wrong password', hash), false);
  assert.strictEqual(auth.verifyPassword('', hash), false);
  assert.strictEqual(auth.verifyPassword('x', 'not-a-valid-hash'), false);
  assert.strictEqual(auth.verifyPassword('x', undefined), false);
});

test('parsePasswordHash rejects malformed values', () => {
  assert.strictEqual(auth.parsePasswordHash(''), null);
  assert.strictEqual(auth.parsePasswordHash('bcrypt$x'), null);
  assert.strictEqual(auth.parsePasswordHash('scrypt$1$2$3'), null);
  assert.strictEqual(auth.parsePasswordHash('scrypt$0$8$1$AAAA$BBBB'), null);
  assert.ok(auth.parsePasswordHash(auth.hashPassword('abc')));
});

// ---------------------------------------------------------------------------
// Token signing/verification (secret is supplied by the caller / database)
// ---------------------------------------------------------------------------

const TEST_SECRET = 'unit-test-signing-secret-not-a-real-one';

test('signToken/verifyToken round-trips and reports expiry', () => {
  const now = Date.now();
  const token = auth.signToken(TEST_SECRET, now);
  const result = auth.verifyToken(TEST_SECRET, token, now + 1000);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.payload.sub, 'admin');
  assert.ok(result.payload.exp > result.payload.iat);

  // One second before expiry is still valid; exactly at expiry is not.
  const justValid = auth.verifyToken(TEST_SECRET, token, (result.payload.exp - 1) * 1000);
  assert.strictEqual(justValid.ok, true);
  const expired = auth.verifyToken(TEST_SECRET, token, result.payload.exp * 1000);
  assert.deepStrictEqual(expired, { ok: false, reason: 'expired' });
});

test('verifyToken rejects tampered, malformed and wrong-secret tokens', () => {
  const token = auth.signToken(TEST_SECRET, Date.now());
  const tamperedBody = `x${token.slice(1)}`;
  assert.deepStrictEqual(auth.verifyToken(TEST_SECRET, tamperedBody), { ok: false, reason: 'invalid' });

  const [body, sig] = token.split('.');
  const tamperedSig = `${body}.${sig.slice(0, -2)}AA`;
  assert.deepStrictEqual(auth.verifyToken(TEST_SECRET, tamperedSig), { ok: false, reason: 'invalid' });

  assert.strictEqual(auth.verifyToken(TEST_SECRET, 'no-dot').ok, false);
  assert.strictEqual(auth.verifyToken(TEST_SECRET, 'a.b.c').ok, false);
  assert.strictEqual(auth.verifyToken(TEST_SECRET, '').ok, false);
  assert.strictEqual(auth.verifyToken(TEST_SECRET, null).ok, false);

  assert.deepStrictEqual(auth.verifyToken('a-different-secret', token), {
    ok: false,
    reason: 'invalid',
  });
});

test('signToken returns null without a secret and generateTokenSecret is random', () => {
  assert.strictEqual(auth.signToken('', Date.now()), null);
  assert.strictEqual(auth.signToken(undefined, Date.now()), null);

  const first = auth.generateTokenSecret();
  const second = auth.generateTokenSecret();
  assert.strictEqual(typeof first, 'string');
  assert.ok(first.length >= 32);
  assert.notStrictEqual(first, second);
});

test('isLoopbackAddress recognises loopback addresses only', () => {
  for (const address of ['127.0.0.1', '127.0.0.53', '::1', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1']) {
    assert.strictEqual(auth.isLoopbackAddress(address), true, address);
  }
  for (const address of [
    '10.0.0.5',
    '192.168.1.20',
    '8.8.8.8',
    '::ffff:8.8.8.8',
    '256.0.0.1',
    '',
    null,
    undefined,
    'localhost',
  ]) {
    assert.strictEqual(auth.isLoopbackAddress(address), false, String(address));
  }
});

test('extractBearer parses the Authorization header', () => {
  assert.strictEqual(auth.extractBearer('Bearer abc.def'), 'abc.def');
  assert.strictEqual(auth.extractBearer('bearer   spaced'), 'spaced');
  assert.strictEqual(auth.extractBearer('Basic abc'), null);
  assert.strictEqual(auth.extractBearer('abc.def'), null);
  assert.strictEqual(auth.extractBearer(undefined), null);
});

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

test('createRateLimiter enforces the window and reports retry time', () => {
  let clock = 0;
  const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => clock });

  assert.strictEqual(limiter.check('k').allowed, true);
  limiter.record('k');
  assert.strictEqual(limiter.check('k').allowed, true);
  limiter.record('k');

  const blocked = limiter.check('k');
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.remaining, 0);
  assert.ok(blocked.retryAfterMs > 0);

  // Other keys are unaffected.
  assert.strictEqual(limiter.check('other').allowed, true);

  // Reset clears the key.
  limiter.reset('k');
  assert.strictEqual(limiter.check('k').allowed, true);

  // Window expiry frees attempts.
  limiter.record('k');
  limiter.record('k');
  clock = 1500;
  assert.strictEqual(limiter.check('k').allowed, true);
});

// ---------------------------------------------------------------------------
// Project payload validation
// ---------------------------------------------------------------------------

test('validateProjectInput accepts a valid create payload', async () => {
  const schema = await schemaPromise;
  assert.doesNotThrow(() =>
    validateProjectInput(
      {
        title: 'My Project',
        description: 'desc',
        status: 'draft',
        featured: false,
        order: 3,
        site: 'https://example.com',
        github: 'https://github.com/u/r',
        technologies: ['HTML', 'CSS'],
        images: ['/a.png', { src: '/b.png', alt: 'B' }],
      },
      { partial: false, schema }
    )
  );
});

test('validateProjectInput rejects malformed fields', async () => {
  const schema = await schemaPromise;
  const cases = [
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['bad status', { title: 'x', status: 'live' }],
    ['bad featured', { title: 'x', featured: 'yes' }],
    ['bad order', { title: 'x', order: 'first' }],
    ['bad site', { title: 'x', site: 'javascript:alert(1)' }],
    ['bad github', { title: 'x', github: 'not a url' }],
    ['bad technologies', { title: 'x', technologies: ['ok', 5] }],
    ['bad images', { title: 'x', images: [{ alt: 'no src' }] }],
    ['images not array', { title: 'x', images: 'nope' }],
  ];

  for (const [label, payload] of cases) {
    assert.throws(
      () => validateProjectInput(payload, { partial: false, schema }),
      (err) => err instanceof HttpError && err.status === 400 && err.code === 'VALIDATION_ERROR',
      label
    );
  }
});

test('validateProjectInput allows an empty partial update but rejects an invalid supplied field', async () => {
  const schema = await schemaPromise;
  assert.doesNotThrow(() => validateProjectInput({}, { partial: true, schema }));
  assert.throws(
    () => validateProjectInput({ order: 'nope' }, { partial: true, schema }),
    (err) => err.status === 400
  );
});

test('deriveSlug normalizes and rejects unusable values', async () => {
  const schema = await schemaPromise;
  assert.strictEqual(deriveSlug('My Great Project!', schema), 'my-great-project');
  assert.throws(
    () => deriveSlug('!!!', schema),
    (err) => err instanceof HttpError && err.status === 400
  );
});

test('buildProjectDoc applies create defaults and preserves update state', async () => {
  const schema = await schemaPromise;

  const created = buildProjectDoc({
    input: { title: 'New Thing' },
    slug: 'new-thing',
    order: 4,
    schema,
  });
  assert.strictEqual(created.slug, 'new-thing');
  assert.strictEqual(created.status, 'draft');
  assert.strictEqual(created.featured, false);
  assert.strictEqual(created.order, 4);
  assert.strictEqual(created.title, 'New Thing');

  const existing = { ...created, status: 'published', featured: true, order: 4 };
  const updated = buildProjectDoc({
    input: { title: 'Renamed' },
    existing,
    slug: 'new-thing',
    schema,
  });
  assert.strictEqual(updated.title, 'Renamed');
  assert.strictEqual(updated.status, 'published');
  assert.strictEqual(updated.featured, true);
  assert.strictEqual(updated.order, 4);
});
