const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

/**
 * Start the API server on an ephemeral port for testing.
 * Returns { baseUrl, close: Function }
 */
async function startTestServer() {
  const { createServer } = require('../src/index.js');
  
  const server = createServer();
  
  await new Promise((resolve) => {
    server.listen(0, () => {
      resolve();
    });
  });
  
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  
  return {
    baseUrl,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

/**
 * Make HTTP request to test server
 * By default includes allowed Origin header for CORS
 */
async function request(baseUrl, path, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Origin': 'http://localhost:3000' // Default allowed origin for tests
  };
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    },
    body: options.body
  });
  
  let body;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }
  
  return { response, body };
}

let testContext = {};

test.before(async () => {
  testContext = await startTestServer();
});

test.after(async () => {
  if (testContext.close) {
    await testContext.close();
  }
});

test('GET unknown path returns 404 with JSON error envelope', async () => {
  const { response, body } = await request(testContext.baseUrl, '/api/unknown');
  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
  
  assert.deepStrictEqual(body.error, {
    code: 'NOT_FOUND',
    message: 'Route not found',
    status: 404
  });
});

test('POST unknown path returns 404', async () => {
  const { response, body } = await request(testContext.baseUrl, '/api/unknown', { method: 'POST' });
  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
  
  assert.deepStrictEqual(body.error, {
    code: 'NOT_FOUND',
    message: 'Route not found',
    status: 404
  });
});

test('PUT unknown path returns 404', async () => {
  const { response } = await request(testContext.baseUrl, '/api/unknown', { method: 'PUT' });
  assert.strictEqual(response.status, 404);
});

test('DELETE unknown path returns 404', async () => {
  const { response } = await request(testContext.baseUrl, '/api/unknown', { method: 'DELETE' });
  assert.strictEqual(response.status, 404);
});

test('PATCH unknown path returns 404', async () => {
  const { response } = await request(testContext.baseUrl, '/api/unknown', { method: 'PATCH' });
  assert.strictEqual(response.status, 404);
});

test('OPTIONS unknown path returns 404', async () => {
  const { response, body } = await request(testContext.baseUrl, '/api/unknown', { method: 'OPTIONS' });
  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
  
  assert.deepStrictEqual(body.error, {
    code: 'NOT_FOUND',
    message: 'Route not found',
    status: 404
  });
});

test('GET /unknown returns 404 (not /health)', async () => {
  const { response } = await request(testContext.baseUrl, '/unknown');
  assert.strictEqual(response.status, 404);
});

test('GET /api returns 404', async () => {
  const { response } = await request(testContext.baseUrl, '/api');
  assert.strictEqual(response.status, 404);
});

test('Unknown routes return JSON, not HTML', async () => {
  const { response, body } = await request(testContext.baseUrl, '/api/unknown');
  
  // Should be valid JSON
  assert.ok(typeof body === 'object');
  
  // Should not contain HTML
  const bodyStr = JSON.stringify(body);
  assert.ok(!bodyStr.includes('<html'));
  assert.ok(!bodyStr.includes('<!DOCTYPE'));
  assert.ok(!bodyStr.includes('<body'));
});

test('OPTIONS /health returns 204 with CORS headers (allowed origin)', async () => {
  const { response } = await request(testContext.baseUrl, '/health', {
    method: 'OPTIONS',
    headers: { 'Origin': 'http://localhost:3000' }
  });
  assert.strictEqual(response.status, 204);
  assert.strictEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('OPTIONS /unknown returns 404', async () => {
  const { response, body } = await request(testContext.baseUrl, '/api/unknown', {
    method: 'OPTIONS'
  });
  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
  
  // Should not have CORS headers for unknown path
  assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
});