'use strict';

/**
 * lib/validate.js — minimal request validation (Gate 2 Phase 1).
 *
 * Small hand-rolled validators keep the dependency footprint at zero.
 * Bodies are capped before parsing; every rejection uses a fixed shape.
 */

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const MAX_BODY_BYTES = 16 * 1024;

function readJsonBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers?.['content-type'] || '');
    if (!contentType.toLowerCase().includes('application/json')) {
      reject(new ValidationError('body', 'Content-Type must be application/json.'));
      return;
    }
    let received = 0;
    const chunks = [];
    let rejected = false;
    function fail(err) {
      if (!rejected) {
        rejected = true;
        reject(err);
      }
    }
    req.on('data', (chunk) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBytes) {
        fail(new ValidationError('body', 'Request body too large.'));
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        fail(new ValidationError('body', 'Request body must be valid JSON.'));
      }
    });
    req.on('error', (err) => fail(err));
  });
}

function requiredString(value, { name, min = 1, max = 256 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ValidationError(name, `${name} is invalid.`);
  }
  return value;
}

module.exports = { ValidationError, MAX_BODY_BYTES, readJsonBody, requiredString };
