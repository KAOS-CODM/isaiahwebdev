import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTING_LIMIT,
  selectHomepageProjects,
  renderFeaturedProject,
  renderSupportingCard,
  buildHomepageWork,
  initHomepageWork,
} from '../js/project.js';
import { normalizeProjects } from '../js/projects-schema.js';

/**
 * Tests for the homepage "Selected Work" renderer (js/project.js).
 *
 * The render helpers are pure and the module's auto-init is guarded, so it can
 * be imported directly in Node. The loading path is exercised through the real
 * shared loader with the same fetch/window doubles used by
 * tests/projects-loader.test.mjs.
 */

const RAW_PROJECTS = [
  {
    title: 'Alpha',
    description: 'Alpha description',
    technologies: ['HTML', 'CSS'],
    featured: true,
    images: [{ src: '/images/alpha.jpg', alt: 'Alpha screenshot' }],
  },
  {
    title: 'Beta',
    description: 'Beta description',
    featured: true,
    images: [{ src: '/images/beta.jpg' }],
  },
  {
    title: 'Gamma',
    description: 'Gamma description',
    featured: true,
    images: [{ src: '/images/gamma.jpg' }],
  },
  {
    title: 'Delta',
    description: 'Delta description',
    featured: true,
    images: [{ src: '/images/delta.jpg' }],
  },
  {
    title: 'Epsilon',
    description: 'Epsilon description',
    featured: true,
    images: [{ src: '/images/epsilon.jpg' }],
  },
  {
    title: 'Zeta',
    description: 'Zeta description (not featured)',
    featured: false,
    images: [{ src: '/images/zeta.jpg' }],
  },
];

const PROJECTS = normalizeProjects(RAW_PROJECTS);

/** API origin used to exercise the API-first branch of the shared loader. */
const API_BASE = 'https://api.example.com';

function thumbCount(html) {
  return (html.match(/class="thumb"/g) || []).length;
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: (key) => (key.toLowerCase() === 'content-type' ? 'application/json' : null) },
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
  const restore = () => {
    globalThis.fetch = original;
  };
  restore.calls = calls;
  return restore;
}

function withWindow(win) {
  const original = globalThis.window;
  globalThis.window = win;
  return () => {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  };
}

test('selectHomepageProjects chooses the featured project and caps supporting projects', () => {
  const { featured, supporting } = selectHomepageProjects(PROJECTS);

  assert.equal(featured.slug, 'alpha');
  assert.equal(supporting.length, SUPPORTING_LIMIT);
  assert.deepEqual(
    supporting.map((project) => project.slug),
    ['beta', 'gamma', 'delta']
  );
});

test('selectHomepageProjects returns no selection when no project is featured', () => {
  const projects = normalizeProjects([
    { title: 'First', featured: false },
    { title: 'Second', featured: false },
  ]);

  assert.deepEqual(selectHomepageProjects(projects), { featured: null, supporting: [] });
});

test('selectHomepageProjects never fills supporting slots with non-featured projects', () => {
  const projects = normalizeProjects([
    { title: 'Plain', featured: false },
    { title: 'Lead', featured: true },
    { title: 'Another plain', featured: false },
    { title: 'Support', featured: true },
  ]);

  const { featured, supporting } = selectHomepageProjects(projects);

  assert.equal(featured.slug, 'lead');
  assert.deepEqual(
    supporting.map((project) => project.slug),
    ['support']
  );
});

test('selectHomepageProjects treats missing and non-boolean featured values as not featured', () => {
  const projects = normalizeProjects([
    { title: 'Missing' },
    { title: 'False', featured: false },
    { title: 'Null', featured: null },
    { title: 'String', featured: 'true' },
    { title: 'Number', featured: 1 },
  ]);

  assert.deepEqual(selectHomepageProjects(projects), { featured: null, supporting: [] });

  const { html } = buildHomepageWork(projects);
  assert.equal(html, '');
  for (const title of ['Missing', 'False', 'Null', 'String', 'Number']) {
    assert.ok(!html.includes(title), `${title} must not be rendered`);
  }
});

test('a single featured project renders as the lead with no supporting cards', () => {
  const projects = normalizeProjects([
    { title: 'Only', featured: true, images: [{ src: '/images/only.jpg' }] },
    { title: 'Plain', featured: false, images: [{ src: '/images/plain.jpg' }] },
  ]);

  const { featured, supporting, html, lightboxProjects } = buildHomepageWork(projects);

  assert.equal(featured.slug, 'only');
  assert.deepEqual(supporting, []);
  assert.match(html, /class="work-featured"/);
  assert.ok(!html.includes('class="work-grid"'));
  assert.ok(!html.includes('Plain'));
  assert.deepEqual(
    lightboxProjects.map((project) => project.slug),
    ['only']
  );
});

test('more than four featured projects render one lead and at most three supporting cards', () => {
  const { featured, supporting, html } = buildHomepageWork(PROJECTS);

  assert.equal(featured.slug, 'alpha');
  assert.deepEqual(
    supporting.map((project) => project.slug),
    ['beta', 'gamma', 'delta']
  );
  assert.equal(thumbCount(html), 4);
  assert.ok(!html.includes('Epsilon'));
  assert.ok(!html.includes('Zeta'));
});

test('selectHomepageProjects ignores unpublished projects and handles an empty list', () => {
  const projects = normalizeProjects([
    { title: 'Draft', status: 'draft' },
    { title: 'Live', status: 'published', featured: true },
  ]);

  assert.equal(selectHomepageProjects(projects).featured.slug, 'live');
  assert.deepEqual(selectHomepageProjects([]), { featured: null, supporting: [] });
});

test('renderFeaturedProject links to the project page and carries its media and labels', () => {
  const html = renderFeaturedProject(PROJECTS[0]);

  assert.match(html, /class="work-featured"/);
  assert.match(html, /href="\/project\?slug=alpha"/);
  assert.match(html, /class="thumb"/);
  assert.match(html, /class="work-tech"/);
  assert.ok(html.includes('<li>HTML</li>'));
  assert.ok(html.includes('Alpha description'));
  assert.ok(html.includes('Featured project'));
});

test('renderFeaturedProject includes live and source links only when present', () => {
  const [project] = normalizeProjects([
    {
      title: 'Linked',
      featured: true,
      site: 'https://example.com/app',
      github: 'https://github.com/example/app',
      images: [{ src: '/images/linked.jpg' }],
    },
  ]);

  const html = renderFeaturedProject(project);

  assert.ok(html.includes('href="https://example.com/app"'));
  assert.ok(html.includes('href="https://github.com/example/app"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));

  const [plain] = normalizeProjects([{ title: 'Plain', featured: true }]);
  assert.ok(!renderFeaturedProject(plain).includes('Live Demo'));
});

test('renderFeaturedProject escapes project text', () => {
  const [project] = normalizeProjects([
    { title: '<script>alert(1)</script>', featured: true },
  ]);

  const html = renderFeaturedProject(project);

  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderSupportingCard links to the project page', () => {
  const html = renderSupportingCard(PROJECTS[1]);

  assert.match(html, /class="work-card"/);
  assert.match(html, /href="\/project\?slug=beta"/);
  assert.match(html, /class="thumb"/);
  assert.ok(html.includes('Beta description'));
});

test('project imagery stays a lightbox trigger rather than a navigation link', () => {
  const featuredHtml = renderFeaturedProject(PROJECTS[0]);
  const cardHtml = renderSupportingCard(PROJECTS[1]);

  // The shared lightbox binds the thumbnail click and never calls
  // preventDefault, so wrapping the image in an anchor would navigate away
  // instead of opening the lightbox. The title/buttons are the page links.
  assert.match(featuredHtml, /<div\s+class="work-featured__media"/);
  assert.match(cardHtml, /<div\s+class="work-card__media"/);
  assert.ok(!/<a[^>]*class="work-featured__media"/.test(featuredHtml));
  assert.ok(!/<a[^>]*class="work-card__media"/.test(cardHtml));
});

test('a project without images renders no thumbnail and is left out of the lightbox list', () => {
  const projects = normalizeProjects([
    { title: 'Featured', featured: true, images: [{ src: '/images/f.jpg' }] },
    { title: 'No Image', images: [] },
  ]);

  const { html, lightboxProjects } = buildHomepageWork(projects);

  assert.equal(thumbCount(html), 1);
  assert.deepEqual(
    lightboxProjects.map((project) => project.slug),
    ['featured']
  );
});

test('buildHomepageWork orders the lightbox list to match the thumbnails in the markup', () => {
  const { featured, supporting, html, lightboxProjects } = buildHomepageWork(PROJECTS);

  assert.equal(featured.slug, 'alpha');
  assert.equal(supporting.length, SUPPORTING_LIMIT);
  assert.equal(thumbCount(html), lightboxProjects.length);
  assert.deepEqual(
    lightboxProjects.map((project) => project.slug),
    ['alpha', 'beta', 'gamma', 'delta']
  );
});

test('buildHomepageWork returns an empty result when there are no published projects', () => {
  assert.deepEqual(buildHomepageWork([]), {
    featured: null,
    supporting: [],
    html: '',
    lightboxProjects: [],
  });
});

test('initHomepageWork renders the fallback list and wires the lightbox', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: (id) => (id === 'projects-container' ? container : null) };
  let lightboxArg = null;
  const win = { initProjectsLightbox: (projects) => { lightboxArg = projects; } };

  const restoreWindow = withWindow({ location: { hostname: 'example.com' } });
  const restoreFetch = withFetch(() => jsonResponse(RAW_PROJECTS));

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
  }

  assert.match(container.innerHTML, /class="work-featured"/);
  assert.match(container.innerHTML, /class="work-grid"/);
  assert.equal(thumbCount(container.innerHTML), 4);
  assert.equal(lightboxArg.length, 4);
  assert.equal(lightboxArg[0].slug, 'alpha');
  // Non-featured and featured projects beyond the cap stay out of the markup.
  assert.ok(!container.innerHTML.includes('Zeta description'));
  assert.ok(!container.innerHTML.includes('Epsilon description'));
});

test('initHomepageWork shows only featured projects from API data', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: () => container };
  const win = { initProjectsLightbox: () => {} };
  const apiProjects = [
    { slug: 'api-lead', title: 'API Lead', description: 'Lead', featured: true, images: [{ src: '/images/lead.jpg' }] },
    { slug: 'api-plain', title: 'API Plain', description: 'Plain', featured: false, images: [{ src: '/images/plain.jpg' }] },
    { slug: 'api-support', title: 'API Support', description: 'Support', featured: true, images: [{ src: '/images/support.jpg' }] },
  ];

  const restoreWindow = withWindow({
    PORTFOLIO_API_BASE: API_BASE,
    location: { hostname: 'app.example.com' },
  });
  const restoreFetch = withFetch((url) => {
    if (url.includes('/api/content/projects')) {
      return jsonResponse({ projects: apiProjects });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
  }

  assert.deepEqual(restoreFetch.calls, [`${API_BASE}/api/content/projects`]);
  assert.ok(container.innerHTML.includes('API Lead'));
  assert.ok(container.innerHTML.includes('API Support'));
  assert.ok(!container.innerHTML.includes('API Plain'), 'non-featured must not be rendered');
});

test('initHomepageWork shows the empty state when API data has no featured project', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: () => container };
  const win = {};

  const restoreWindow = withWindow({
    PORTFOLIO_API_BASE: API_BASE,
    location: { hostname: 'app.example.com' },
  });
  const restoreFetch = withFetch((url) => {
    if (url.includes('/api/content/projects')) {
      return jsonResponse({
        projects: [
          { slug: 'plain', title: 'Plain', description: 'Plain', featured: false, images: [{ src: '/images/plain.jpg' }] },
        ],
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
  }

  // The API answered with usable data, so no fallback is allowed to smuggle a
  // non-featured project into Selected Work.
  assert.ok(!restoreFetch.calls.includes('/data/projects.json'));
  assert.match(container.innerHTML, /no-projects/);
  assert.ok(!container.innerHTML.includes('Plain'));
});

test('initHomepageWork falls back to the JSON list after an API failure and stays featured-only', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: () => container };
  const win = { initProjectsLightbox: () => {} };
  const fallback = [
    { title: 'Fallback Lead', description: 'Lead', featured: true, images: [{ src: '/images/fl.jpg' }] },
    { title: 'Fallback Plain', description: 'Plain', featured: false, images: [{ src: '/images/fp.jpg' }] },
    { title: 'Fallback Support', description: 'Support', featured: true, images: [{ src: '/images/fs.jpg' }] },
  ];
  const originalConsoleWarn = console.warn;
  console.warn = () => {};

  const restoreWindow = withWindow({
    PORTFOLIO_API_BASE: API_BASE,
    location: { hostname: 'app.example.com' },
  });
  const restoreFetch = withFetch((url) => {
    if (url.includes('/api/content/projects')) throw new Error('offline');
    if (url.includes('/data/projects.json')) return jsonResponse(fallback);
    throw new Error(`unexpected fetch: ${url}`);
  });

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
    console.warn = originalConsoleWarn;
  }

  assert.ok(restoreFetch.calls.includes('/data/projects.json'), 'fallback must be requested');
  assert.ok(container.innerHTML.includes('Fallback Lead'));
  assert.ok(container.innerHTML.includes('Fallback Support'));
  assert.ok(!container.innerHTML.includes('Fallback Plain'), 'fallback must not show non-featured work');
});

test('initHomepageWork shows the empty state when the JSON fallback has no featured project', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: () => container };
  const win = {};

  const restoreWindow = withWindow({ location: { hostname: 'example.com' } });
  const restoreFetch = withFetch(() =>
    jsonResponse([
      { title: 'Published but not featured', featured: false, images: [{ src: '/images/x.jpg' }] },
      { title: 'Also plain', featured: false },
    ])
  );

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
  }

  assert.match(container.innerHTML, /no-projects/);
  assert.ok(!container.innerHTML.includes('Published but not featured'));
  assert.ok(!container.innerHTML.includes('Also plain'));
});

test('initHomepageWork shows an empty state when only unpublished projects exist', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: () => container };
  const win = {};

  const restoreWindow = withWindow({ location: { hostname: 'example.com' } });
  const restoreFetch = withFetch(() => jsonResponse([{ title: 'Draft', status: 'draft' }]));

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
  }

  assert.match(container.innerHTML, /no-projects/);
});

test('initHomepageWork shows an error state when loading fails', async () => {
  const container = { innerHTML: '' };
  const doc = { getElementById: () => container };
  const win = {};
  const originalConsoleError = console.error;
  console.error = () => {};

  const restoreWindow = withWindow({ location: { hostname: 'example.com' } });
  const restoreFetch = withFetch(() => { throw new Error('offline'); });

  try {
    await initHomepageWork(doc, win);
  } finally {
    restoreFetch();
    restoreWindow();
    console.error = originalConsoleError;
  }

  assert.match(container.innerHTML, /class="error"/);
});

test('initHomepageWork is a no-op when the container is missing', async () => {
  const doc = { getElementById: () => null };
  await assert.doesNotReject(initHomepageWork(doc, {}));
});
