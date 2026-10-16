const test = require('node:test');
const assert = require('node:assert');

const {
  DEFAULT_LOCAL_PATH,
  ADMIN_PROJECTS_PATH,
  readLocalProjects,
  toCreatePayload,
  planMigration,
} = require('../src/lib/legacy-migration.js');

/**
 * Test suite for the additive legacy-project migration.
 * Uses the real committed fallback and in-memory doubles - no network,
 * no database and no writes.
 */

const EXPECTED_SLUGS = [
  'recipe-submission-website',
  'fintech-multipurpose-website',
  'kaostech-corporate-website',
];

test('the fallback file is preserved and readable', () => {
  const projects = readLocalProjects();
  assert.strictEqual(projects.length, 3);
  assert.deepStrictEqual(
    projects.map((project) => project.title),
    ['Recipe Submission Website', 'Fintech Multipurpose Website', 'Kaostech Corporate Website']
  );
});

test('readLocalProjects tolerates missing or non-array payloads', () => {
  assert.deepStrictEqual(readLocalProjects('/nonexistent', () => '{}'), []);
  assert.deepStrictEqual(readLocalProjects('/nonexistent', () => 'null'), []);
  assert.deepStrictEqual(readLocalProjects('/nonexistent', () => '"nope"'), []);
});

test('ADMIN_PROJECTS_PATH points at the existing authenticated write endpoint', () => {
  assert.strictEqual(ADMIN_PROJECTS_PATH, '/api/admin/projects');
});

test('the plan derives stable slugs through the shared schema', async () => {
  const { toCreate, skipped } = await planMigration({
    localProjects: readLocalProjects(),
    existingProjects: [],
  });

  assert.strictEqual(skipped.length, 0);
  assert.deepStrictEqual(
    toCreate.map((project) => project.slug),
    EXPECTED_SLUGS
  );
});

test('toCreatePayload maps legacy fields to the canonical CMS contract', async () => {
  const [recipe] = readLocalProjects();
  const { toCreate } = await planMigration({ localProjects: [recipe], existingProjects: [] });
  const payload = toCreate[0];

  assert.strictEqual(payload.title, 'Recipe Submission Website');
  assert.strictEqual(payload.slug, 'recipe-submission-website');
  assert.strictEqual(payload.shortDescription, recipe.description);
  assert.strictEqual(payload.status, 'published');
  assert.strictEqual(payload.liveUrl, recipe.site);
  assert.strictEqual(payload.githubUrl, recipe.github);
  assert.deepStrictEqual(payload.technologies, recipe.technologies);
  assert.strictEqual(payload.images.length, 5);
  assert.strictEqual(payload.images[0].src, 'images/recipe/praroz-homepage.jpeg');

  // Additive only: no order/featured (so existing projects and the featured
  // homepage entry are untouched) and no stored metadata.
  assert.strictEqual('order' in payload, false);
  assert.strictEqual('featured' in payload, false);
  assert.strictEqual('_id' in payload, false);
  assert.strictEqual('createdAt' in payload, false);
  assert.strictEqual('updatedAt' in payload, false);
});

test('existing CMS projects are skipped, never returned for creation', async () => {
  const existing = [
    { slug: 'af-bookstore', title: 'A.F. Bookstore', status: 'published' },
    { slug: 'recipe-submission-website', title: 'Recipe Submission Website', status: 'published' },
  ];

  const { toCreate, skipped } = await planMigration({
    localProjects: readLocalProjects(),
    existingProjects: existing,
  });

  assert.deepStrictEqual(
    toCreate.map((project) => project.slug),
    ['fintech-multipurpose-website', 'kaostech-corporate-website']
  );
  assert.deepStrictEqual(skipped, [{ slug: 'recipe-submission-website', reason: 'already-in-cms' }]);
});

test('existing records are matched even when only a title is stored', async () => {
  const existing = [{ title: 'Recipe Submission Website', description: 'legacy' }];
  const { toCreate, skipped } = await planMigration({
    localProjects: readLocalProjects(),
    existingProjects: existing,
  });

  assert.strictEqual(skipped.length, 1);
  assert.ok(!toCreate.some((project) => project.slug === 'recipe-submission-website'));
});

test('the migration is repeatable: re-running after a successful run creates nothing', async () => {
  const localProjects = readLocalProjects();

  const first = await planMigration({ localProjects, existingProjects: [] });
  assert.strictEqual(first.toCreate.length, 3);

  // After applying, the created payloads are the projects already in the CMS.
  const second = await planMigration({
    localProjects,
    existingProjects: first.toCreate,
  });

  assert.strictEqual(second.toCreate.length, 0);
  assert.deepStrictEqual(
    second.skipped.map((entry) => entry.slug),
    EXPECTED_SLUGS
  );
});

test('the plan never returns two projects with the same slug', async () => {
  const localProjects = readLocalProjects();
  const { toCreate } = await planMigration({
    localProjects: [...localProjects, ...localProjects],
    existingProjects: [],
  });

  const slugs = toCreate.map((project) => project.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length);
});

test('a fully migrated CMS leaves nothing to create', async () => {
  const existing = EXPECTED_SLUGS.map((slug) => ({ slug, title: slug, status: 'published' }));
  const { toCreate, skipped } = await planMigration({
    localProjects: readLocalProjects(),
    existingProjects: existing,
  });

  assert.strictEqual(toCreate.length, 0);
  assert.strictEqual(skipped.length, 3);
});
