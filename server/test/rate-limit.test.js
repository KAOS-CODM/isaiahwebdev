'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  RateLimitError,
  hashSubject,
  createRateLimiter,
  createMemoryStore,
} = require('../lib/rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const T0 = 1_700_000_000_000; // fixed clock: deterministic windows

function limiter(store) {
  return createRateLimiter({ store, windowMs: WINDOW_MS, maxFailures: 5 });
}

describe('rate limiter constructor', () => {
  it('rejects a store without add()', () => {
    assert.throws(() => createRateLimiter({ store: {}, windowMs: WINDOW_MS, maxFailures: 5 }), TypeError);
  });

  it('rejects invalid window/threshold', () => {
    const store = createMemoryStore();
    assert.throws(() => createRateLimiter({ store, windowMs: 0, maxFailures: 5 }), TypeError);
    assert.throws(() => createRateLimiter({ store, windowMs: WINDOW_MS, maxFailures: 0 }), TypeError);
  });
});

describe('five allowed failures, sixth rejected', () => {
  it('allows 1-5, rejects 6th with retry-after', async () => {
    const rl = limiter(createMemoryStore());
    for (let n = 1; n <= 5; n += 1) {
      const r = await rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + n });
      assert.equal(r.allowed, true);
      assert.equal(r.count, n);
    }
    const blocked = await rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + 6 });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.count, 6);
    assert.ok(blocked.retryAfterMs > 0);
    assert.ok(blocked.retryAfterMs <= WINDOW_MS);
  });

  it('tracks subjects independently', async () => {
    const rl = limiter(createMemoryStore());
    for (let n = 0; n < 5; n += 1) {
      await rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + n });
    }
    const other = await rl.checkAndRecord({ subject: 'ip-hash-b', now: T0 + 100 });
    assert.equal(other.allowed, true);
    assert.equal(other.count, 1);
  });

  it('reset() clears the subject bucket', async () => {
    const rl = limiter(createMemoryStore());
    for (let n = 0; n < 5; n += 1) {
      await rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + n });
    }
    await rl.reset({ subject: 'ip-hash-a', now: T0 + 200 });
    const r = await rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + 201 });
    assert.equal(r.allowed, true);
    assert.equal(r.count, 1);
  });
});

describe('window rollover', () => {
  it('expired window starts a fresh bucket without errors', async () => {
    const rl = limiter(createMemoryStore());
    for (let n = 0; n < 5; n += 1) {
      await rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + n });
    }
    const nextWindow = (Math.floor(T0 / WINDOW_MS) + 1) * WINDOW_MS + 1;
    const r = await rl.checkAndRecord({ subject: 'ip-hash-a', now: nextWindow });
    assert.equal(r.allowed, true);
    assert.equal(r.count, 1);
  });
});

describe('concurrency', () => {
  it('ten parallel failures record exactly ten with one shared bucket', async () => {
    const store = createMemoryStore();
    const rl = limiter(store);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 + i }))
    );
    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    assert.deepEqual(counts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(results.filter((r) => r.allowed).length, 5);
    assert.equal(results.filter((r) => !r.allowed).length, 5);
    assert.equal(store.__size(), 1);
  });
});

describe('fail-closed store errors', () => {
  it('propagates RateLimitError when the store fails', async () => {
    const broken = {
      async add() {
        throw new Error('connection refused');
      },
      async remove() {},
    };
    const rl = limiter(broken);
    await assert.rejects(rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 }), RateLimitError);
  });

  it('propagates non-integer counts as unavailable', async () => {
    const corrupt = {
      async add() {
        return 'many';
      },
      async remove() {},
    };
    const rl = limiter(corrupt);
    await assert.rejects(rl.checkAndRecord({ subject: 'ip-hash-a', now: T0 }), RateLimitError);
  });
});

describe('hashSubject', () => {
  it('is deterministic and pepper-sensitive', () => {
    assert.equal(hashSubject('a', 'p1'), hashSubject('a', 'p1'));
    assert.notEqual(hashSubject('a', 'p1'), hashSubject('a', 'p2'));
    assert.notEqual(hashSubject('a', 'p1'), hashSubject('b', 'p1'));
  });
});
