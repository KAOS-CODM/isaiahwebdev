/**
 * admin-api.js
 * A small, DOM-free client for the private admin CMS API.
 *
 * Kept separate from the UI so it can be unit-tested under Node without a
 * browser. Authentication uses the server's `HttpOnly` session cookie: every
 * request is sent with `credentials: 'include'`, and the client never reads,
 * holds or persists the token, so nothing sensitive touches JS or web storage.
 */

export class AdminApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = options.status || 0;
    this.code = options.code || 'ADMIN_API_ERROR';
  }
}

const ADMIN_BASE_PATH = '/api/admin';

/**
 * Create an admin API client.
 * @param {{ base?: string, fetch?: typeof fetch }} [options]
 *   `base` is the API origin (no trailing slash). `fetch` is injectable for tests.
 * @returns {object}
 */
export function createAdminApi(options = {}) {
  const fetchImpl = options.fetch || ((...args) => fetch(...args));
  let base = options.base ? String(options.base).replace(/\/+$/, '') : '';

  function projectPath(slug) {
    return `${ADMIN_BASE_PATH}/projects/${encodeURIComponent(slug)}`;
  }

  async function call(path, { method = 'GET', body, raw, contentType, expect = 'json' } = {}) {
    const headers = {};
    let requestBody;
    if (raw !== undefined) {
      headers['Content-Type'] = contentType || 'application/octet-stream';
      requestBody = raw;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: requestBody,
      credentials: 'include',
    });

    if (expect === 'text') {
      if (!response.ok) throw await toError(response);
      return response.text();
    }

    let data = null;
    const responseType = response.headers.get('content-type') || '';
    if (responseType.includes('application/json')) {
      data = await response.json();
    }

    if (!response.ok) throw toErrorFromData(data, response.status);
    return data;
  }

  async function toError(response) {
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
    return toErrorFromData(data, response.status);
  }

  function toErrorFromData(data, status) {
    const error = data && data.error ? data.error : {};
    return new AdminApiError(error.message || `Request failed (${status})`, {
      status,
      code: error.code || 'HTTP_ERROR',
    });
  }

  return {
    setBase(next) {
      base = next ? String(next).replace(/\/+$/, '') : '';
    },
    getBase() {
      return base;
    },

    bootstrapStatus() {
      return call(`${ADMIN_BASE_PATH}/bootstrap`);
    },
    setup(username, password) {
      return call(`${ADMIN_BASE_PATH}/setup`, {
        method: 'POST',
        body: { username, password },
      });
    },
    login(username, password) {
      return call(`${ADMIN_BASE_PATH}/login`, {
        method: 'POST',
        body: { username, password },
      });
    },
    session() {
      return call(`${ADMIN_BASE_PATH}/session`);
    },
    logout() {
      return call(`${ADMIN_BASE_PATH}/logout`, { method: 'POST', body: {} });
    },

    listProjects() {
      return call(`${ADMIN_BASE_PATH}/projects`);
    },
    getProject(slug) {
      return call(projectPath(slug));
    },
    createProject(project) {
      return call(`${ADMIN_BASE_PATH}/projects`, { method: 'POST', body: project });
    },
    updateProject(slug, project) {
      return call(projectPath(slug), { method: 'PUT', body: project });
    },
    deleteProject(slug) {
      return call(projectPath(slug), { method: 'DELETE' });
    },
    publishProject(slug) {
      return call(`${projectPath(slug)}/publish`, { method: 'POST', body: {} });
    },
    unpublishProject(slug) {
      return call(`${projectPath(slug)}/unpublish`, { method: 'POST', body: {} });
    },
    previewHtml(slug) {
      return call(`${projectPath(slug)}/preview`, { expect: 'text' });
    },

    /** Upload availability and limits (never includes credentials). */
    mediaConfig() {
      return call(`${ADMIN_BASE_PATH}/media/config`);
    },
    /**
     * Upload a single image file. The File/Blob is sent as the raw request body
     * with its own content type, so no multipart parser is required server-side
     * and ordinary cookie-authenticated fetch is used.
     * @param {Blob} file
     * @param {{ alt?: string, slug?: string, contentType?: string }} [options]
     */
    uploadImage(file, options = {}) {
      const params = new URLSearchParams();
      if (options.alt) params.set('alt', options.alt);
      if (options.slug) params.set('slug', options.slug);
      const query = params.toString();
      return call(`${ADMIN_BASE_PATH}/media/images${query ? `?${query}` : ''}`, {
        method: 'POST',
        raw: file,
        contentType: options.contentType || (file && file.type) || 'application/octet-stream',
      });
    },
    /** Delete a Cloudinary asset that no project references. */
    deleteImage(publicId) {
      return call(`${ADMIN_BASE_PATH}/media/images`, { method: 'DELETE', body: { publicId } });
    },
  };
}
