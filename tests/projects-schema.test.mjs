import test from 'node:test';
import assert from 'node:assert/strict';

import {
  slugify,
  isValidUrl,
  escapeHtml,
  normalizeProject,
  normalizeProjects,
  publishedProjects,
  featuredProjects,
  projectPagePath,
} from '../js/projects-schema.js';

test('slugify produces stable, URL-safe slugs', () => {
  assert.equal(slugify('Recipe Submission Website'), 'recipe-submission-website');
  assert.equal(slugify('Fintech & Design'), 'fintech-and-design');
  assert.equal(slugify('  Café Déjà Vu  '), 'cafe-deja-vu');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(null), '');
});

test('isValidUrl only accepts http/https URLs', () => {
  assert.equal(isValidUrl('https://example.com'), true);
  assert.equal(isValidUrl('http://localhost:8080'), true);
  assert.equal(isValidUrl('ftp://example.com'), false);
  assert.equal(isValidUrl('images/recipe/x.jpeg'), false);
  assert.equal(isValidUrl(''), false);
  assert.equal(isValidUrl(undefined), false);
});

test('escapeHtml neutralizes markup', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
  assert.equal(escapeHtml("O'Brien & Co"), 'O&#39;Brien &amp; Co');
});

test('normalizeProject derives slug, status and featured defaults', () => {
  const project = normalizeProject({ title: 'My Project', description: 'Hello' }, 0);
  assert.equal(project.slug, 'my-project');
  assert.equal(project.status, 'published');
  assert.equal(project.featured, true);
  assert.deepEqual(project.technologies, []);
  assert.deepEqual(project.images, []);
});

test('normalizeProject is not featured by default for non-first entries', () => {
  const project = normalizeProject({ title: 'Second', description: 'x' }, 1);
  assert.equal(project.featured, false);
});

test('normalizeProject rejects entries without a usable title', () => {
  assert.equal(normalizeProject(null), null);
  assert.equal(normalizeProject({ description: 'no title' }), null);
  assert.equal(normalizeProject({ title: '   ' }), null);
});

test('normalizeProject drops non-http links and keeps valid ones', () => {
  const project = normalizeProject({
    title: 'Links',
    description: 'x',
    site: 'javascript:alert(1)',
    github: 'https://github.com/u/r',
  });
  assert.equal(project.site, '');
  assert.equal(project.github, 'https://github.com/u/r');
});

test('normalizeProject accepts string and object images', () => {
  const project = normalizeProject({
    title: 'Images',
    description: 'x',
    images: ['/a.png', { src: '/b.png', alt: 'B' }, { alt: 'no src' }],
  });
  assert.deepEqual(project.images, [
    { src: '/a.png', alt: '' },
    { src: '/b.png', alt: 'B' },
  ]);
});

test('normalizeProjects drops unusable entries and de-duplicates slugs', () => {
  const projects = normalizeProjects([
    { title: 'Same Title', description: 'a', order: 5 },
    { title: 'Same Title', description: 'b', order: 2 },
    { description: 'no title' },
    { title: 'Third', description: 'c', order: 9 },
  ]);
  assert.equal(projects.length, 3);
  const slugs = projects.map((p) => p.slug);
  assert.equal(new Set(slugs).size, 3);
  assert.deepEqual([...slugs].sort(), ['same-title', 'same-title-2', 'third']);
  // Sorted ascending by order.
  assert.deepEqual(projects.map((p) => p.title), ['Same Title', 'Same Title', 'Third']);
});

test('normalizeProjects tolerates non-array input', () => {
  assert.deepEqual(normalizeProjects(null), []);
  assert.deepEqual(normalizeProjects({}), []);
});

test('publishedProjects and featuredProjects filter by status/featured', () => {
  const projects = [
    { status: 'published', featured: true },
    { status: 'draft', featured: true },
    { status: 'published', featured: false },
  ];
  assert.equal(publishedProjects(projects).length, 2);
  assert.equal(featuredProjects(projects).length, 1);
});

test('projectPagePath builds an encoded site-relative path', () => {
  assert.equal(projectPagePath('my-project'), '/projects/my-project');
  assert.equal(projectPagePath('a b/c'), '/projects/a%20b%2Fc');
});
