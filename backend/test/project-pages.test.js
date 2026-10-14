const test = require('node:test');
const assert = require('node:assert');

const {
  buildProjectPage,
  canonicalUrl,
  safeJsonLd,
} = require('../src/lib/project-page.js');
const { findPublishedProjectBySlug, isValidSlug } = require('../src/lib/project-store.js');
const { projectPagesHandler, extractSlug, SITE_URL } = require('../src/routes/project-pages.js');
const { setDb } = require('../src/lib/db-handle.js');
const { loadProjectSchema } = require('../src/lib/project-schema.js');

const schemaPromise = loadProjectSchema();

/**
 * Test suite for the server-rendered project detail pages.
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

const PUBLISHED_PROJECT = {
  slug: 'recipe-submission-website',
  title: 'Recipe Submission Website',
  description: 'A full-stack recipe platform with authentication.',
  technologies: ['JavaScript', 'Node.js'],
  images: [
    { src: 'images/recipe/one.jpeg', alt: 'Homepage' },
    { src: 'images/recipe/two.jpeg', alt: 'Dashboard' },
  ],
  site: 'https://example.com/live',
  github: 'https://github.com/example/repo',
  status: 'published',
  featured: true,
  order: 0,
};

function jsonLdBlocks(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((match) => match[1]);
}

test('extractSlug reads a single path segment and rejects nesting', () => {
  assert.strictEqual(extractSlug('/projects/my-project'), 'my-project');
  assert.strictEqual(extractSlug('/projects/my-project/'), 'my-project');
  assert.strictEqual(extractSlug('/projects/a/b'), '');
  assert.strictEqual(extractSlug('/projects/'), '');
  assert.strictEqual(extractSlug('/projects'), '');
  assert.strictEqual(extractSlug('/other/x'), '');
});

test('isValidSlug accepts safe slugs and rejects unsafe input', () => {
  assert.strictEqual(isValidSlug('recipe-submission-website'), true);
  assert.strictEqual(isValidSlug('a1'), true);
  assert.strictEqual(isValidSlug(''), false);
  assert.strictEqual(isValidSlug('UPPER'), false);
  assert.strictEqual(isValidSlug('has space'), false);
  assert.strictEqual(isValidSlug('../etc/passwd'), false);
  assert.strictEqual(isValidSlug('a'.repeat(81)), false);
  assert.strictEqual(isValidSlug('{"$ne":null}'), false);
  assert.strictEqual(isValidSlug(undefined), false);
});

test('buildProjectPage renders crawlable content without JavaScript', async () => {
  const { escapeHtml } = await schemaPromise;
  const html = buildProjectPage(PUBLISHED_PROJECT, { escapeHtml, siteUrl: SITE_URL });

  // Baked content (present in the initial response).
  assert.ok(html.includes('<h1 id="project-title">Recipe Submission Website</h1>'));
  assert.ok(html.includes(PUBLISHED_PROJECT.description));
  assert.ok(html.includes('Technologies:'));
  assert.ok(html.includes('JavaScript, Node.js'));
  assert.ok(html.includes('Live Demo'));
  assert.ok(html.includes('Source Code'));
  assert.ok(html.includes('Back to Projects'));

  // Gallery: main image + switchable thumbnails.
  assert.ok(html.includes('id="project-gallery-main"'));
  assert.ok(html.includes('src="/images/recipe/one.jpeg"'));
  assert.ok(html.includes('class="project-gallery-thumb"'));
  assert.ok(html.includes('data-src="/images/recipe/two.jpeg"'));
});

test('buildProjectPage emits project-specific SEO metadata', async () => {
  const { escapeHtml } = await schemaPromise;
  const html = buildProjectPage(PUBLISHED_PROJECT, { escapeHtml, siteUrl: SITE_URL });

  const canonical = `${SITE_URL}/projects/recipe-submission-website`;
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
  assert.ok(html.includes('<title>Recipe Submission Website | IsaiahWebDev Portfolio</title>'));
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`));
  assert.ok(html.includes(`<meta property="og:title" content="Recipe Submission Website | IsaiahWebDev Portfolio">`));
  assert.ok(html.includes(PUBLISHED_PROJECT.description));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(html.includes(`<meta property="og:image" content="${SITE_URL}/images/recipe/one.jpeg">`));

  const blocks = jsonLdBlocks(html);
  assert.strictEqual(blocks.length, 2);
  const [softwareApp, breadcrumb] = blocks.map((block) => JSON.parse(block));

  assert.strictEqual(softwareApp['@type'], 'SoftwareApplication');
  assert.strictEqual(softwareApp.name, PUBLISHED_PROJECT.title);
  assert.strictEqual(softwareApp.url, PUBLISHED_PROJECT.site);
  assert.strictEqual(softwareApp.codeRepository, PUBLISHED_PROJECT.github);
  assert.deepStrictEqual(softwareApp.programmingLanguage, PUBLISHED_PROJECT.technologies);

  assert.strictEqual(breadcrumb['@type'], 'BreadcrumbList');
  assert.strictEqual(breadcrumb.itemListElement.length, 3);
  assert.strictEqual(breadcrumb.itemListElement[2].item, canonical);
});

test('buildProjectPage escapes HTML in project data', async () => {
  const { escapeHtml } = await schemaPromise;
  const hostile = {
    ...PUBLISHED_PROJECT,
    title: '<script>alert(1)</script>',
    description: 'A "quote" & <b>bold</b>',
  };
  const html = buildProjectPage(hostile, { escapeHtml, siteUrl: SITE_URL });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&quot;quote&quot; &amp; &lt;b&gt;bold&lt;/b&gt;'));
});

test('safeJsonLd cannot break out of the script element', () => {
  const serialized = safeJsonLd({ name: '</script><script>alert(1)</script>' });
  assert.ok(!serialized.includes('</script>'));
  assert.ok(!serialized.includes('<'));
  // Still valid JSON that round-trips to the original string.
  assert.strictEqual(JSON.parse(serialized).name, '</script><script>alert(1)</script>');
});

test('canonicalUrl builds the site path', () => {
  assert.strictEqual(
    canonicalUrl('https://example.com', 'my-project'),
    'https://example.com/projects/my-project'
  );
});

test('findPublishedProjectBySlug resolves by derived slug and hides drafts', async () => {
  const db = mockDb([
    { title: 'Recipe Submission Website', description: 'Published one.' },
    { title: 'Secret Draft', description: 'Not ready.', status: 'draft' },
  ]);

  const found = await findPublishedProjectBySlug(db, 'recipe-submission-website');
  assert.ok(found);
  assert.strictEqual(found.title, 'Recipe Submission Website');

  const draft = await findPublishedProjectBySlug(db, 'secret-draft');
  assert.strictEqual(draft, null);

  const missing = await findPublishedProjectBySlug(db, 'does-not-exist');
  assert.strictEqual(missing, null);
});

test('findPublishedProjectBySlug prefers an explicit stored slug', async () => {
  const db = mockDb([{ title: 'Whatever', slug: 'custom-slug', description: 'x' }]);
  const found = await findPublishedProjectBySlug(db, 'custom-slug');
  assert.ok(found);
  assert.strictEqual(found.slug, 'custom-slug');
});

test('findPublishedProjectBySlug rejects invalid slugs before querying', async () => {
  const db = {
    collection: () => {
      throw new Error('should not query the database');
    },
  };
  assert.strictEqual(await findPublishedProjectBySlug(db, '../bad'), null);
  assert.strictEqual(await findPublishedProjectBySlug(db, 'UPPER'), null);
});

test('projectPagesHandler renders 200 HTML for a published project', async () => {
  setDb(mockDb([{ title: 'Recipe Submission Website', description: 'Published one.' }]));
  const res = createRes();

  await projectPagesHandler({ method: 'GET' }, res, '/projects/recipe-submission-website');

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.ok(res.body.includes('Recipe Submission Website'));
  assert.ok(res.body.includes('<link rel="canonical"'));
  setDb(null);
});

test('projectPagesHandler returns 404 for missing, draft and invalid slugs', async () => {
  setDb(mockDb([{ title: 'Secret Draft', description: 'x', status: 'draft' }]));
  {
    const res = createRes();
    await projectPagesHandler({ method: 'GET' }, res, '/projects/nonexistent');
    assert.strictEqual(res.statusCode, 404);
  }
  {
    const res = createRes();
    await projectPagesHandler({ method: 'GET' }, res, '/projects/secret-draft');
    assert.strictEqual(res.statusCode, 404);
  }
  {
    const res = createRes();
    await projectPagesHandler({ method: 'GET' }, res, '/projects/Not%20A%20Slug');
    assert.strictEqual(res.statusCode, 404);
  }
  setDb(null);
});

test('projectPagesHandler returns 503 when no database is available', async () => {
  setDb(null);
  const res = createRes();

  await projectPagesHandler({ method: 'GET' }, res, '/projects/anything');

  assert.strictEqual(res.statusCode, 503);
});

test('projectPagesHandler returns 405 with Allow for non-GET/HEAD', async () => {
  setDb(mockDb([]));
  const res = createRes();

  await projectPagesHandler({ method: 'POST' }, res, '/projects/x');

  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.headers['allow'], 'GET, HEAD');
  setDb(null);
});

test('projectPagesHandler answers HEAD requests with headers but no body', async () => {
  setDb(mockDb([{ title: 'Recipe Submission Website', description: 'Published one.' }]));
  const res = createRes();

  await projectPagesHandler({ method: 'HEAD' }, res, '/projects/recipe-submission-website');

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.strictEqual(res.body, '');
  setDb(null);
});

test('the HTTP server serves project pages without an Origin header (no CORS gate)', async () => {
  const { createServer } = require('../src/index.js');
  setDb(mockDb([{ title: 'Recipe Submission Website', description: 'Published one.' }]));

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    // No Origin header: this mirrors a real browser navigation or a crawler.
    const okResponse = await fetch(`${baseUrl}/projects/recipe-submission-website`);
    assert.strictEqual(okResponse.status, 200);
    assert.ok(okResponse.headers.get('content-type').includes('text/html'));
    const html = await okResponse.text();
    assert.ok(html.includes('<h1 id="project-title">Recipe Submission Website</h1>'));

    const missingResponse = await fetch(`${baseUrl}/projects/nope`);
    assert.strictEqual(missingResponse.status, 404);

    // The public read-only projects API is reachable without an Origin header
    // (same-origin browser fetches omit it), so the listing works through the
    // one local server. Other API paths still require an Origin.
    const apiResponse = await fetch(`${baseUrl}/api/content/projects`);
    assert.strictEqual(apiResponse.status, 200);
    const apiBody = await apiResponse.json();
    assert.ok(Array.isArray(apiBody.projects));

    const gatedResponse = await fetch(`${baseUrl}/api/unknown`);
    assert.strictEqual(gatedResponse.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    setDb(null);
  }
});
