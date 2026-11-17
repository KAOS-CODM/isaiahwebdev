/**
 * Read-only certificate content endpoint.
 *
 * `GET /api/content/certificates` returns the published certificates, normalized
 * by the single shared schema (`js/certificates-schema.js`) so the JSON API, the
 * browser listing and the server-rendered pages all agree on slugs and shape.
 *
 * Only published certificates are returned: a document with an explicit non-
 * "published" `status` (for example "draft") is never exposed.
 *
 * `GET /api/content/certificates/:slug` returns one published certificate.
 * Draft certificates return 404.
 */

'use strict';

const { getDb } = require('../lib/db-handle');
const { listPublishedCertificates, findPublishedCertificateBySlug } = require('../lib/certificate-store');
const { Errors, sendJsonError } = require('../lib/errors');

/**
 * Project the normalized certificate onto the public API shape.
 * Exposes only fields required by the public page; internal fields are excluded.
 * @param {object} cert
 * @returns {object}
 */
function toApiCertificate(cert) {
  return {
    slug: cert.slug,
    title: cert.title,
    issuer: cert.issuer,
    description: cert.description,
    issueDate: cert.issueDate,
    expiryDate: cert.expiryDate,
    // Public CMS fields needed by the credentials listing/detail view.
    credentialId: cert.credentialId,
    category: cert.category,
    skills: Array.isArray(cert.skills) ? [...cert.skills] : [],
    // Image: expose src and alt when present; never expose publicId or provider metadata.
    image: cert.image
      ? {
          src: cert.image.src,
          alt: cert.image.alt || '',
        }
      : null,
    // Verification URL when present; never a javascript: or data: URL.
    verificationUrl: cert.verificationUrl || null,
    displayOrder: cert.displayOrder,
  };
}

/**
 * Handles GET /api/content/certificates
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function certificatesHandler(req, res) {
  if (req.method !== 'GET') {
    const error = Errors.methodNotAllowed();
    sendJsonError(res, error);
    return;
  }

  const db = getDb();
  if (!db) {
    const error = Errors.serviceUnavailable('Content is temporarily unavailable');
    sendJsonError(res, error);
    return;
  }

  try {
    const certs = await listPublishedCertificates(db);
    const apiCerts = certs.map(toApiCertificate);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ certificates: apiCerts }));
  } catch (err) {
    console.error('Error fetching certificates:', err.message);
    const error = Errors.internalError('Failed to fetch certificates');
    sendJsonError(res, error);
  }
}

/**
 * Handles GET /api/content/certificates/:slug
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} slug
 */
async function certificateItemHandler(req, res, slug) {
  if (req.method !== 'GET') {
    const error = Errors.methodNotAllowed();
    sendJsonError(res, error);
    return;
  }

  const db = getDb();
  if (!db) {
    const error = Errors.serviceUnavailable('Content is temporarily unavailable');
    sendJsonError(res, error);
    return;
  }

  // Validate slug format using existing convention
  const isValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  if (!isValid) {
    sendJsonError(res, Errors.notFound('Certificate not found'));
    return;
  }

  const cert = await findPublishedCertificateBySlug(db, slug);
  if (!cert) {
    // 404 for both missing and draft certificates — same error to avoid
    // revealing whether a certificate exists with a non-published status.
    sendJsonError(res, Errors.notFound('Certificate not found'));
    return;
  }

  const apiCert = toApiCertificate(cert);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ certificate: apiCert }));
}

module.exports = {
  certificatesHandler,
  certificateItemHandler,
};