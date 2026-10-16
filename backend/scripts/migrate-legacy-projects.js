#!/usr/bin/env node
/**
 * Additive migration of the legacy JSON projects into the CMS.
 *
 * The three projects in `data/projects.json` are preserved and, if they are not
 * already in the CMS, created through the existing authenticated admin API
 * (`POST /api/admin/projects`). Nothing is written by default: the script plans
 * the migration, prints what it would do, and exits.
 *
 * Safety:
 *   - Dry run unless `--apply` is passed.
 *   - Idempotent: projects whose slug already exists are skipped, never updated.
 *   - Never writes to MongoDB directly and never bypasses admin authentication.
 *   - Credentials are read from the environment and are never printed.
 *
 * Usage (from the repository root):
 *   # dry run against production (read-only)
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... node backend/scripts/migrate-legacy-projects.js
 *
 *   # create the missing projects
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... node backend/scripts/migrate-legacy-projects.js --apply
 *
 * Environment:
 *   PORTFOLIO_API_BASE  API origin (default https://isaiahwebdev-api.onrender.com)
 *   ADMIN_TOKEN         an existing admin bearer token (optional)
 *   ADMIN_USERNAME      admin username (used with ADMIN_PASSWORD to log in)
 *   ADMIN_PASSWORD      admin password
 *   MIGRATION_LOCAL_FILE  override the fallback JSON path (optional)
 */

'use strict';

const {
  DEFAULT_LOCAL_PATH,
  ADMIN_PROJECTS_PATH,
  readLocalProjects,
  planMigration,
} = require('../src/lib/legacy-migration');

const DEFAULT_API_BASE = 'https://isaiahwebdev-api.onrender.com';

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(base, username, password) {
  const response = await request(base, '/api/admin/login', {
    method: 'POST',
    body: { username, password },
  });
  if (!response.ok) {
    throw new Error(`Login failed (HTTP ${response.status}). No changes were made.`);
  }
  const data = await response.json();
  if (!data || typeof data.token !== 'string' || !data.token) {
    throw new Error('Login response did not contain a token. No changes were made.');
  }
  return data.token;
}

async function resolveToken(base) {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'Set ADMIN_TOKEN, or ADMIN_USERNAME and ADMIN_PASSWORD, to authenticate. No changes were made.'
    );
  }
  return login(base, username, password);
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const base = (process.env.PORTFOLIO_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  const localPath = process.env.MIGRATION_LOCAL_FILE || DEFAULT_LOCAL_PATH;

  const token = await resolveToken(base);

  const localProjects = readLocalProjects(localPath);

  const listResponse = await request(base, ADMIN_PROJECTS_PATH, { token });
  if (!listResponse.ok) {
    throw new Error(`Could not read existing projects (HTTP ${listResponse.status}). No changes were made.`);
  }
  const existing = (await listResponse.json()).projects || [];

  const { toCreate, skipped } = await planMigration({
    localProjects,
    existingProjects: existing,
  });

  console.log(`API base:        ${base}`);
  console.log(`Fallback file:   ${localPath}`);
  console.log(`Local projects:  ${localProjects.length}`);
  console.log(`Already in CMS:  ${skipped.length ? skipped.map((entry) => entry.slug).join(', ') : 'none'}`);
  console.log(`To create:       ${toCreate.length ? toCreate.map((project) => project.slug).join(', ') : 'none'}`);

  if (!apply) {
    console.log('\nDry run — nothing was written. Re-run with --apply to create the projects above.');
    return;
  }

  let created = 0;
  let conflicts = 0;
  let failed = 0;

  for (const payload of toCreate) {
    const response = await request(base, ADMIN_PROJECTS_PATH, {
      method: 'POST',
      token,
      body: payload,
    });

    if (response.status === 201) {
      created += 1;
      console.log(`created  ${payload.slug}`);
    } else if (response.status === 409) {
      conflicts += 1;
      console.log(`skipped  ${payload.slug} (already exists)`);
    } else {
      failed += 1;
      console.error(`failed   ${payload.slug} (HTTP ${response.status})`);
    }
  }

  console.log(`\nDone. created=${created} skipped=${conflicts} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs, login, resolveToken };
