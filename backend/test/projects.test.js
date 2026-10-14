const test = require('node:test');
const assert = require('node:assert');

const { projectsHandler, toApiProject, COLLECTION_NAME } = require('../src/routes/projects.js');
const { listPublishedProjects } = require('../src/lib/project-store.js');
const { setDb } = require('../src/lib/db-handle.js');

/**
 * Test suite for GET /api/content/projects.
 * Uses mock/test doubles - no live MongoDB dependency.
 */

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body) {
      if (body !== undefined) this.body += String(body);
      this.ended = true;
    },
    get writableEnded() {
      return this.ended;
    },
  };
}

function mockDb(docs) {
  return {
    collection: () => ({
      find: (filter) => ({
        toArray: async () => {
          if (filter && typeof filter.slug === 'string') {
            return docs.filter((doc) => doc.slug === filter.slug);
          }
          return docs;
        },
      }),
    }),
  };
}

const PUBLISHED = {
  title: 'Recipe Submission Website',
  description: 'A full-stack recipe platform.',
  technologies: ['JavaScript', 'Node.js'],
  site: 'https://example.com',
  github: 'https://github.com/example/repo',
  images: [{ src: '/images/recipe/a.jpeg', alt: 'Screenshot' }],
};

test('COLLECTION_NAME is exported', () => {
  assert.strictEqual(COLLECTION_NAME, 'projects');
});

test('toApiProject exposes the public fields including slug/status/featured', () => {
  const api = toApiProject({
    slug: 'demo',
    title: 'Demo',
    description: 'Desc',
    technologies: ['CSS'],
    site: 'https://example.com',
    github: '',
    images: [{ src: '/a.png', alt: '' }],
    status: 'published',
    featured: true,
    order: 0,
  });

  assert.deepStrictEqual(api, {
    slug: 'demo',
    title: 'Demo',
    description: 'Desc',
    technologies: ['CSS'],
    site: 'https://example.com',
    github: '',
    images: [{ src: '/a.png', alt: '' }],
    status: 'published',
    featured: true,
    order: 0,
  });
});

test('listPublishedProjects derives slugs via the shared schema and hides drafts', async () => {
  const db = mockDb([
    { ...PUBLISHED },
    { title: 'Hidden Draft', description: 'Not ready', status: 'draft' },
  ]);

  const projects = await listPublishedProjects(db);

  assert.strictEqual(projects.length, 1);
  assert.strictEqual(projects[0].slug, 'recipe-submission-website');
});

test('projectsHandler returns 200 with { projects: [...] }', async () => {
  setDb(mockDb([{ ...PUBLISHED }]));
  const res = createRes();

  await projectsHandler({ method: 'GET' }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'application/json');
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.projects));
  assert.strictEqual(body.projects.length, 1);
  assert.strictEqual(body.projects[0].slug, 'recipe-submission-website');
  assert.strictEqual(body.projects[0].status, 'published');
  setDb(null);
});

test('projectsHandler omits unpublished projects from the response', async () => {
  setDb(mockDb([{ title: 'Draft only', description: 'x', status: 'draft' }]));
  const res = createRes();

  await projectsHandler({ method: 'GET' }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), { projects: [] });
  setDb(null);
});

test('projectsHandler returns 503 when no database is available', async () => {
  setDb(null);
  const res = createRes();

  await projectsHandler({ method: 'GET' }, res);

  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(JSON.parse(res.body).error.code, 'SERVICE_UNAVAILABLE');
});

test('projectsHandler returns 405 for non-GET methods', async () => {
  const res = createRes();

  await projectsHandler({ method: 'POST' }, res);

  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(JSON.parse(res.body).error.code, 'METHOD_NOT_ALLOWED');
});

test('projectsHandler returns 500 when the query throws', async () => {
  setDb({
    collection: () => ({
      find: () => ({
        toArray: async () => {
          throw new Error('boom');
        },
      }),
    }),
  });
  const res = createRes();

  await projectsHandler({ method: 'GET' }, res);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(JSON.parse(res.body).error.code, 'INTERNAL_ERROR');
  setDb(null);
});
