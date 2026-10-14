const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'src', 'index.js');

/**
 * Spawn the API server process with given environment variables
 * Returns { process, stdout, stderr }
 */
function spawnServer(env = {}) {
  const childEnv = {
    ...process.env,
    ...env,
    CORS_ORIGINS: env.CORS_ORIGINS,
    NODE_ENV: env.NODE_ENV,
    PORT: '0',
    // Explicitly unset MongoDB-related vars to prevent connection attempts
    // that could hang during config validation tests
    MONGODB_URI: undefined,
    MONGODB_DNS_SERVERS: undefined,
  };
  
  Object.keys(childEnv).forEach(key => {
    if (childEnv[key] === undefined) {
      delete childEnv[key];
    }
  });
  
  return spawn('node', [serverPath], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

/**
 * Wait for process to exit or timeout
 */
function waitForExit(proc, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Process timed out after ${timeout}ms`));
    }, timeout);
    
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Test that process fails validation and exits with code 1 quickly
 */
async function testStartupFails(env, expectedErrorMessage) {
  const proc = spawnServer(env);
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1, `Expected exit code 1 but got ${result.code}`);
  if (expectedErrorMessage) {
    assert.ok(result.stderr.includes(expectedErrorMessage), 
      `Expected error "${expectedErrorMessage}" in stderr: ${result.stderr}`);
  }
}

/**
 * Test that process starts successfully (validation passes, server runs)
 * We wait briefly - if it exits with code 1, validation failed.
 * If it stays running, validation passed.
 */
async function testStartupSucceeds(env) {
  const proc = spawnServer(env);
  
  await new Promise((resolve, reject) => {
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Still running after 1.5s - validation passed
        proc.kill('SIGKILL');
        resolve({ success: true });
      }
    }, 1500);
    
    proc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (code === 1) {
          reject(new Error('Valid configuration should not fail validation'));
        } else {
          resolve({ success: true });
        }
      }
    });
    
    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

test('Production: Unset CORS_ORIGINS fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1, 'Expected exit code 1');
  assert.ok(result.stderr.includes('CORS_ORIGINS must be set in production'));
});

test('Production: Empty CORS_ORIGINS fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: '' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('CORS_ORIGINS must not be empty'));
});

test('Production: Whitespace-only CORS_ORIGINS fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: '   ' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('CORS_ORIGINS must not be empty'));
});

test('Production: Malformed origin URL fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'not-a-url' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('Invalid origin URL'));
});

test('Production: Wildcard origin fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://*.example.com' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('Wildcard origins not permitted'));
});

test('Production: Non-HTTP(S) protocol fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'ws://localhost:3000' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must use http: or https:'));
});

test('Production: Empty entry in comma-separated list fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com,,https://admin.example.com' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('contains empty entry'));
});

test('Production: Trailing slash fails canonical validation', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com/' });
  const result = await waitForExit(proc, 15000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must be canonical'));
});

test('Production: Explicit default port (http:80) fails canonical validation', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'http://app.example.com:80' });
  const result = await waitForExit(proc, 15000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must be canonical'));
});

test('Production: Explicit default port (https:443) fails canonical validation', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com:443' });
  const result = await waitForExit(proc, 15000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must be canonical'));
});

test('Production: Non-root path fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com/api' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must not contain a path'));
});

test('Production: Query string fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com?foo=1' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must not contain query string'));
});

test('Production: Fragment fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com#frag' });
  const result = await waitForExit(proc, 5000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must not contain fragment'));
});

test('Production: Credentials in origin fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'production', CORS_ORIGINS: 'https://user:pass@app.example.com' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('must not contain credentials'));
});

test('Production: Valid allowlist starts successfully', async () => {
  await testStartupSucceeds({
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://app.example.com,https://admin.example.com'
  });
});

test('Development: Unset CORS_ORIGINS uses defaults', async () => {
  await testStartupSucceeds({ NODE_ENV: 'development' });
});

test('Development: Empty CORS_ORIGINS fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'development', CORS_ORIGINS: '' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('CORS_ORIGINS must not be empty'));
});

test('Development: Whitespace-only CORS_ORIGINS fails startup', async () => {
  const proc = spawnServer({ NODE_ENV: 'development', CORS_ORIGINS: '   ' });
  const result = await waitForExit(proc, 10000);
  
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes('CORS_ORIGINS must not be empty'));
});

test('Development: Explicit valid origin starts successfully', async () => {
  await testStartupSucceeds({ 
    NODE_ENV: 'development', 
    CORS_ORIGINS: 'http://localhost:3000' 
  });
});