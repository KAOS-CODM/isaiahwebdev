/**
 * Request body parsing for the JSON admin API.
 *
 * Enforces a strict JSON content type, a hard byte cap (so a large upload
 * cannot exhaust memory), and a valid JSON object body. Failures are thrown as
 * `HttpError`s that the admin route translates into the standard JSON envelope.
 */

'use strict';

const { HttpError } = require('./errors');

/** Hard cap for admin JSON bodies. Image URLs only, so this is generous. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Read and parse a JSON object body.
 * @param {import('http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<object>}
 * @throws {HttpError} 415 for a non-JSON content type, 413 when too large,
 *   400 for an empty or malformed body, or a non-object payload.
 */
async function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes || MAX_BODY_BYTES;

  const contentType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }

  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
      }
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'BAD_REQUEST', 'Could not read request body');
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body is required');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Malformed JSON body');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body must be a JSON object');
  }

  return parsed;
}

/**
 * Read a raw binary request body (used for image uploads) with a hard byte cap.
 *
 * The declared `Content-Length` is checked first so an oversized upload is
 * rejected before the whole payload is buffered; the running size is also
 * checked per chunk so a missing or dishonest length cannot exhaust memory.
 *
 * @param {import('http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<Buffer>}
 * @throws {HttpError} 413 when the payload exceeds `maxBytes`.
 */
async function readBinaryBody(req, options = {}) {
  const maxBytes = options.maxBytes || MAX_BODY_BYTES;

  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  }

  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
      }
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'BAD_REQUEST', 'Could not read request body');
  }

  return Buffer.concat(chunks);
}

module.exports = {
  readJsonBody,
  readBinaryBody,
  MAX_BODY_BYTES,
};
