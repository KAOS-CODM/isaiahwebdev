/**
 * Configuration for Cloudinary-backed image uploads.
 *
 * All credentials are read from the environment and never leave this module
 * except to build the Cloudinary SDK client. `publicMediaConfig` returns the
 * client-safe subset (limits and format allowlist) so the admin UI can show
 * them without ever receiving the API key or secret.
 */

'use strict';

/** Raster formats the API accepts. SVG/HTML/executables are deliberately excluded. */
const ALLOWED_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Default Cloudinary folder for portfolio project images. */
const DEFAULT_FOLDER = 'isaiahwebdev/projects';

/** Default maximum upload size per image (5 MiB). */
const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Default maximum number of images per project (matches the project schema cap). */
const DEFAULT_MAX_IMAGES = 50;

/** Trim any non-string value to an empty string. */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Parse a positive integer from the environment, falling back when invalid. */
function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Load the media configuration from an environment object.
 *
 * The returned object may contain the API key and secret; it must never be
 * serialized to a response or a log. Use `publicMediaConfig` for anything the
 * client can see.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   configured: boolean,
 *   cloudName: string,
 *   apiKey: string,
 *   apiSecret: string,
 *   folder: string,
 *   maxUploadBytes: number,
 *   maxImagesPerProject: number,
 *   allowedTypes: readonly string[]
 * }}
 */
function loadMediaConfig(env = process.env) {
  const cloudName = asString(env.CLOUDINARY_CLOUD_NAME);
  const apiKey = asString(env.CLOUDINARY_API_KEY);
  const apiSecret = asString(env.CLOUDINARY_API_SECRET);

  return {
    configured: Boolean(cloudName && apiKey && apiSecret),
    cloudName,
    apiKey,
    apiSecret,
    folder: asString(env.CLOUDINARY_FOLDER) || DEFAULT_FOLDER,
    maxUploadBytes: positiveInt(env.MEDIA_MAX_UPLOAD_BYTES, DEFAULT_MAX_UPLOAD_BYTES),
    maxImagesPerProject: positiveInt(env.MEDIA_MAX_IMAGES_PER_PROJECT, DEFAULT_MAX_IMAGES),
    allowedTypes: ALLOWED_IMAGE_TYPES,
  };
}

/**
 * The subset of the media configuration that is safe to send to the browser.
 * Never includes `apiKey` or `apiSecret`.
 * @param {ReturnType<typeof loadMediaConfig>} config
 * @returns {{configured: boolean, folder: string, maxUploadBytes: number,
 *   maxImagesPerProject: number, allowedTypes: readonly string[]}}
 */
function publicMediaConfig(config) {
  const source = config || {};
  return {
    configured: Boolean(source.configured),
    folder: source.folder || DEFAULT_FOLDER,
    maxUploadBytes: source.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES,
    maxImagesPerProject: source.maxImagesPerProject || DEFAULT_MAX_IMAGES,
    allowedTypes: source.allowedTypes || ALLOWED_IMAGE_TYPES,
  };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  DEFAULT_FOLDER,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_MAX_IMAGES,
  loadMediaConfig,
  publicMediaConfig,
};
