import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  featuredProjects,
  normalizeProjects,
  projectPagePath,
  publishedProjects,
} from '../js/projects-schema.js';
import { SUPPORTING_LIMIT, buildHomepageWork } from '../js/project.js';
import {
  GENERATED_COMMENT,
  MARKERS,
  NO_PROJECTS_MARKUP,
  SITE_ORIGIN,
  loadSourceProjects,
  renderHomepageMarkup,
  renderProjectListMarkup,
  renderProjectsStructuredData,
} from '../scripts/generate-static-projects.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'production-projects-api.json');

const fixture = JSON.parse(await readFile(FIXTURE, 'utf8'));
const projects = normalizeProjects(fixture.projects);
const published = publishedProjects(projects);

const [projectsHtml, indexHtml] = await Promise.all([
  readFile(path.join(ROOT, 'projects.html'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8'),
]);

function region(source, markers) {
  const [startMarker, endMarker] = markers;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start !== -1, `missing start marker ${startMarker}`);
  assert.ok(end > start, `missing end marker ${endMarker}`);
  return source.slice(start + startMarker.length, end);
}

function withoutGeneratedComment(value) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(GENERATED_COMMENT, '')
    .trim();
}

function detailSlugs(html) {
  return [...html.matchAll(/href="\/project\?slug=([^"]+)"/g)]
    .map((match) => decodeURIComponent(match[1]));
}

function unique(values) {
  return [...new Set(values)];
}

const listingRegion = region(projectsHtml, MARKERS.listing);
const homepageRegion = region(indexHtml, MARKERS.homepage);
const schemaRegion = region(projectsHtml, MARKERS.schema);

test('projects.html ships initial cards for every published project in shared order', () => {
  const actual = withoutGeneratedComment(listingRegion);

  assert.equal(actual, renderProjectListMarkup(projects).trim());
  assert.equal(
    (actual.match(/class="project-card/g) || []).length,
    published.length
  );
  assert.deepEqual(detailSlugs(actual), published.map((project) => project.slug));
  assert.ok(published.length > 0, 'fixture must contain published projects');

  // Every link is the approved query-string detail route, and no legacy
  // path-segment detail route is emitted.
  for (const href of actual.matchAll(/href="([^"]+)"/g)) {
    assert.match(href[1], /^\/project\?slug=[^"&]+$/);
  }
  assert.doesNotMatch(actual, /href="\/projects\//);
});

test('index.html ships only explicitly featured projects in Selected Work', () => {
  const actual = withoutGeneratedComment(homepageRegion);
  const expected = buildHomepageWork(projects);
  const featured = featuredProjects(projects);

  assert.equal(actual, expected.html.trim());
  assert.ok(expected.featured, 'fixture must contain a featured project');

  const slugs = unique(detailSlugs(actual));
  assert.deepEqual(
    slugs,
    [expected.featured, ...expected.supporting].map((project) => project.slug)
  );
  assert.deepEqual(
    slugs,
    featured.slice(0, 1 + SUPPORTING_LIMIT).map((project) => project.slug)
  );

  // Projects that are not explicitly featured never fill homepage slots.
  for (const project of published.filter((item) => item.featured !== true)) {
    assert.ok(!slugs.includes(project.slug), `${project.slug} must not be featured`);
  }

  // The obsolete placeholder and its dead fragment links are gone.
  assert.doesNotMatch(actual, /PRAROZ Recipe Platform/);
  assert.doesNotMatch(actual, /\/projects#praroz/);
});

test('static markup and browser hydration render the same cards and URLs', () => {
  // The static regions are produced by the exact render functions hydration
  // uses, so a mismatch here means the committed HTML is stale.
  assert.equal(
    withoutGeneratedComment(listingRegion),
    renderProjectListMarkup(projects).trim()
  );
  assert.equal(
    withoutGeneratedComment(homepageRegion),
    renderHomepageMarkup(projects)
  );
});

test('listing structured data describes exactly the projects presented', () => {
  const script = schemaRegion.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  assert.ok(script, 'expected a generated JSON-LD block');

  const data = JSON.parse(script[1]);
  assert.equal(data['@type'], 'ItemList');
  assert.equal(data.numberOfItems, published.length);
  assert.equal(data.itemListElement.length, published.length);

  const cardTitles = [
    ...withoutGeneratedComment(listingRegion).matchAll(
      /<h3[^>]*>\s*([^<]+?)\s*<\/h3>/g
    ),
  ].map((match) => match[1]);

  assert.deepEqual(
    data.itemListElement.map((entry) => entry.item.name),
    cardTitles
  );

  published.forEach((project, index) => {
    const entry = data.itemListElement[index];
    assert.equal(entry.position, index + 1);
    assert.equal(entry.item.name, project.title);
    assert.equal(
      entry.item.url,
      `${SITE_ORIGIN}${projectPagePath(project.slug)}`
    );
    if (project.images?.[0]?.src) {
      assert.match(entry.item.image, /^https?:\/\//);
    }
    assert.equal(entry.item.codeRepository, undefined);
    assert.equal(entry.item.sameAs, undefined);
  });

  // The old hard-coded records and their dead external URLs are removed.
  assert.doesNotMatch(schemaRegion, /#praroz|#kaossub|#kaostech/);
  assert.doesNotMatch(schemaRegion, /https:\/\/(praroz|kaossub|kaostech)\.onrender\.com/);
});

test('generated containers opt out of stale local-fallback hydration', () => {
  assert.match(
    projectsHtml,
    /<div\b[^>]*id="projects-container-full"[^>]*data-static-projects="true"/
  );
  assert.match(
    indexHtml,
    /<div\b[^>]*id="projects-container"[^>]*data-static-featured="true"/
  );
});

test('draft projects and non-boolean featured values are excluded', () => {
  const mixed = normalizeProjects([
    ...fixture.projects,
    {
      title: 'Draft Project',
      slug: 'draft-project',
      status: 'draft',
      featured: true,
      shortDescription: 'Draft project description',
      images: [{ src: '/images/draft.jpg', alt: 'Draft' }],
    },
    {
      title: 'String Featured',
      slug: 'string-featured',
      status: 'published',
      featured: 'true',
      shortDescription: 'String featured description',
      images: [{ src: '/images/string.jpg', alt: 'String' }],
    },
  ]);

  const listing = renderProjectListMarkup(mixed);
  const homepage = renderHomepageMarkup(mixed);
  const structuredData = renderProjectsStructuredData(mixed);

  assert.doesNotMatch(listing, /draft-project/);
  assert.doesNotMatch(homepage, /draft-project/);
  assert.doesNotMatch(structuredData, /draft-project/);

  // Published but not explicitly featured: listing only.
  assert.match(listing, /String Featured/);
  assert.doesNotMatch(homepage, /String Featured/);
});

test('empty and unavailable data fail safely', async () => {
  assert.equal(renderProjectListMarkup([]), NO_PROJECTS_MARKUP);
  assert.equal(renderHomepageMarkup([]), NO_PROJECTS_MARKUP);
  assert.equal(renderProjectsStructuredData([]), '');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'static-projects-'));
  try {
    const emptyPath = path.join(directory, 'empty.json');
    await writeFile(emptyPath, JSON.stringify({ projects: [] }), 'utf8');
    await assert.rejects(
      loadSourceProjects({ inputPath: emptyPath }),
      /NO_USABLE_PROJECTS/
    );

    const invalidPath = path.join(directory, 'invalid.json');
    await writeFile(invalidPath, JSON.stringify({ nope: true }), 'utf8');
    await assert.rejects(
      loadSourceProjects({ inputPath: invalidPath }),
      /API_INVALID_SHAPE/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('committed HTML matches a fresh generation from the recorded API response', async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      'scripts/generate-static-projects.mjs',
      '--input',
      FIXTURE,
      '--check',
    ],
    { cwd: ROOT }
  );

  assert.match(stdout, /up to date/i);
});
