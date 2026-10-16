import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  resolveProjectSlug,
  toRootRelative,
  renderProjectContent,
  renderProjectMeta,
  renderNotFoundState,
  renderFailureState,
  buildProjectMetadata,
  isRenderableProject,
  projectSummary,
  safeJsonLd,
  INDEX_ROBOTS,
  NOINDEX_ROBOTS,
  DEFAULT_SITE_URL,
} from '../js/project-detail-page.js';
import { loadProjectBySlug, resolveApiBase } from '../js/api-config.js';

/**
 * Tests for the static project detail shell (project.html + js/project-detail-page.js).
 *
 * Uses the same fetch/window doubles as tests/projects-loader.test.mjs so the
 * API-first-with-fallback contract is exercised through the real loader.
 */

const LOCAL_URL = '/data/projects.json';
const SITE = 'https://isaiahwebdev.onrender.com';
const LEGACY_SLUGS = [
  'recipe-submission-website',
  'fintech-multipurpose-website',
  'kaostech-corporate-website',
];

// The real committed fallback, so the fallback tests reflect production data.
const LOCAL_FALLBACK = JSON.parse(
  readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8')
);

const API_PROJECTS = [
  {
    slug: 'af-bookstore',
    title: 'A.F. Bookstore',
    shortDescription: 'An online bookstore with search and checkout.',
    category: 'E-commerce',
    problemStatement: 'Readers needed a fast way to find and buy books.',
    solution: 'A responsive storefront backed by a lightweight API.',
    keyFeatures: ['Search', 'Cart', 'Checkout'],
    technologies: ['JavaScript', 'Node.js', 'MongoDB'],
    developmentStatus: 'completed',
    liveUrl: 'https://af-bookstore.example.com',
    githubUrl: 'https://github.com/example/af-bookstore',
    images: [
      { src: 'https://res.cloudinary.com/demo/image/upload/af-home.jpg', alt: 'Homepage', publicId: 'af/home' },
      { src: 'https://res.cloudinary.com/demo/image/upload/af-cart.jpg', alt: 'Cart' },
    ],
    status: 'published',
    featured: true,
    order: 0,
  },
  {
    slug: 'nimcircle',
    title: 'NimCircle',
    shortDescription: 'A community platform for finding local playgroups.',
    technologies: ['React', 'Node.js'],
    images: [{ src: 'https://res.cloudinary.com/demo/image/upload/nim.jpg', alt: 'Feed' }],
    status: 'published',
    featured: false,
    order: 1,
  },
];

function jsonResponse(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key) => (key.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  };
}

function withFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function withWindow(win) {
  const original = globalThis.window;
  globalThis.window = win;
  return () => {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  };
}

/** Load a slug with an API response (or failure) and the real local fallback. */
async function loadWithApi(slug, apiHandler, { apiBase = SITE } = {}) {
  const restoreWindow = withWindow({
    PORTFOLIO_API_BASE: apiBase,
    location: { hostname: 'app.example.com' },
  });
  const fetchStub = withFetch((url) =>
    url.includes('/api/content/projects') ? apiHandler(url) : jsonResponse(LOCAL_FALLBACK)
  );
  try {
    return await loadProjectBySlug(slug);
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('resolveProjectSlug reads the pretty path, trailing slash and query fallback', () => {
  assert.equal(resolveProjectSlug('/projects/af-bookstore', ''), 'af-bookstore');
  assert.equal(resolveProjectSlug('/projects/af-bookstore/', ''), 'af-bookstore');
  assert.equal(resolveProjectSlug('/projects/a%20b', ''), 'a b');
  assert.equal(resolveProjectSlug('/project.html', '?slug=nimcircle'), 'nimcircle');
  assert.equal(resolveProjectSlug('/projects', ''), '');
  assert.equal(resolveProjectSlug('/projects/', ''), '');
  assert.equal(resolveProjectSlug('/projects/a/b', ''), '');
  assert.equal(resolveProjectSlug('/index', ''), '');
  assert.equal(resolveProjectSlug('', ''), '');
});

test('toRootRelative resolves relative fallback paths and keeps absolute URLs', () => {
  assert.equal(toRootRelative('images/recipe/praroz-homepage.jpeg'), '/images/recipe/praroz-homepage.jpeg');
  assert.equal(toRootRelative('/images/a.png'), '/images/a.png');
  assert.equal(toRootRelative('https://res.cloudinary.com/demo/image/upload/a.jpg'), 'https://res.cloudinary.com/demo/image/upload/a.jpg');
  assert.equal(toRootRelative(''), '');
  assert.equal(toRootRelative(undefined), '');
});

// ---------------------------------------------------------------------------
// API data (requirements 1 and 8)
// ---------------------------------------------------------------------------

test('API data renders A.F. Bookstore and NimCircle', async () => {
  const af = await loadWithApi('af-bookstore', () => jsonResponse({ projects: API_PROJECTS }));
  assert.ok(af, 'A.F. Bookstore should resolve from the API');
  assert.ok(isRenderableProject(af));

  const html = renderProjectContent(af);
  assert.ok(html.includes('<h1 id="project-title">A.F. Bookstore</h1>'));
  assert.ok(html.includes('Technologies:'));
  assert.ok(html.includes('JavaScript, Node.js, MongoDB'));
  assert.ok(html.includes('E-commerce'));
  assert.ok(html.includes('Completed'));
  // Absolute (Cloudinary) image is preserved verbatim.
  assert.ok(html.includes('src="https://res.cloudinary.com/demo/image/upload/af-home.jpg"'));

  const nim = await loadWithApi('nimcircle', () => jsonResponse({ projects: API_PROJECTS }));
  assert.ok(nim, 'NimCircle should resolve from the API');
  assert.ok(renderProjectContent(nim).includes('NimCircle'));
  assert.equal(buildProjectMetadata(nim, SITE).canonical, `${SITE}/projects/nimcircle`);
});

test('project metadata and structured data correspond to the selected project', async () => {
  const af = await loadWithApi('af-bookstore', () => jsonResponse({ projects: API_PROJECTS }));
  const meta = buildProjectMetadata(af, SITE);
  const canonical = `${SITE}/projects/af-bookstore`;

  assert.equal(meta.title, 'A.F. Bookstore | IsaiahWebDev Portfolio');
  assert.equal(meta.description, 'An online bookstore with search and checkout.');
  assert.equal(meta.canonical, canonical);
  assert.equal(meta.robots, INDEX_ROBOTS);
  assert.equal(meta.image, 'https://res.cloudinary.com/demo/image/upload/af-home.jpg');
  assert.equal(meta.imageAlt, 'Homepage');

  const [softwareApp, breadcrumb] = meta.jsonLd;
  assert.equal(softwareApp['@type'], 'SoftwareApplication');
  assert.equal(softwareApp.name, 'A.F. Bookstore');
  assert.equal(softwareApp.url, 'https://af-bookstore.example.com');
  assert.equal(softwareApp.codeRepository, 'https://github.com/example/af-bookstore');
  assert.deepEqual(softwareApp.programmingLanguage, ['JavaScript', 'Node.js', 'MongoDB']);

  assert.equal(breadcrumb['@type'], 'BreadcrumbList');
  assert.equal(breadcrumb.itemListElement[2].item, canonical);

  // Falls back to the profile image when a project has no images.
  const sparse = { slug: 'sparse', title: 'Sparse', status: 'published', technologies: [], images: [] };
  assert.equal(buildProjectMetadata(sparse, SITE).image, `${SITE}/images/profile.jpg`);
});

// ---------------------------------------------------------------------------
// Fallback (requirements 2, 3 and 11)
// ---------------------------------------------------------------------------

test('API unavailable: the legacy fallback projects render correctly', async () => {
  for (const slug of LEGACY_SLUGS) {
    const project = await loadWithApi(slug, () => {
      throw new Error('network down');
    });
    assert.ok(project, `${slug} should resolve from the local fallback`);
    assert.ok(isRenderableProject(project), `${slug} should be published by default`);

    const html = renderProjectContent(project);
    assert.ok(html.includes(`<h1 id="project-title">${project.title}</h1>`));
    // Relative fallback images are root-relativized for the frontend origin.
    assert.ok(html.includes('src="/images/'));
    assert.ok(!html.includes('src="images/'));
  }
});

test('empty, invalid and non-OK API responses fall back to the local JSON', async () => {
  const cases = {
    'non-OK status': () => jsonResponse({ error: {} }, { status: 503 }),
    'empty list': () => jsonResponse({ projects: [] }),
    'invalid shape': () => jsonResponse({}),
    'non-JSON content type': () => jsonResponse({ projects: API_PROJECTS }, { contentType: 'text/html' }),
    'unusable entries': () => jsonResponse({ projects: [{ no: 'title' }] }),
  };

  for (const [label, handler] of Object.entries(cases)) {
    const project = await loadWithApi('recipe-submission-website', handler);
    assert.ok(project, `${label}: fallback project should resolve`);
    assert.equal(project.title, 'Recipe Submission Website');
  }
});

test('an unknown slug resolves to null and produces a noindex not-found state', async () => {
  const project = await loadWithApi('no-such-slug-xyz', () => jsonResponse({ projects: API_PROJECTS }));
  assert.equal(project, null);
  assert.equal(isRenderableProject(project), false);

  const html = renderNotFoundState();
  assert.ok(html.includes('Project not found'));
  assert.ok(html.includes('View all projects'));
  // The shell's default robots stays in force for unknown slugs.
  assert.equal(NOINDEX_ROBOTS, 'noindex, follow');
});

test('a draft project is not renderable on the public shell', () => {
  assert.equal(isRenderableProject({ status: 'draft', title: 'Hidden' }), false);
  assert.equal(isRenderableProject(null), false);
});

test('local development resolves the API as http://localhost:8080', async () => {
  assert.equal(resolveApiBase({ location: { hostname: 'localhost' } }), 'http://localhost:8080');
  assert.equal(resolveApiBase({ location: { hostname: '127.0.0.1' } }), 'http://localhost:8080');

  const restoreWindow = withWindow({ location: { hostname: 'localhost' } });
  const fetchStub = withFetch(() => jsonResponse({ projects: API_PROJECTS }));
  try {
    const project = await loadProjectBySlug('af-bookstore');
    assert.ok(project);
    assert.equal(fetchStub.calls[0], 'http://localhost:8080/api/content/projects');
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});

// ---------------------------------------------------------------------------
// Robustness (requirements 7 and 9)
// ---------------------------------------------------------------------------

test('missing optional fields and relative fallback images are handled safely', () => {
  const project = {
    slug: 'minimal',
    title: 'Minimal',
    shortDescription: 'Just a blurb.',
    technologies: [],
    images: [{ src: 'images/minimal/one.png', alt: '' }],
    status: 'published',
  };

  const html = renderProjectContent(project);
  assert.ok(html.includes('<h1 id="project-title">Minimal</h1>'));
  assert.ok(html.includes('src="/images/minimal/one.png"'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('null'));
  // Optional sections are omitted rather than rendered empty.
  assert.ok(!html.includes('Problem statement'));
  assert.ok(!html.includes('Key features'));
  assert.ok(!html.includes('Technologies:'));
  // No live/GitHub links, but the Back to Projects link is always present.
  assert.ok(html.includes('Back to Projects'));
  // No category/development badges when those fields are absent.
  assert.equal(renderProjectMeta(project), '');
});

test('project-supplied text is escaped in the body and metadata', () => {
  const hostile = {
    slug: 'hostile',
    title: '<script>alert(1)</script>',
    shortDescription: 'A "quote" & <b>bold</b>',
    technologies: [],
    images: [],
    status: 'published',
  };

  const html = renderProjectContent(hostile);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&quot;quote&quot; &amp; &lt;b&gt;bold&lt;/b&gt;'));

  const meta = buildProjectMetadata(hostile, SITE);
  assert.equal(meta.title, '<script>alert(1)</script> | IsaiahWebDev Portfolio');
  // Structured data is serialized inert; parsing it round-trips the raw title.
  const serialized = safeJsonLd(meta.jsonLd[0]);
  assert.ok(!serialized.includes('<'));
  assert.equal(JSON.parse(serialized).name, '<script>alert(1)</script>');
});

test('failure state offers a way back to the listing', () => {
  const html = renderFailureState();
  assert.ok(html.includes('Temporarily unavailable'));
  assert.ok(html.includes('href="/projects"'));
});

test('projectSummary prefers the current field over legacy names', () => {
  assert.equal(projectSummary({ shortDescription: 'current', description: 'legacy' }), 'current');
  assert.equal(projectSummary({ description: 'legacy' }), 'legacy');
  assert.equal(projectSummary({ summary: 'old' }), 'old');
  assert.equal(projectSummary({}), '');
});

test('DEFAULT_SITE_URL matches the deployed portfolio origin', () => {
  assert.equal(DEFAULT_SITE_URL, 'https://isaiahwebdev.onrender.com');
});

test('the fallback file is never requested when the API succeeds', async () => {
  const restoreWindow = withWindow({
    PORTFOLIO_API_BASE: SITE,
    location: { hostname: 'app.example.com' },
  });
  const fetchStub = withFetch((url) =>
    url.includes('/api/content/projects') ? jsonResponse({ projects: API_PROJECTS }) : jsonResponse(LOCAL_FALLBACK)
  );
  try {
    await loadProjectBySlug('af-bookstore');
    assert.ok(!fetchStub.calls.includes(LOCAL_URL));
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});
