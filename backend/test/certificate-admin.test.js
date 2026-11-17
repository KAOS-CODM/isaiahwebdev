const test = require('node:test');
const assert = require('node:assert');

const auth = require('../src/lib/admin-auth.js');
const { resetLoginRateLimit } = require('../src/lib/rate-limit.js');
const { setDb } = require('../src/lib/db-handle.js');
const { createServer } = require('../src/index.js');

/**
 * Integrated tests for the authenticated certificate CMS endpoints.
 *
 * The server runs on an ephemeral port with an in-memory database double, so
 * there is no live MongoDB dependency. Test credentials are generated in memory.
 */

const TEST_USERNAME = 'cert-admin';
const TEST_PASSWORD = 'cert-admin-password';
const TEST_TOKEN_SECRET = 'certificate-integration-test-secret';

function createAdminDoc() {
  return {
    _id: 'admin',
    username: TEST_USERNAME,
    passwordHash: auth.hashPassword(TEST_PASSWORD),
    tokenSecret: TEST_TOKEN_SECRET,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matches(filter) {
  return (doc) => {
    if (!filter) return true;
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && Array.isArray(value.$in)) {
        return value.$in.some((candidate) => String(doc[key]) === String(candidate));
      }
      return String(doc[key]) === String(value);
    });
  };
}

function duplicateKeyError() {
  const err = new Error('E11000 duplicate key');
  err.code = 11000;
  return err;
}

function createMockDb(initial = {}) {
  const store = new Map();

  function stateFor(name) {
    if (!store.has(name)) store.set(name, { docs: [], counter: 0 });
    return store.get(name);
  }

  for (const [name, docs] of Object.entries(initial)) {
    const state = stateFor(name);
    for (const doc of docs) {
      const seeded = { ...doc };
      if (seeded._id === undefined) seeded._id = `seed-${++state.counter}`;
      state.docs.push(seeded);
    }
  }

  function collection(name) {
    const state = stateFor(name);
    return {
      find(filter) {
        const matched = () => state.docs.filter(matches(filter));
        return {
          toArray: async () => matched().map(clone),
          sort(spec) {
            const entries = Object.entries(spec || {});
            const sorted = matched().slice().sort((a, b) => {
              for (const [field, direction] of entries) {
                const aValue = a[field];
                const bValue = b[field];
                if (aValue === bValue) continue;
                const comparison = aValue > bValue ? 1 : -1;
                return direction === -1 ? -comparison : comparison;
              }
              return 0;
            });
            return { toArray: async () => sorted.map(clone) };
          },
        };
      },
      async findOne(filter) {
        const found = state.docs.find(matches(filter));
        return found ? clone(found) : null;
      },
      async insertOne(doc) {
        if (doc._id !== undefined && state.docs.some((d) => String(d._id) === String(doc._id))) {
          throw duplicateKeyError();
        }
        if (doc.slug && state.docs.some((d) => d.slug === doc.slug)) {
          throw duplicateKeyError();
        }
        const stored = { ...doc };
        if (stored._id === undefined) stored._id = `gen-${++state.counter}`;
        state.docs.push(stored);
        return { insertedId: stored._id };
      },
      async updateOne(filter, update) {
        const target = state.docs.find(matches(filter));
        if (!target) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(target, update.$set || {});
        return { matchedCount: 1, modifiedCount: 1 };
      },
      async deleteOne(filter) {
        const before = state.docs.length;
        state.docs = state.docs.filter((d) => !matches(filter)(d));
        return { deletedCount: before - state.docs.length };
      },
    };
  }

  return { collection, store };
}

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
}

function login(baseUrl) {
  return request(baseUrl, '/api/admin/login', {
    method: 'POST',
    body: { username: TEST_USERNAME, password: TEST_PASSWORD },
  });
}

test.beforeEach(() => {
  resetLoginRateLimit();
  setDb(createMockDb({ admins: [createAdminDoc()] }));
});

test.after(() => {
  setDb(null);
});

test('certificate admin CRUD, validation, publish state and reorder work end to end', async () => {
  await withServer(async (baseUrl) => {
    const token = (await login(baseUrl)).body.token;
    assert.ok(token);

    const invalid = await request(baseUrl, '/api/admin/certificates', {
      method: 'POST',
      token,
      body: { title: 'No Evidence', issuer: 'Example Institute' },
    });
    assert.strictEqual(invalid.response.status, 400);

    const created = await request(baseUrl, '/api/admin/certificates', {
      method: 'POST',
      token,
      body: {
        title: 'AWS Certified Developer',
        issuer: 'Amazon Web Services',
        description: 'Professional cloud certification',
        issueDate: '2026-01-15',
        credentialId: 'AWS-DEV-123',
        category: 'Cloud',
        skills: ['AWS', 'Cloud'],
        image: {
          src: 'https://example.com/badge.png',
          alt: 'AWS badge',
        },
        verificationUrl: 'https://aws.example/verify/AWS-DEV-123',
      },
    });

    assert.strictEqual(created.response.status, 201);
    const slug = created.body.certificate.slug;
    assert.strictEqual(slug, 'aws-certified-developer');
    assert.strictEqual(created.body.certificate.status, 'draft');
    assert.strictEqual(created.body.certificate.image.src, 'https://example.com/badge.png');
    assert.deepStrictEqual(created.body.certificate.skills, ['AWS', 'Cloud']);

    const listed = await request(baseUrl, '/api/admin/certificates', { token });
    assert.strictEqual(listed.response.status, 200);
    assert.strictEqual(listed.body.certificates.length, 1);
    assert.strictEqual(listed.body.certificates[0].slug, slug);

    const publicBefore = await request(baseUrl, '/api/content/certificates');
    assert.deepStrictEqual(publicBefore.body.certificates, []);
    const publicItemBefore = await request(baseUrl, `/api/content/certificates/${slug}`);
    assert.strictEqual(publicItemBefore.response.status, 404);

    const itemBefore = await request(baseUrl, `/api/admin/certificates/${slug}`, { token });
    assert.strictEqual(itemBefore.response.status, 200);
    assert.strictEqual(itemBefore.body.certificate.title, 'AWS Certified Developer');

    const edited = await request(baseUrl, `/api/admin/certificates/${slug}`, {
      method: 'PATCH',
      token,
      body: {
        title: 'AWS Certified Developer - Associate',
        skills: ['AWS', 'Cloud', 'DevOps'],
        displayOrder: 3,
      },
    });
    assert.strictEqual(edited.response.status, 200);
    assert.strictEqual(edited.body.certificate.title, 'AWS Certified Developer - Associate');
    assert.strictEqual(edited.body.certificate.slug, slug);
    assert.strictEqual(edited.body.certificate.status, 'draft');
    assert.strictEqual(edited.body.certificate.displayOrder, 3);
    assert.deepStrictEqual(edited.body.certificate.skills, ['AWS', 'Cloud', 'DevOps']);

    const published = await request(baseUrl, `/api/admin/certificates/${slug}/publish`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.strictEqual(published.response.status, 200);
    assert.strictEqual(published.body.certificate.status, 'published');

    const publicAfter = await request(baseUrl, '/api/content/certificates');
    assert.strictEqual(publicAfter.body.certificates.length, 1);
    const publicCert = publicAfter.body.certificates[0];
    assert.strictEqual(publicCert.slug, slug);
    assert.strictEqual(publicCert.credentialId, 'AWS-DEV-123');
    assert.strictEqual(publicCert.category, 'Cloud');
    assert.deepStrictEqual(publicCert.skills, ['AWS', 'Cloud', 'DevOps']);
    assert.strictEqual(publicCert.verificationUrl, 'https://aws.example/verify/AWS-DEV-123');
    assert.strictEqual(publicCert.image.publicId, undefined);
    assert.strictEqual(publicCert.status, undefined);

    const publicItem = await request(baseUrl, `/api/content/certificates/${slug}`);
    assert.strictEqual(publicItem.response.status, 200);
    assert.deepStrictEqual(publicItem.body.certificate.skills, ['AWS', 'Cloud', 'DevOps']);
    assert.strictEqual(publicItem.body.certificate.image.publicId, undefined);

    const unpublished = await request(baseUrl, `/api/admin/certificates/${slug}/unpublish`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.strictEqual(unpublished.response.status, 200);
    assert.strictEqual(unpublished.body.certificate.status, 'draft');

    const patchedStatus = await request(baseUrl, `/api/admin/certificates/${slug}`, {
      method: 'PATCH',
      token,
      body: { status: 'published' },
    });
    assert.strictEqual(patchedStatus.response.status, 200);
    assert.strictEqual(patchedStatus.body.certificate.status, 'published');

    const reordered = await request(baseUrl, '/api/admin/certificates/reorder', {
      method: 'PATCH',
      token,
      body: { items: [{ slug, displayOrder: 7 }] },
    });
    assert.strictEqual(reordered.response.status, 200);
    assert.strictEqual(reordered.body.certificates[0].displayOrder, 7);

    const invalidReorder = await request(baseUrl, '/api/admin/certificates/reorder', {
      method: 'PATCH',
      token,
      body: { items: 'nope' },
    });
    assert.strictEqual(invalidReorder.response.status, 400);

    const deleted = await request(baseUrl, `/api/admin/certificates/${slug}`, {
      method: 'DELETE',
      token,
    });
    assert.strictEqual(deleted.response.status, 200);

    const gone = await request(baseUrl, `/api/admin/certificates/${slug}`, { token });
    assert.strictEqual(gone.response.status, 404);
  });
});
