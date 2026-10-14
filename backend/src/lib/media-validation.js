/**
 * Server-side validation for uploaded images.
 *
 * The declared `Content-Type` is not trusted on its own: the leading bytes of
 * the payload are matched against known raster signatures, so a renamed SVG,
 * HTML document or executable is rejected even when it claims to be a PNG.
 */

'use strict';

const { HttpError } = require('./errors');

/**
 * Magic-byte signatures for the accepted raster formats.
 * @type {Array<{ type: string, matches: (buffer: Buffer) => boolean }>}
 */
const SIGNATURES = [
  {
    type: 'image/png',
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    type: 'image/jpeg',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: 'image/gif',
    matches: (b) => {
      if (b.length < 6) return false;
      const header = b.subarray(0, 6).toString('latin1');
      return header === 'GIF87a' || header === 'GIF89a';
    },
  },
  {
    type: 'image/webp',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Lowercase, parameter-stripped content type. */
function normalizeContentType(value) {
  return String(value == null ? '' : value)
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * Detect a supported image type from the payload's leading bytes.
 * @param {Buffer} buffer
 * @returns {string} A MIME type, or '' when nothing matches.
 */
function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return '';
  for (const signature of SIGNATURES) {
    if (signature.matches(buffer)) return signature.type;
  }
  return '';
}

/** Human list of supported formats for error messages. */
function allowedLabel(allowedTypes) {
  const names = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF' };
  return allowedTypes.map((type) => names[type] || type).join(', ');
}

/**
 * Validate an uploaded image payload.
 *
 * @param {object} options
 * @param {unknown} options.contentType - The declared `Content-Type`.
 * @param {Buffer} options.buffer - The raw uploaded bytes.
 * @param {number} options.maxBytes - Maximum allowed size.
 * @param {readonly string[]} options.allowedTypes - Accepted MIME types.
 * @returns {{ contentType: string, format: string, extension: string }}
 * @throws {HttpError} 400 for an empty body, 413 when too large, 415 for an
 *   unsupported or spoofed type.
 */
function validateUpload({ contentType, buffer, maxBytes, allowedTypes }) {
  const allowed = Array.isArray(allowedTypes) && allowedTypes.length
    ? allowedTypes
    : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new HttpError(400, 'BAD_REQUEST', 'The uploaded file is empty');
  }

  if (Number.isFinite(maxBytes) && maxBytes > 0 && buffer.length > maxBytes) {
    const kb = Math.floor(maxBytes / 1024);
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Images must be at most ${kb} KB`);
  }

  const declared = normalizeContentType(contentType);
  if (!allowed.includes(declared)) {
    throw new HttpError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported image type. Allowed formats: ${allowedLabel(allowed)}.`
    );
  }

  const detected = sniffImageType(buffer);
  if (!detected || !allowed.includes(detected)) {
    throw new HttpError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      `The uploaded file is not a valid image. Allowed formats: ${allowedLabel(allowed)}.`
    );
  }

  const format = detected.split('/')[1] || 'bin';
  return {
    contentType: detected,
    format,
    extension: format === 'jpeg' ? 'jpg' : format,
  };
}

module.exports = {
  normalizeContentType,
  sniffImageType,
  validateUpload,
};
