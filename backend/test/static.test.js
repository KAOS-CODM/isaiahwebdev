const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  PROJECT_ROOT,
  resolvePublicPath,
  isPublicStaticRequest,
  contentTypeFor,
  frontendServingEnabled,
} = require('../src/lib/static-site.js');
const { setDb } = require('../src/lib/db-handle.js');

/**
 * Tests for the unified local development static server:
 *  - the public allowlist (what may never be exposed)
 *   - serving the public frontend over HTTP from the one backend server
 *   - the narrowly scoped no-Origin allowance for the public projects API
 *   - the /projects/ -> /projects redirect
 *
 * All HTTP tests use mock/test doubles and ephemeral ports - no live MongoDB.
 */

/** Minimal DB double matching the shape used by the projects store. */
function mockDb(docs) {
  return {
    collection: () => ({
      find: () => ({
        toArray: async () => docs,
      }),
    }),
  };
}

async function withServer(fn) {
  const { createServer } = require('../src/index.js');
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ---------------------------------------------------------------------------
// Path allowlist (pure resolution)
// ---------------------------------------------------------------------------

test('resolvePublicPath maps every extensionless HTML route', () => {
  const expected = {
    '/': 'index.html',
    '/about': 'about.html',
    '/projects': 'projects.html',
    '/project': 'project.html',
    '/certificates': 'certificates.html',
    '/resume': 'resume.html',
    '/contact': 'contact.html',
    '/admin': 'admin.html',
  };
  for (const [route, file] of Object.entries(expected)) {
    const resolved = resolvePublicPath(route);
    assert.ok(resolved, `expected ${route} to resolve`);
    assert.strictEqual(resolved.absPath, path.join(PROJECT_ROOT, file));
    assert.strictEqual(resolved.contentType, 'text/html; charset=utf-8');
  }
});

test('resolvePublicPath serves allowlisted directories with correct content types', () => {
  const cases = [
    ['/css/styles.css', 'text/css; charset=utf-8'],
    ['/js/api-config.js', 'text/javascript; charset=utf-8'],
    ['/js/projects-schema.js', 'text/javascript; charset=utf-8'],
    ['/data/projects.json', 'application/json; charset=utf-8'],
    ['/icon/favicon.ico', 'image/x-icon'],
    ['/logo/logo.png', 'image/png'],
    ['/assets/icons/fiverr.svg', 'image/svg+xml'],
    ['/docs/resume.pdf', 'application/pdf'],
  ];
  for (const [route, type] of cases) {
    const resolved = resolvePublicPath(route);
    assert.ok(resolved, `expected ${route} to resolve`);
    assert.strictEqual(resolved.contentType, type, route);
  }
});

test('resolvePublicPath serves root public files', () => {
  assert.strictEqual(resolvePublicPath('/robots.txt').contentType, 'text/plain; charset=utf-8');
  assert.strictEqual(
    resolvePublicPath('/sitemap.xml').contentType,
    'application/xml; charset=utf-8'
  );
  assert.strictEqual(
    resolvePublicPath('/google9b1538b3ddfd9a52.html').contentType,
    'text/html; charset=utf-8'
  );
});

test('resolvePublicPath never exposes repository internals', () => {
  const forbidden = [
    '/backend/.env',
    '/backend/.env.example',
    '/backend/package.json',
    '/backend/src/index.js',
    '/WORKFLOW_BRAIN.md',
    '/ROADMAP.md',
    '/README.md',
    '/LICENSE.md',
    '/serve_local.py',
    '/.git/config',
    '/.gitignore',
    '/.env',
    '/tests/projects-schema.test.mjs',
    '/tailwind-workspace/package.json',
    '/package.json',
    '/package-lock.json',
  ];
  for (const pathname of forbidden) {
    assert.strictEqual(resolvePublicPath(pathname), null, pathname);
  }
});

test('resolvePublicPath rejects traversal and malformed paths', () => {
  const rejected = [
    '/css/../backend/src/index.js',
    '/css/%2e%2e/backend/src/index.js',
    '/../backend/.env',
    '/js/%2e%2e%2f%2e%2e/backend/.env',
    '/js/api-config.js%00.png',
    '/css\\styles.css',
    '/js/./api-config.js',
    '/%E0%A4%A',
  ];
  for (const pathname of rejected) {
    assert.strictEqual(resolvePublicPath(pathname), null, pathname);
  }
});

test('isPublicStaticRequest matches only public path shapes', () => {
  const allowed = [
    '/',
    '/about',
    '/admin',
    '/project',
    '/css/styles.css',
    '/data/projects.json',
    '/robots.txt',
    '/sitemap.xml',
    '/index.html',
  ];
  for (const pathname of allowed) {
    assert.strictEqual(isPublicStaticRequest(pathname), true, pathname);
  }
  const denied = [
    '/backend/.env',
    '/api/content/projects',
    '/health',
    '/foo',
    '/foo/bar',
    '/tests/x.js',
    '/WORKFLOW_BRAIN.md',
  ];
  for (const pathname of denied) {
    assert.strictEqual(isPublicStaticRequest(pathname), false, pathname);
  }
});

// ---------------------------------------------------------------------------
// Integrated HTTP behavior
// ---------------------------------------------------------------------------

test('serves every public HTML route over HTTP', async () => {
  await withServer(async (baseUrl) => {
    for (const route of ['/', '/about', '/projects', '/project', '/certificates', '/resume', '/contact', '/admin']) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.strictEqual(res.status, 200, route);
      assert.ok(res.headers.get('content-type').includes('text/html'), route);
      const html = await res.text();
      assert.ok(html.length > 0, route);
      assert.ok(/<(!doctype|html)/i.test(html), route);
    }
  });
});

test('serves allowlisted assets and honors HEAD', async () => {
  await withServer(async (baseUrl) => {
    const css = await fetch(`${baseUrl}/css/styles.css`);
    assert.strictEqual(css.status, 200);
    assert.ok(css.headers.get('content-type').includes('text/css'));
    assert.ok((await css.text()).length > 0);

    const js = await fetch(`${baseUrl}/js/api-config.js`);
    assert.strictEqual(js.status, 200);
    assert.ok(js.headers.get('content-type').includes('javascript'));

    const json = await fetch(`${baseUrl}/data/projects.json`);
    assert.strictEqual(js.status, 200);
    assert.strictEqual(json.headers.get('content-type'), 'application/json; charset=utf-8');

    const head = await fetch(`${baseUrl}/css/styles.css`, { method: 'HEAD' });
    assert.strictEqual(head.status, 200);
    assert.strictEqual(await head.text(), '');
  });
});

test('/projects/ redirects to the canonical /projects listing', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/projects/`, { redirect: 'manual' });
    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.headers.get('location'), '/projects');

    const followed = await fetch(`${baseUrl}/projects/`);
    assert.strictEqual(followed.status, 200);
    assert.ok(followed.headers.get('content-type').includes('text/html'));
  });
});

test('/admin/ redirects to the canonical /admin page', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/`, { redirect: 'manual' });
    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.headers.get('location'), '/admin');

    const served = await fetch(`${baseUrl}/admin`);
    assert.strictEqual(served.status, 200);
    assert.ok(served.headers.get('content-type').includes('text/html'));
    assert.strictEqual(served.headers.get('x-robots-tag'), null);
  });
});

test('never exposes repository internals over HTTP', async () => {
  await withServer(async (baseUrl) => {
    for (const pathname of ['/backend/.env', '/WORKFLOW_BRAIN.md', '/.git/config', '/tests/projects-schema.test.mjs']) {
      // With an allowed Origin, the request reaches the JSON 404 handler.
      const withOrigin = await fetch(`${baseUrl}${pathname}`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      assert.strictEqual(withOrigin.status, 404, pathname);
      assert.ok(withOrigin.headers.get('content-type').includes('application/json'), pathname);

      // Without an Origin, the strict API gate rejects it.
      const noOrigin = await fetch(`${baseUrl}${pathname}`);
      assert.strictEqual(noOrigin.status, 403, pathname);
    }
  });
});

test('rejects non-GET/HEAD methods on static files', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/css/styles.css`, { method: 'POST' });
    assert.strictEqual(res.status, 405);
    assert.strictEqual(res.headers.get('allow'), 'GET, HEAD');
  });
});

test('missing files under public directories return 404, not the API gate', async () => {
  await withServer(async (baseUrl) => {
    for (const pathname of ['/css/does-not-exist.css', '/images/missing.png', '/data/missing.json']) {
      const res = await fetch(`${baseUrl}${pathname}`);
      assert.strictEqual(res.status, 404, pathname);
    }
  });
});

test('public projects API accepts requests without an Origin header', async () => {
  setDb(mockDb([{ title: 'Recipe Submission Website', description: 'Published one.' }]));
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/content/projects`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('application/json'));
      const body = await res.json();
      assert.ok(Array.isArray(body.projects));
      assert.strictEqual(body.projects.length, 1);
    });
  } finally {
    setDb(null);
  }
});

test('public projects API keeps its cross-origin allowlist', async () => {
  setDb(mockDb([{ title: 'Recipe Submission Website', description: 'Published one.' }]));
  try {
    await withServer(async (baseUrl) => {
      const allowed = await fetch(`${baseUrl}/api/content/projects`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      assert.strictEqual(allowed.status, 200);
      assert.strictEqual(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');

      const disallowed = await fetch(`${baseUrl}/api/content/projects`, {
        headers: { Origin: 'http://evil.example' },
      });
      assert.strictEqual(disallowed.status, 200);
      assert.strictEqual(disallowed.headers.get('access-control-allow-origin'), null);
    });
  } finally {
    setDb(null);
  }
});

test('other API routes still require an Origin header', async () => {
  await withServer(async (baseUrl) => {
    const noOrigin = await fetch(`${baseUrl}/api/unknown`);
    assert.strictEqual(noOrigin.status, 403);

    const withOrigin = await fetch(`${baseUrl}/api/unknown`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.strictEqual(withOrigin.status, 404);
  });
});

test('frontend serving is disabled in production', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/`, { headers: { Origin: 'http://localhost:3000' } });
      assert.strictEqual(res.status, 404);
      assert.ok(res.headers.get('content-type').includes('application/json'));
    });
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
});
