import test from 'node:test';
import assert from 'node:assert';

import { createAdminApi, AdminApiError } from '../js/admin-api.js';

/**
 * Unit tests for the DOM-free admin API client. `fetch` is injected, so no
 * network, browser or real credentials are involved.
 */

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key) => (key.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(body, { status = 200, contentType = 'text/html' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key) => (key.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => {
      throw new Error('not json');
    },
    text: async () => body,
  };
}

function withFetch(handler) {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.test',
    fetch: async (url, init) => {
      calls.push({ url: String(url), ...(init || {}) });
      return handler(String(url), init || {});
    },
  });
  return { api, calls };
}

test('login posts JSON with credentials and no Authorization header', async () => {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.com/',
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return jsonResponse({ expiresAt: 'later', username: 'owner' });
    },
  });

  const result = await api.login('owner', 'secret-password');
  assert.strictEqual(result.username, 'owner');

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.example.com/api/admin/login');
  assert.strictEqual(calls[0].method, 'POST');
  assert.strictEqual(calls[0].credentials, 'include');
  assert.strictEqual(calls[0].headers['Content-Type'], 'application/json');
  assert.strictEqual(headersOf(calls[0]).Authorization, undefined);
  assert.deepStrictEqual(JSON.parse(calls[0].body), {
    username: 'owner',
    password: 'secret-password',
  });
});

test('bootstrapStatus fetches the public setup status without a token', async () => {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return jsonResponse({ setupRequired: true });
    },
  });

  const status = await api.bootstrapStatus();
  assert.deepStrictEqual(status, { setupRequired: true });
  assert.strictEqual(calls[0].url, 'https://api.example.com/api/admin/bootstrap');
  assert.strictEqual(calls[0].method, 'GET');
  assert.strictEqual(calls[0].credentials, 'include');
  assert.strictEqual(headersOf(calls[0]).Authorization, undefined);
});

test('setup posts the new credentials with credentials and no token', async () => {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return jsonResponse({ expiresAt: 'later', username: 'owner' }, { status: 201 });
    },
  });

  const result = await api.setup('owner', 'a-very-strong-password');
  assert.strictEqual(result.username, 'owner');
  assert.strictEqual(calls[0].url, 'https://api.example.com/api/admin/setup');
  assert.strictEqual(calls[0].method, 'POST');
  assert.strictEqual(calls[0].credentials, 'include');
  assert.strictEqual(headersOf(calls[0]).Authorization, undefined);
  assert.deepStrictEqual(JSON.parse(calls[0].body), {
    username: 'owner',
    password: 'a-very-strong-password',
  });
});

test('authenticated calls use the session cookie and the right verb/path', async () => {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return jsonResponse({ ok: true, projects: [] });
    },
  });

  await api.session();
  await api.listProjects();
  await api.getProject('my project');
  await api.createProject({ title: 'New' });
  await api.updateProject('my-project', { title: 'Updated' });
  await api.deleteProject('my-project');
  await api.publishProject('my-project');
  await api.unpublishProject('my-project');

  assert.deepStrictEqual(
    calls.map((c) => [c.method, c.url.replace('https://api.example.com', '')]),
    [
      ['GET', '/api/admin/session'],
      ['GET', '/api/admin/projects'],
      ['GET', '/api/admin/projects/my%20project'],
      ['POST', '/api/admin/projects'],
      ['PUT', '/api/admin/projects/my-project'],
      ['DELETE', '/api/admin/projects/my-project'],
      ['POST', '/api/admin/projects/my-project/publish'],
      ['POST', '/api/admin/projects/my-project/unpublish'],
    ]
  );

  for (const call of calls) {
    assert.strictEqual(call.credentials, 'include');
    assert.strictEqual(headersOf(call).Authorization, undefined);
  }

  assert.deepStrictEqual(JSON.parse(calls[3].body), { title: 'New' });
  assert.strictEqual(calls[5].body, undefined);
});

test('previewHtml requests HTML text with credentials and no bearer token', async () => {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return textResponse('<html>preview</html>');
    },
  });

  const html = await api.previewHtml('my-project');
  assert.strictEqual(html, '<html>preview</html>');
  assert.strictEqual(calls[0].url, 'https://api.example.com/api/admin/projects/my-project/preview');
  assert.strictEqual(calls[0].credentials, 'include');
  assert.strictEqual(headersOf(calls[0]).Authorization, undefined);
});

test('API errors become AdminApiError with status and code', async () => {
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async () => jsonResponse({ error: { code: 'SLUG_CONFLICT', message: 'duplicate' } }, { status: 409 }),
  });

  await assert.rejects(
    () => api.createProject({ title: 'x' }),
    (err) => {
      assert.ok(err instanceof AdminApiError);
      assert.strictEqual(err.status, 409);
      assert.strictEqual(err.code, 'SLUG_CONFLICT');
      assert.strictEqual(err.message, 'duplicate');
      return true;
    }
  );
});

test('the client exposes no token handling API (cookie-only auth)', () => {
  const api = createAdminApi({ base: 'https://api.example.com', fetch: async () => jsonResponse({}) });
  assert.strictEqual(typeof api.setToken, 'undefined');
  assert.strictEqual(typeof api.getToken, 'undefined');
  assert.strictEqual(typeof api.clearToken, 'undefined');
});

test('logout posts to the server so the session cookie is cleared', async () => {
  const calls = [];
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return jsonResponse({ ok: true });
    },
  });

  await api.logout();
  assert.strictEqual(calls[0].url, 'https://api.example.com/api/admin/logout');
  assert.strictEqual(calls[0].method, 'POST');
  assert.strictEqual(calls[0].credentials, 'include');
  assert.strictEqual(headersOf(calls[0]).Authorization, undefined);
});

test('a 401 from the session endpoint surfaces as an unauthenticated error', async () => {
  const api = createAdminApi({
    base: 'https://api.example.com',
    fetch: async () => jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'unauthorized' } }, { status: 401 }),
  });

  await assert.rejects(
    () => api.session(),
    (err) => err instanceof AdminApiError && err.status === 401
  );
});

function headersOf(call) {
  return call.headers || {};
}
