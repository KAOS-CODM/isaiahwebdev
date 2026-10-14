const test = require('node:test');
const assert = require('node:assert');

const auth = require('../src/lib/admin-auth.js');
const { HttpError } = require('../src/lib/errors.js');
const { setDb } = require('../src/lib/db-handle.js');
const {
  setMediaClientForTesting,
  resetMediaClient,
} = require('../src/lib/media-client.js');
const { createServer } = require('../src/index.js');

/**
 * Integrated tests for the Cloudinary-backed media endpoints and the
 * image lifecycle of the admin project API.
 *
 * The server runs on an ephemeral port with an in-memory database double, and
 * the Cloudinary client is replaced with a recording fake, so no network is
 * used and no real Cloudinary account or credential is involved. The values
 * below are obviously fake.
 */

const TEST_USERNAME = 'media-admin';
const TEST_PASSWORD = 'media-admin-password';
const TEST_TOKEN_SECRET = 'media-integration-token-secret-not-real';

const FAKE_CLOUD = 'test-cloud-not-real';
const FAKE_KEY = 'test-key-not-real';
const FAKE_SECRET = 'test-secret-not-real';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

function adminDoc() {
  return {
    _id: 'admin',
    username: TEST_USERNAME,
    passwordHash: auth.hashPassword(TEST_PASSWORD),
    tokenSecret: TEST_TOKEN_SECRET,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// In-memory database double (collection aware, with `_id`/slug uniqueness)
// ---------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matches(filter) {
  return (doc) => {
    if (!filter) return true;
    return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
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
        return { toArray: async () => matched().map(clone) };
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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

async function parse(response) {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string' || Buffer.isBuffer(options.body)
          ? options.body
          : JSON.stringify(options.body),
  }).then(parse);
}

async function loginAsAdmin(baseUrl) {
  const { response, body } = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    body: { username: TEST_USERNAME, password: TEST_PASSWORD },
  });
  assert.strictEqual(response.status, 200);
  return `portfolio_admin=${encodeURIComponent(body.token)}`;
}

function createProject(baseUrl, cookie, payload) {
  return request(baseUrl, '/api/admin/projects', { method: 'POST', cookie, body: payload });
}

function updateProject(baseUrl, cookie, slug, payload) {
  return request(baseUrl, `/api/admin/projects/${slug}`, { method: 'PUT', cookie, body: payload });
}

function uploadImage(baseUrl, cookie, bytes, { contentType = 'image/png', query = '' } = {}) {
  return request(baseUrl, `/api/admin/media/images${query}`, {
    method: 'POST',
    cookie,
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
}

function deleteImage(baseUrl, cookie, publicId) {
  return request(baseUrl, '/api/admin/media/images', {
    method: 'DELETE',
    cookie,
    body: { publicId },
  });
}

/** A recording fake for the Cloudinary client; never touches the network. */
function fakeClient(overrides = {}) {
  const calls = { uploads: [], deletes: [] };
  const base = {
    calls,
    isConfigured: () => true,
    async uploadImage(buffer, options) {
      calls.uploads.push({ buffer, options });
      const folder = (options && options.folder) || 'isaiahwebdev/projects';
      calls.uploads[calls.uploads.length - 1].folder = folder;
      return {
        src: `https://res.cloudinary.com/${FAKE_CLOUD}/image/upload/${folder}/sample.png`,
        publicId: `${folder}/sample-${calls.uploads.length}`,
        width: 8,
        height: 8,
        format: 'png',
        bytes: buffer.length,
      };
    },
    async deleteAsset(publicId) {
      calls.deletes.push(publicId);
      return { result: 'ok' };
    },
  };
  return Object.assign(base, overrides);
}

function setCloudEnv() {
  process.env.CLOUDINARY_CLOUD_NAME = FAKE_CLOUD;
  process.env.CLOUDINARY_API_KEY = FAKE_KEY;
  process.env.CLOUDINARY_API_SECRET = FAKE_SECRET;
}

function clearCloudEnv() {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  delete process.env.CLOUDINARY_FOLDER;
  delete process.env.MEDIA_MAX_UPLOAD_BYTES;
  delete process.env.MEDIA_MAX_IMAGES_PER_PROJECT;
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let client;

test.beforeEach(() => {
  setDb(createMockDb({ admins: [adminDoc()] }));
  clearCloudEnv();
  setCloudEnv();
  client = fakeClient();
  setMediaClientForTesting(client);
});

test.afterEach(() => {
  resetMediaClient();
  clearCloudEnv();
});

test.after(() => {
  setDb(null);
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test('media endpoints require an authenticated admin session', async () => {
  await withServer(async (baseUrl) => {
    const config = await parse(await fetch(`${baseUrl}/api/admin/media/config`));
    assert.strictEqual(config.response.status, 401);
    assert.strictEqual(config.body.error.code, 'UNAUTHORIZED');

    const upload = await uploadImage(baseUrl, '', PNG_BYTES);
    assert.strictEqual(upload.response.status, 401);

    const remove = await deleteImage(baseUrl, '', 'folder/a.png');
    assert.strictEqual(remove.response.status, 401);

    assert.strictEqual(client.calls.uploads.length, 0);
    assert.strictEqual(client.calls.deletes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Configuration endpoint
// ---------------------------------------------------------------------------

test('media config reports limits without exposing any credential', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const { response, body } = await request(baseUrl, '/api/admin/media/config', { cookie });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.media.configured, true);
    assert.strictEqual(body.media.maxImagesPerProject, 50);
    assert.strictEqual(body.media.maxUploadBytes, 5 * 1024 * 1024);
    assert.ok(body.media.allowedTypes.includes('image/png'));

    assert.strictEqual(body.media.apiKey, undefined);
    assert.strictEqual(body.media.apiSecret, undefined);
    assert.strictEqual(body.media.cloudName, undefined);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes(FAKE_SECRET));
    assert.ok(!serialized.includes(FAKE_KEY));
  });
});

test('media config reflects the environment limits when set', async () => {
  await withServer(async (baseUrl) => {
    process.env.MEDIA_MAX_UPLOAD_BYTES = '1048576';
    process.env.MEDIA_MAX_IMAGES_PER_PROJECT = '12';
    process.env.CLOUDINARY_FOLDER = 'custom/folder';
    const cookie = await loginAsAdmin(baseUrl);
    const { body } = await request(baseUrl, '/api/admin/media/config', { cookie });
    assert.strictEqual(body.media.maxUploadBytes, 1048576);
    assert.strictEqual(body.media.maxImagesPerProject, 12);
    assert.strictEqual(body.media.folder, 'custom/folder');
  });
});

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

test('upload rejects unsupported, spoofed and empty payloads', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);

    const svg = await uploadImage(baseUrl, cookie, SVG_BYTES, { contentType: 'image/svg+xml' });
    assert.strictEqual(svg.response.status, 415);
    assert.strictEqual(svg.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');

    const html = await uploadImage(baseUrl, cookie, SVG_BYTES, { contentType: 'text/html' });
    assert.strictEqual(html.response.status, 415);

    // Claims to be a PNG but the bytes are SVG/HTML: magic-byte check rejects it.
    const spoofed = await uploadImage(baseUrl, cookie, SVG_BYTES, { contentType: 'image/png' });
    assert.strictEqual(spoofed.response.status, 415);

    const empty = await uploadImage(baseUrl, cookie, Buffer.alloc(0));
    assert.strictEqual(empty.response.status, 400);

    assert.strictEqual(client.calls.uploads.length, 0);
  });
});

test('upload rejects an oversized payload before storing anything', async () => {
  await withServer(async (baseUrl) => {
    process.env.MEDIA_MAX_UPLOAD_BYTES = '64';
    const cookie = await loginAsAdmin(baseUrl);

    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(128, 0x61)]);
    const { response, body } = await uploadImage(baseUrl, cookie, oversized);
    assert.strictEqual(response.status, 413);
    assert.strictEqual(body.error.code, 'PAYLOAD_TOO_LARGE');
    assert.strictEqual(client.calls.uploads.length, 0);
  });
});

test('a valid upload stores the buffer and returns metadata plus alt text', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const { response, body } = await uploadImage(baseUrl, cookie, PNG_BYTES, {
      query: '?alt=Hero%20shot&slug=my-project',
    });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(body.image.alt, 'Hero shot');
    assert.strictEqual(body.image.format, 'png');
    assert.ok(body.image.src.startsWith('https://res.cloudinary.com/'));
    assert.strictEqual(typeof body.image.publicId, 'string');

    assert.strictEqual(client.calls.uploads.length, 1);
    assert.deepStrictEqual(client.calls.uploads[0].buffer, PNG_BYTES);
    assert.strictEqual(client.calls.uploads[0].options.folder, 'isaiahwebdev/projects/my-project');

    assert.ok(!JSON.stringify(body).includes(FAKE_SECRET));
  });
});

test('upload returns an actionable 503 when Cloudinary is not configured', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    clearCloudEnv();

    const { response, body } = await uploadImage(baseUrl, cookie, PNG_BYTES);
    assert.strictEqual(response.status, 503);
    assert.strictEqual(body.error.code, 'MEDIA_NOT_CONFIGURED');
    assert.ok(body.error.message.includes('CLOUDINARY_CLOUD_NAME'));
    assert.strictEqual(client.calls.uploads.length, 0);
  });
});

test('a storage failure is surfaced as a 502 without leaking details', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    setMediaClientForTesting(
      fakeClient({
        uploadImage: async () => {
          throw new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'The image could not be uploaded. Please try again.');
        },
      })
    );

    const { response, body } = await uploadImage(baseUrl, cookie, PNG_BYTES);
    assert.strictEqual(response.status, 502);
    assert.strictEqual(body.error.code, 'MEDIA_UPLOAD_FAILED');
    assert.ok(!JSON.stringify(body).includes(FAKE_SECRET));
  });
});

// ---------------------------------------------------------------------------
// Explicit asset deletion
// ---------------------------------------------------------------------------

test('delete refuses an in-use asset and allows an unreferenced one', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const created = await createProject(baseUrl, cookie, {
      title: 'Referenced project',
      images: [{ src: 'https://res.cloudinary.com/x/a.png', alt: 'a', publicId: 'folder/a.png' }],
    });
    assert.strictEqual(created.response.status, 201);

    const refused = await deleteImage(baseUrl, cookie, 'folder/a.png');
    assert.strictEqual(refused.response.status, 409);
    assert.strictEqual(refused.body.error.code, 'ASSET_IN_USE');
    assert.strictEqual(client.calls.deletes.length, 0);

    const allowed = await deleteImage(baseUrl, cookie, 'folder/orphan.png');
    assert.strictEqual(allowed.response.status, 200);
    assert.deepStrictEqual(client.calls.deletes, ['folder/orphan.png']);
  });
});

test('delete rejects a malformed public id', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    for (const bad of ['', '../secrets', 42, 'a'.repeat(600)]) {
      const { response } = await deleteImage(baseUrl, cookie, bad);
      assert.strictEqual(response.status, 400);
    }
    assert.strictEqual(client.calls.deletes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle safety
// ---------------------------------------------------------------------------

test('updating a project frees exclusively-owned images after the write succeeds', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const created = await createProject(baseUrl, cookie, {
      title: 'Gallery project',
      images: [
        { src: 'https://res.cloudinary.com/x/a.png', alt: 'a', publicId: 'folder/a.png' },
        { src: 'https://res.cloudinary.com/x/b.png', alt: 'b', publicId: 'folder/b.png' },
      ],
    });
    const slug = created.body.project.slug;

    const updated = await updateProject(baseUrl, cookie, slug, {
      title: 'Gallery project',
      images: [{ src: 'https://res.cloudinary.com/x/a.png', alt: 'a', publicId: 'folder/a.png' }],
    });

    assert.strictEqual(updated.response.status, 200);
    assert.deepStrictEqual(updated.body.media.removed, ['folder/b.png']);
    assert.deepStrictEqual(updated.body.media.deleted, ['folder/b.png']);
    assert.deepStrictEqual(updated.body.media.failed, []);
    assert.deepStrictEqual(client.calls.deletes, ['folder/b.png']);

    const read = await request(baseUrl, `/api/admin/projects/${slug}`, { cookie });
    assert.strictEqual(read.body.project.images.length, 1);
    assert.strictEqual(read.body.project.images[0].publicId, 'folder/a.png');
  });
});

test('an image shared with another project is never deleted', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const shared = {
      src: 'https://res.cloudinary.com/x/shared.png',
      alt: 's',
      publicId: 'folder/shared.png',
    };
    const a = await createProject(baseUrl, cookie, { title: 'Project A', images: [shared] });
    await createProject(baseUrl, cookie, { title: 'Project B', images: [shared] });

    const updated = await updateProject(baseUrl, cookie, a.body.project.slug, {
      title: 'Project A',
      images: [],
    });

    assert.strictEqual(updated.response.status, 200);
    assert.deepStrictEqual(updated.body.media.removed, ['folder/shared.png']);
    assert.deepStrictEqual(updated.body.media.deleted, []);
    assert.strictEqual(client.calls.deletes.length, 0);

    const list = await request(baseUrl, '/api/admin/projects', { cookie });
    const projectB = list.body.projects.find((p) => p.title === 'Project B');
    assert.strictEqual(projectB.images[0].publicId, 'folder/shared.png');
  });
});

test('images without a public id are never treated as deletable assets', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const created = await createProject(baseUrl, cookie, {
      title: 'Manual images',
      images: [{ src: 'https://example.com/legacy.png', alt: 'legacy' }],
    });

    const updated = await updateProject(baseUrl, cookie, created.body.project.slug, {
      title: 'Manual images',
      images: [],
    });

    assert.strictEqual(updated.response.status, 200);
    assert.strictEqual(updated.body.media, undefined);
    assert.strictEqual(client.calls.deletes.length, 0);
  });
});

test('a cleanup failure is reported and never fails the project write', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const created = await createProject(baseUrl, cookie, {
      title: 'Fragile cleanup',
      images: [{ src: 'https://res.cloudinary.com/x/c.png', alt: 'c', publicId: 'folder/c.png' }],
    });

    setMediaClientForTesting(
      fakeClient({
        deleteAsset: async () => {
          throw new HttpError(
            502,
            'MEDIA_DELETE_FAILED',
            'The image could not be removed from storage.'
          );
        },
      })
    );

    const slug = created.body.project.slug;
    const updated = await updateProject(baseUrl, cookie, slug, {
      title: 'Cleanup failure',
      images: [],
    });

    assert.strictEqual(updated.response.status, 200);
    assert.strictEqual(updated.body.project.title, 'Cleanup failure');
    assert.deepStrictEqual(updated.body.media.removed, ['folder/c.png']);
    assert.deepStrictEqual(updated.body.media.deleted, []);
    assert.strictEqual(updated.body.media.failed.length, 1);
    assert.strictEqual(updated.body.media.failed[0].publicId, 'folder/c.png');
  });
});

test('deleting a project frees its exclusively-owned images', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const created = await createProject(baseUrl, cookie, {
      title: 'Doomed project',
      images: [{ src: 'https://res.cloudinary.com/x/z.png', alt: 'z', publicId: 'folder/z.png' }],
    });
    const slug = created.body.project.slug;

    const removed = await request(baseUrl, `/api/admin/projects/${slug}`, {
      method: 'DELETE',
      cookie,
    });
    assert.strictEqual(removed.response.status, 200);
    assert.deepStrictEqual(removed.body.media.deleted, ['folder/z.png']);
    assert.deepStrictEqual(client.calls.deletes, ['folder/z.png']);

    const gone = await request(baseUrl, `/api/admin/projects/${slug}`, { cookie });
    assert.strictEqual(gone.response.status, 404);
  });
});

test('multiple images keep their order, alt text and public ids across save and reload', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAsAdmin(baseUrl);
    const images = [
      { src: 'https://res.cloudinary.com/x/one.png', alt: 'First', publicId: 'folder/one.png' },
      { src: 'https://example.com/manual.png', alt: 'Second (manual)' },
      { src: 'https://res.cloudinary.com/x/three.png', alt: 'Third', publicId: 'folder/three.png' },
    ];

    const created = await createProject(baseUrl, cookie, { title: 'Multi image', images });
    assert.strictEqual(created.response.status, 201);
    assert.deepStrictEqual(created.body.project.images, images);

    // Reordered + reworded alt text; the manual (no publicId) entry is kept.
    const reordered = [
      { src: 'https://res.cloudinary.com/x/three.png', alt: 'Third, now first', publicId: 'folder/three.png' },
      { src: 'https://res.cloudinary.com/x/one.png', alt: 'First, now second', publicId: 'folder/one.png' },
      { src: 'https://example.com/manual.png', alt: 'Second (manual), now last' },
    ];
    const updated = await updateProject(baseUrl, cookie, created.body.project.slug, {
      title: 'Multi image',
      images: reordered,
    });
    assert.strictEqual(updated.response.status, 200);
    assert.deepStrictEqual(updated.body.project.images, reordered);
    // A pure reorder must not release any asset.
    assert.strictEqual(updated.body.media, undefined);
    assert.strictEqual(client.calls.deletes.length, 0);

    const reloaded = await request(baseUrl, `/api/admin/projects/${created.body.project.slug}`, {
      cookie,
    });
    assert.deepStrictEqual(reloaded.body.project.images, reordered);
  });
});
