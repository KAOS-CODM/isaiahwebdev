/**
 * certificates-schema.js
 * Single shared, dependency-free content schema for portfolio certificates.
 *
 * These are pure functions with no browser or Node globals, so the exact same
 * normalization is used by:
 *   - the browser loaders (js/api-config.js and the page renderers),
 *   - the backend that renders the certificate detail pages and serves the JSON API
 *     (backend/src/lib/certificate-schema.js loads this file), and
 *   - the tests.
 *
 * Keeping one schema here prevents the listing, the API and the server-rendered
 * detail pages from drifting apart.
 */

export const DEFAULT_STATUS = 'published';

/**
 * Basic http/https URL validation.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Convert arbitrary text into a URL-safe slug.
 * @param {unknown} value
 * @returns {string}
 */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Escape text for safe interpolation into HTML.
 * Uses the same convention as `js/projects-schema.js` so the exact same
 * escaping is used by the browser loaders, the backend, and the tests.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalize the issue date from a string to a canonical YYYY-MM-DD format.
 * Accepts YYYY-MM-DD, YYYY-MM, or a Date object. Returns '' when unparseable.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeIssueDate(value) {
  if (!value) return '';
  if (typeof value === 'object' && value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Try YYYY-MM-DD
  const fullMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullMatch) return trimmed;
  // Try YYYY-MM
  const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) return `${monthMatch[1]}-${monthMatch[2]}-01`;
  return '';
}

/**
 * Normalize one raw certificate (from the API or the local JSON) into the
 * canonical shape. Returns null when the entry is unusable (no usable title/slug).
 *
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {object|null}
 */
export function normalizeCertificate(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;

  const title = String(raw.title ?? '').trim();
  if (!title) return null;

  const slug = slugify(asString(raw.slug) || title);
  if (!slug) return null;

  const issuer = asString(raw.issuer);
  if (!issuer) return null;

  const description = asString(raw.description);
  const issueDate = normalizeIssueDate(raw.issueDate);
  const expiryDate = normalizeIssueDate(raw.expiryDate);
  const credentialId = asString(raw.credentialId);
  const category = asString(raw.category);
  const skills = asStringArray(raw.skills);
  const displayOrder = Number.isFinite(Number(raw.displayOrder))
    ? Number(raw.displayOrder)
    : index;

  // Normalize image reference following existing media conventions.
  // Accepts: object with src/publicId, string URL, or absent.
  let image = null;
  if (raw.image) {
    if (typeof raw.image === 'string') {
      // Manual URL fallback.
      if (isValidUrl(raw.image)) {
        image = { src: raw.image, alt: '', provider: 'external' };
      }
    } else if (raw.image && typeof raw.image === 'object') {
      const src = asString(raw.image.src);
      const publicId = asString(raw.image.publicId);
      const alt = asString(raw.image.alt);
      if (src) {
        image = { src, alt, provider: publicId ? 'cloudinary' : 'external' };
        if (publicId) image.publicId = publicId;
      }
    }
  }

  // Normalize verification URL following existing URL validation.
  let verificationUrl = asString(raw.verificationUrl);
  if (verificationUrl && !isValidUrl(verificationUrl)) {
    verificationUrl = '';
  }

  return {
    // Basic information.
    slug,
    title,
    issuer,
    description,
    issueDate,
    expiryDate,
    credentialId,
    category,
    skills,
    image,
    verificationUrl,
    // Publication and ordering.
    status: asString(raw.status) || DEFAULT_STATUS,
    displayOrder,
    // Timestamps and legacy fields (kept for round-trip compatibility).
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
  };
}

/**
 * Normalize a list of raw certificates, dropping unusable entries and assigning
 * deterministic unique slugs so listing links always match generated pages.
 *
 * @param {unknown} list
 * @returns {object[]}
 */
export function normalizeCertificates(list) {
  if (!Array.isArray(list)) return [];

  const usedSlugs = new Set();
  const normalized = [];

  list.forEach((raw, index) => {
    const cert = normalizeCertificate(raw, index);
    if (!cert) return;

    let slug = cert.slug;
    if (usedSlugs.has(slug)) {
      let suffix = 2;
      while (usedSlugs.has(`${cert.slug}-${suffix}`)) suffix += 1;
      slug = `${cert.slug}-${suffix}`;
    }
    usedSlugs.add(slug);

    normalized.push({ ...cert, slug });
  });

  return normalized.sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Filter a list of certificates to only those with status `published`.
 *
 * @param {object[]} certificates
 * @returns {object[]}
 */
export function publishedCertificates(certificates) {
  return Array.isArray(certificates)
    ? certificates.filter((cert) => cert.status === 'published')
    : [];
}

/**
 * Sort certificates deterministically: by displayOrder ascending, then by
 * issueDate descending, then by title ascending.
 *
 * @param {object[]} certificates
 * @returns {object[]}
 */
export function sortCertificates(certificates) {
  return [...certificates].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    const aDate = a.issueDate || '';
    const bDate = b.issueDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return a.title.localeCompare(b.title);
  });
}

/**
 * Build the site-relative URL for a certificate's dedicated page.
 *
 * Uses the query-string route (`/certificate?slug=<slug>`) instead of a path
 * segment, so the same URL resolves on any static host with no rewrite needed.
 * @param {string} slug
 * @returns {string}
 */
export function certificatePagePath(slug) {
  return `/certificate?slug=${encodeURIComponent(slug)}`;
}

/**
 * Retrieve a string value, trimming if it is a string, or '' otherwise.
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize an optional string array value.
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Retrieve a string value, trimming if it is a string, or '' otherwise.
 * @param {unknown} value
 * @returns {string}
 */
function asString2(value) {
  return typeof value === 'string' ? value.trim() : '';
}