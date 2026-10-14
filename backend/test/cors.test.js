const test = require('node:test');
const assert = require('node:assert');

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
 */
async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
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

test('Development: Allowed origin http://localhost:3000 receives CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  } finally {
    await testContext.close();
  }
});

test('Development: Allowed origin http://localhost:8080 receives CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      headers: { 'Origin': 'http://localhost:8080' }
    });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  } finally {
    await testContext.close();
  }
});

test('Development: Allowed origin http://127.0.0.1:3000 receives CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      headers: { 'Origin': 'http://127.0.0.1:3000' }
    });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
  } finally {
    await testContext.close();
  }
});

test('Development: Preflight for http://127.0.0.1:3000 returns 204 with CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://127.0.0.1:3000' }
    });
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
    assert.ok(response.headers.get('access-control-allow-methods'));
    assert.ok(response.headers.get('access-control-allow-headers'));
  } finally {
    await testContext.close();
  }
});

test('Disallowed origin does not receive Access-Control-Allow-Origin header', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      headers: { 'Origin': 'http://evil.com' }
    });
    // Disallowed origin should not receive CORS headers
    assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
  } finally {
    await testContext.close();
  }
});

test('Missing Origin header returns 403 with error envelope', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response, body } = await request(testContext.baseUrl, '/health');
    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.headers.get('content-type'), 'application/json');
    
    assert.deepStrictEqual(body.error, {
      code: 'FORBIDDEN',
      message: 'Origin header required',
      status: 403
    });
  } finally {
    await testContext.close();
  }
});

test('Allowed preflight to /health returns 204 with CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.ok(response.headers.get('access-control-allow-methods'));
    assert.ok(response.headers.get('access-control-allow-headers'));
  } finally {
    await testContext.close();
  }
});

test('Preflight to unknown path returns 404 without CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response, body } = await request(testContext.baseUrl, '/api/unknown', {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers.get('content-type'), 'application/json');
    assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
  } finally {
    await testContext.close();
  }
});

test('Missing Origin on preflight to /health returns 403', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response, body } = await request(testContext.baseUrl, '/health', {
      method: 'OPTIONS'
    });
    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.headers.get('content-type'), 'application/json');
    
    assert.deepStrictEqual(body.error, {
      code: 'FORBIDDEN',
      message: 'Origin header required',
      status: 403
    });
  } finally {
    await testContext.close();
  }
});

test('Disallowed origin on preflight does not receive CORS headers', async () => {
  const testContext = await startTestServer();
  
  try {
    const { response } = await request(testContext.baseUrl, '/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://evil.com' }
    });
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
  } finally {
    await testContext.close();
  }
});