/**
 * Cloudinary client wrapper.
 *
 * The official `cloudinary` Node SDK is loaded lazily so the API keeps working
 * (with uploads reported as unavailable) when the dependency or credentials are
 * missing. Routing through this module keeps the SDK at a single seam, which
 * lets the test suite inject a controlled double via `setMediaClientForTesting`.
 *
 * Credentials are configured on the SDK instance only; they are never returned
 * from `uploadImage`/`deleteAsset` and never logged.
 */

'use strict';

const { HttpError } = require('./errors');
const { loadMediaConfig } = require('./media-config');

/** Test-only override; when set it replaces the real SDK client entirely. */
let clientOverride = null;

/** Cached real client, keyed by the config that produced it. */
let cachedClient = null;
let cachedKey = null;

/**
 * Replace the Cloudinary client with a controlled double (tests only).
 * @param {object|null} client
 */
function setMediaClientForTesting(client) {
  clientOverride = client || null;
}

/** Clear any test override. */
function resetMediaClient() {
  clientOverride = null;
}

/** Load the SDK defensively; a missing optional dependency is not fatal. */
function loadSdk() {
  try {
    // eslint-disable-next-line global-require
    return require('cloudinary');
  } catch {
    return null;
  }
}

/** The actionable, secret-free error used whenever uploads are unconfigured. */
function notConfiguredError() {
  return new HttpError(
    503,
    'MEDIA_NOT_CONFIGURED',
    'Image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the API service.'
  );
}

/** The secret-free error used when the SDK is configured but unavailable. */
function unavailableError() {
  return new HttpError(503, 'MEDIA_UNAVAILABLE', 'The image service is temporarily unavailable.');
}

function uploadFailedError() {
  return new HttpError(502, 'MEDIA_UPLOAD_FAILED', 'The image could not be uploaded. Please try again.');
}

function deleteFailedError() {
  return new HttpError(502, 'MEDIA_DELETE_FAILED', 'The image could not be removed from storage.');
}

/**
 * Upload a buffer to Cloudinary and resolve the stored metadata.
 * @param {object|null} cloudinary - The resolved SDK (v2 namespace).
 * @param {ReturnType<typeof loadMediaConfig>} config
 * @param {Buffer} buffer
 * @param {{ folder?: string, filename?: string }} [options]
 * @returns {Promise<{src: string, publicId: string, width?: number, height?: number, format?: string, bytes?: number}>}
 */
function uploadWith(cloudinary, config, buffer, options = {}) {
  if (!config.configured) return Promise.reject(notConfiguredError());
  if (!cloudinary) return Promise.reject(unavailableError());

  return new Promise((resolve, reject) => {
    const params = {
      resource_type: 'image',
      folder: options.folder || config.folder,
      unique_filename: true,
      overwrite: false,
    };
    if (options.filename) params.filename = options.filename;

    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(uploadFailedError());
    };

    let stream;
    try {
      stream = cloudinary.uploader.upload_stream(params, (error, result) => {
        if (settled) return;
        if (error || !result || !result.secure_url || !result.public_id) {
          fail();
          return;
        }
        settled = true;
        resolve({
          src: result.secure_url,
          publicId: result.public_id,
          width: Number.isFinite(result.width) ? result.width : undefined,
          height: Number.isFinite(result.height) ? result.height : undefined,
          format: typeof result.format === 'string' ? result.format : '',
          bytes: Number.isFinite(result.bytes) ? result.bytes : undefined,
        });
      });
    } catch {
      fail();
      return;
    }

    stream.once('error', fail);
    stream.end(buffer);
  });
}

/**
 * Delete an asset by its Cloudinary public id.
 * @param {object|null} cloudinary
 * @param {ReturnType<typeof loadMediaConfig>} config
 * @param {string} publicId
 * @returns {Promise<object>}
 */
function deleteWith(cloudinary, config, publicId) {
  if (!config.configured) return Promise.reject(notConfiguredError());
  if (!cloudinary) return Promise.reject(unavailableError());

  return Promise.resolve()
    .then(() => cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true }))
    .then((result) => {
      const status = result && result.result;
      if (status && status !== 'ok' && status !== 'not found') throw deleteFailedError();
      return result || {};
    })
    .catch((error) => {
      if (error instanceof HttpError) throw error;
      throw deleteFailedError();
    });
}

/**
 * Build (and cache) the real SDK-backed client for a configuration.
 * @param {ReturnType<typeof loadMediaConfig>} config
 * @returns {{isConfigured: () => boolean, uploadImage: Function, deleteAsset: Function}}
 */
function buildClient(config) {
  const key = `${config.configured ? 'on' : 'off'}|${config.cloudName}|${config.folder}`;
  if (cachedClient && cachedKey === key) return cachedClient;

  const sdk = loadSdk();
  const cloudinary = sdk ? sdk.v2 || sdk : null;
  if (cloudinary && config.configured) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }

  const client = {
    isConfigured: () => Boolean(config.configured && cloudinary),
    uploadImage: (buffer, options) => uploadWith(cloudinary, config, buffer, options),
    deleteAsset: (publicId) => deleteWith(cloudinary, config, publicId),
  };

  cachedClient = client;
  cachedKey = key;
  return client;
}

/**
 * Resolve the active media client (a test double when injected, otherwise the
 * SDK-backed client built from the current environment).
 */
function getMediaClient() {
  if (clientOverride) return clientOverride;
  return buildClient(loadMediaConfig());
}

module.exports = {
  getMediaClient,
  setMediaClientForTesting,
  resetMediaClient,
  notConfiguredError,
  uploadFailedError,
  deleteFailedError,
};
