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

test('GET /health returns 200 with JSON', async () => {
  const { response, body } = await request(testContext.baseUrl, '/health');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
  
  assert.strictEqual(body.ok, true);
  assert.ok(typeof body.timestamp === 'string');
  assert.ok(!isNaN(Date.parse(body.timestamp)));
  assert.ok(typeof body.uptime === 'number' && body.uptime >= 0);
});

test('GET /health returns correct content-type', async () => {
  const { response } = await request(testContext.baseUrl, '/health');
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
});

test('POST /health returns 405', async () => {
  const { response, body } = await request(testContext.baseUrl, '/health', { method: 'POST' });
  assert.strictEqual(response.status, 405);
  assert.strictEqual(response.headers.get('content-type'), 'application/json');
  
  assert.deepStrictEqual(body.error, {
    code: 'METHOD_NOT_ALLOWED',
    message: 'Method not allowed',
    status: 405
  });
});

test('PUT /health returns 405', async () => {
  const { response } = await request(testContext.baseUrl, '/health', { method: 'PUT' });
  assert.strictEqual(response.status, 405);
});

test('DELETE /health returns 405', async () => {
  const { response } = await request(testContext.baseUrl, '/health', { method: 'DELETE' });
  assert.strictEqual(response.status, 405);
});

test('PATCH /health returns 405', async () => {
  const { response } = await request(testContext.baseUrl, '/health', { method: 'PATCH' });
  assert.strictEqual(response.status, 405);
});