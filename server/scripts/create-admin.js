'use strict';

/**
 * scripts/create-admin.js — one-time first-administrator bootstrap (Gate 2 Phase 1).
 *
 *   ADMIN_SETUP_TOKEN=<one-time-secret> node --env-file=api/.env server/scripts/create-admin.js
 *
 * Reads the setup token, username, and password interactively without echo.
 * Refuses when stdin is not a TTY, when the setup token mismatches, when the
 * password is too short, or when an administrator already exists. Prints only
 * fixed status codes — never usernames, tokens, or passwords.
 * Exit codes: 0 ok, 2 configuration/validation error, 1 operational failure.
 */

const readline = require('node:readline');
const { createMongoPool, toSafeDbError } = require('../lib/mongo');
const { hashPassword } = require('../lib/password');
const { bootstrapAdmin } = require('../lib/admin-bootstrap');

function promptHidden(query) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('Interactive terminal required.'));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (chunk) => {
      const text = String(chunk);
      if (text === '\r' || text === '\n' || text === '\u0004') return;
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(query);
    };
    process.stdin.on('data', onData);
    rl.question(query, (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(env = process.env) {
  let username = '';
  let password = '';
  let providedToken = '';
  try {
    providedToken = await promptHidden('Setup token: ');
    username = await promptHidden('Admin username: ');
    password = await promptHidden('Admin password (min 12 chars): ');
    const confirm = await promptHidden('Confirm password: ');
    if (confirm !== password) {
      console.error(JSON.stringify({ ok: false, error: { code: 'SETUP_INVALID', message: 'Setup failed.' } }));
      process.exitCode = 2;
      return;
    }
  } catch {
    console.error(JSON.stringify({ ok: false, error: { code: 'SETUP_INVALID', message: 'Setup failed.' } }));
    process.exitCode = 2;
    return;
  }
  let db;
  try {
    db = await createMongoPool({ env }).getDb();
  } catch (err) {
    const safe = toSafeDbError(err);
    console.error(JSON.stringify({ ok: false, error: { code: safe.code, message: safe.message } }));
    process.exitCode = 2;
    return;
  }
  try {
    const result = await bootstrapAdmin({
      db,
      username,
      password,
      providedToken,
      expectedToken: env.ADMIN_SETUP_TOKEN,
      hasher: { hash: (pw) => hashPassword(pw) },
    });
    if (!result.ok) {
      console.error(JSON.stringify({ ok: false, error: { code: result.code, message: 'Setup failed.' } }));
      process.exitCode = result.code === 'ADMIN_EXISTS' ? 1 : 2;
      return;
    }
    console.log(JSON.stringify({ ok: true }));
  } catch {
    console.error(JSON.stringify({ ok: false, error: { code: 'SETUP_FAILED', message: 'Setup failed.' } }));
    process.exitCode = 1;
  } finally {
    username = '';
    password = '';
    providedToken = '';
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
