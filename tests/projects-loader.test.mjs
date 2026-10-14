import test from 'node:test';
import assert from 'node:assert/strict';

import { loadProjects, resolveApiBase } from '../js/api-config.js';

const LOCAL_URL = '/data/projects.json';
const API_PROJECTS = [
  { title: 'Remote One', description: 'from api', technologies: ['Node.js'] },
];
const LOCAL_PROJECTS = [
  { title: 'Local One', description: 'from local json' },
  { title: 'Local Two', description: 'from local json' },
];

function jsonResponse(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key) => (key.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  };
}

function withFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function withApiBase(base) {
  const original = globalThis.window;
  globalThis.window = { PORTFOLIO_API_BASE: base, location: { hostname: 'app.example.com' } };
  return () => {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  };
}

test('resolveApiBase honours an explicit override and strips trailing slashes', () => {
  assert.equal(
    resolveApiBase({ PORTFOLIO_API_BASE: 'https://api.example.com/' }),
    'https://api.example.com'
  );
});

test('resolveApiBase defaults to localhost in development and null in production', () => {
  assert.equal(resolveApiBase({ location: { hostname: 'localhost' } }), 'http://localhost:8080');
  assert.equal(resolveApiBase({ location: { hostname: '127.0.0.1' } }), 'http://localhost:8080');
  assert.equal(resolveApiBase({ location: { hostname: 'isaiahwebdev.onrender.com' } }), null);
  assert.equal(resolveApiBase({}), null);
});

test('API success is used and the local file is not requested', async () => {
  const restoreWindow = withApiBase('https://api.example.com');
  const fetchStub = withFetch((url) =>
    url.includes('/api/content/projects')
      ? jsonResponse({ projects: API_PROJECTS })
      : jsonResponse(LOCAL_PROJECTS)
  );
  try {
    const result = await loadProjects();
    assert.equal(result.source, 'api');
    assert.equal(result.projects[0].title, 'Remote One');
    assert.equal(fetchStub.calls.length, 1);
    assert.ok(fetchStub.calls[0].includes('/api/content/projects'));
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});

test('an API array response is accepted directly', async () => {
  const restoreWindow = withApiBase('https://api.example.com');
  const fetchStub = withFetch(() => jsonResponse(API_PROJECTS));
  try {
    const result = await loadProjects();
    assert.equal(result.source, 'api');
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});

const fallbackCases = [
  ['non-OK status (503)', () => jsonResponse({ error: {} }, { status: 503 })],
  ['unexpected status (500)', () => jsonResponse({ error: {} }, { status: 500 })],
  ['empty project list', () => jsonResponse({ projects: [] })],
  ['missing projects field', () => jsonResponse({})],
  ['wrong payload type', () => jsonResponse('not-an-object')],
  ['non-JSON content type', () => jsonResponse({ projects: API_PROJECTS }, { contentType: 'text/html' })],
  ['all entries unusable', () => jsonResponse({ projects: [{ no: 'title' }] })],
];

for (const [label, apiResponse] of fallbackCases) {
  test(`local JSON is used when the API response is unusable: ${label}`, async () => {
    const restoreWindow = withApiBase('https://api.example.com');
    const fetchStub = withFetch((url) =>
      url.includes('/api/content/projects') ? apiResponse() : jsonResponse(LOCAL_PROJECTS)
    );
    try {
      const result = await loadProjects();
      assert.equal(result.source, 'local');
      assert.equal(result.projects.length, 2);
      assert.equal(result.projects[0].title, 'Local One');
      assert.ok(fetchStub.calls.includes(LOCAL_URL));
    } finally {
      fetchStub.restore();
      restoreWindow();
    }
  });
}

test('local JSON is used when the API request throws (network failure)', async () => {
  const restoreWindow = withApiBase('https://api.example.com');
  const fetchStub = withFetch((url) => {
    if (url.includes('/api/content/projects')) throw new Error('network down');
    return jsonResponse(LOCAL_PROJECTS);
  });
  try {
    const result = await loadProjects();
    assert.equal(result.source, 'local');
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});

test('no API base configured means the API is never called', async () => {
  const restoreWindow = withApiBase('');
  const fetchStub = withFetch((url) => {
    if (url.includes('/api/content/projects')) throw new Error('should not be called');
    return jsonResponse(LOCAL_PROJECTS);
  });
  try {
    const result = await loadProjects();
    assert.equal(result.source, 'local');
    assert.equal(fetchStub.calls.length, 1);
    assert.equal(fetchStub.calls[0], LOCAL_URL);
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});

test('loadProjects rejects when neither the API nor the local file has usable projects', async () => {
  const restoreWindow = withApiBase('');
  const fetchStub = withFetch(() => jsonResponse([]));
  try {
    await assert.rejects(loadProjects(), /NO_USABLE_PROJECTS/);
  } finally {
    fetchStub.restore();
    restoreWindow();
  }
});
