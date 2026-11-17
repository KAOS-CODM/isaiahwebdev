/**
 * certificates.js
 * Public credentials showcase for /certificates.
 *
 * Data source: the existing read-only CMS API at
 * `/api/content/certificates`, resolved through the shared API base helper.
 * The shared certificate schema normalizes every record, hides drafts, and
 * supplies the canonical display order. No static certificate content is
 * duplicated in the frontend.
 *
 * Rendering uses DOM construction only. CMS values are written with
 * `textContent`, and every external URL is validated before use.
 */

import { resolveApiBase } from './api-config.js';
import {
  normalizeCertificates,
  publishedCertificates,
  sortCertificates,
  isValidUrl,
} from './certificates-schema.js';

export const CERTIFICATES_API_PATH = '/api/content/certificates';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Return a trimmed http(s) URL, or '' when the value is missing/unsafe. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return isValidUrl(trimmed) ? trimmed : '';
}

/** Format a canonical YYYY-MM-DD value without timezone shifting. */
export function formatDate(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  return DATE_FORMATTER.format(date);
}

/** Local calendar date as YYYY-MM-DD, used for expiry comparison. */
function todayIsoDate(now) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Distinguish active, expired and undated credentials. Invalid/normalized-away
 * dates produce no label rather than a misleading one.
 */
export function getCredentialValidity(cert, now = new Date()) {
  if (!cert || typeof cert !== 'object') return { label: '', kind: 'unknown' };

  const expiry = typeof cert.expiryDate === 'string' ? cert.expiryDate.trim() : '';
  if (!expiry) return { label: 'No expiry date', kind: 'unknown' };
  if (!formatDate(expiry)) return { label: '', kind: 'unknown' };

  return expiry < todayIsoDate(now)
    ? { label: 'Expired', kind: 'expired' }
    : { label: 'Active', kind: 'active' };
}

/**
 * Normalize, hide drafts and apply the CMS-configured order. The backend also
 * filters drafts; doing it here keeps the public renderer defensive.
 */
export function selectPublicCertificates(rawList) {
  return sortCertificates(publishedCertificates(normalizeCertificates(rawList)));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function appendText(parent, tag, className, text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) return null;
  const node = element(tag, className, value);
  parent.appendChild(node);
  return node;
}

function badge(label, kind) {
  return element('span', `credential-badge credential-badge--${kind}`, label);
}

function imageFallback(cert) {
  const fallback = element('div', 'credential-card__fallback');
  const icon = element('i');
  icon.className = 'fas fa-award';
  icon.setAttribute('aria-hidden', 'true');
  fallback.appendChild(icon);
  fallback.appendChild(element('span', '', cert.category || 'Credential record'));
  return fallback;
}

/** Build a published certificate card. */
export function renderCredentialCard(cert, openDetails) {
  const card = element('article', 'credential-card');
  card.dataset.slug = cert.slug || '';

  const media = element('div', 'credential-card__media');
  const imageSrc = safeHttpUrl(cert.image && cert.image.src);
  if (imageSrc) {
    const image = element('img');
    image.src = imageSrc;
    image.alt = (cert.image && cert.image.alt) || `${cert.title} certificate image`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      media.replaceChildren(imageFallback(cert));
    });
    media.appendChild(image);
  } else {
    media.appendChild(imageFallback(cert));
  }
  card.appendChild(media);

  const eyebrow = element('div', 'credential-card__eyebrow');
  if (cert.category) eyebrow.appendChild(badge(cert.category, 'category'));
  const validity = getCredentialValidity(cert);
  if (validity.label) eyebrow.appendChild(badge(validity.label, validity.kind));
  if (eyebrow.childElementCount) card.appendChild(eyebrow);

  appendText(card, 'h3', 'credential-card__title', cert.title);

  if (cert.issuer) {
    appendText(card, 'p', 'credential-card__issuer', `Issued by ${cert.issuer}`);
  }

  const description = appendText(card, 'p', 'credential-card__desc', cert.description);
  if (description) description.title = cert.description.trim();

  const issued = formatDate(cert.issueDate);
  if (issued) {
    appendText(card, 'p', 'credential-card__meta', `Issued ${issued}`);
  }

  if (Array.isArray(cert.skills) && cert.skills.length) {
    const skills = element('ul', 'credential-card__skills');
    const visible = cert.skills.slice(0, 4);
    visible.forEach((skill) => {
      skills.appendChild(element('li', 'credential-skill', skill));
    });
    const remaining = cert.skills.length - visible.length;
    if (remaining > 0) {
      skills.appendChild(element('li', 'credential-skill credential-skill--more', `+${remaining}`));
    }
    card.appendChild(skills);
  }

  const actions = element('div', 'credential-card__actions');
  const details = element('button', 'btn credential-card__details', 'View details');
  details.type = 'button';
  details.setAttribute('aria-label', `View details for ${cert.title || 'credential'}`);
  details.addEventListener('click', () => openDetails(cert));
  actions.appendChild(details);

  const verificationUrl = safeHttpUrl(cert.verificationUrl);
  if (verificationUrl) {
    const verify = element('a', 'project-link credential-card__verify', 'Verify credential');
    verify.href = verificationUrl;
    verify.target = '_blank';
    verify.rel = 'noopener noreferrer';
    verify.setAttribute('aria-label', `Verify credential for ${cert.title || 'this credential'}`);
    actions.appendChild(verify);
  }

  card.appendChild(actions);
  return card;
}

function renderLoading() {
  const state = element('div', 'credential-state');
  state.setAttribute('role', 'status');
  const spinner = element('span', 'credential-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  state.appendChild(spinner);
  appendText(state, 'p', 'credential-state__text', 'Loading credentials…');
  return state;
}

function renderEmpty() {
  const state = element('div', 'credential-state');
  state.setAttribute('role', 'status');
  const icon = element('i', 'fas fa-award credential-state__icon');
  icon.setAttribute('aria-hidden', 'true');
  state.appendChild(icon);
  appendText(state, 'h3', 'credential-state__title', 'No published credentials yet');
  appendText(
    state,
    'p',
    'credential-state__text',
    'Published credentials will appear here automatically when they are added in the CMS.'
  );
  return state;
}

function renderError(onRetry) {
  const state = element('div', 'credential-state credential-state--error');
  state.setAttribute('role', 'alert');
  const icon = element('i', 'fas fa-exclamation-triangle credential-state__icon');
  icon.setAttribute('aria-hidden', 'true');
  state.appendChild(icon);
  appendText(state, 'h3', 'credential-state__title', 'Credentials are temporarily unavailable');
  appendText(
    state,
    'p',
    'credential-state__text',
    'The credential service could not be reached. Please try again.'
  );
  const retry = element('button', 'btn btn-primary credential-state__retry', 'Retry');
  retry.type = 'button';
  retry.addEventListener('click', onRetry);
  state.appendChild(retry);
  return state;
}

function addMetaRow(list, label, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return;

  const row = element('div', 'credential-dialog__meta-row');
  row.appendChild(element('dt', '', label));
  const dd = element('dd', '', text);
  if (label === 'Credential ID') dd.className = 'credential-dialog__credential-id';
  row.appendChild(dd);
  list.appendChild(row);
}

function populateDialog(cert, refs) {
  refs.title.textContent = cert.title || '';

  const issuer = cert.issuer ? `Issued by ${cert.issuer}` : '';
  refs.issuer.textContent = issuer;
  refs.issuer.hidden = !issuer;

  const description = typeof cert.description === 'string' ? cert.description.trim() : '';
  refs.description.textContent = description;
  refs.description.hidden = !description;

  refs.badges.replaceChildren();
  if (cert.category) refs.badges.appendChild(badge(cert.category, 'category'));
  const validity = getCredentialValidity(cert);
  if (validity.label) refs.badges.appendChild(badge(validity.label, validity.kind));
  refs.badges.hidden = !refs.badges.childElementCount;

  const imageSrc = safeHttpUrl(cert.image && cert.image.src);
  refs.image.onerror = () => {
    refs.figure.hidden = true;
  };
  if (imageSrc) {
    refs.image.src = imageSrc;
    refs.image.alt = (cert.image && cert.image.alt) || `${cert.title} certificate image`;
    refs.figure.hidden = false;
  } else {
    refs.image.removeAttribute('src');
    refs.image.alt = '';
    refs.figure.hidden = true;
  }

  refs.meta.replaceChildren();
  addMetaRow(refs.meta, 'Issuer', cert.issuer);
  addMetaRow(refs.meta, 'Category', cert.category);
  addMetaRow(refs.meta, 'Issued', formatDate(cert.issueDate));
  addMetaRow(refs.meta, 'Expiry', formatDate(cert.expiryDate));
  addMetaRow(refs.meta, 'Validity', validity.label);
  addMetaRow(refs.meta, 'Credential ID', cert.credentialId);
  refs.meta.hidden = !refs.meta.childElementCount;

  refs.skills.replaceChildren();
  if (Array.isArray(cert.skills)) {
    cert.skills.forEach((skill) => {
      refs.skills.appendChild(element('li', 'credential-skill', skill));
    });
  }
  refs.skillsWrap.hidden = !refs.skills.childElementCount;

  refs.actions.replaceChildren();
  if (imageSrc) {
    const imageLink = element('a', 'project-link', 'Open full image');
    imageLink.href = imageSrc;
    imageLink.target = '_blank';
    imageLink.rel = 'noopener noreferrer';
    refs.actions.appendChild(imageLink);
  }

  const verificationUrl = safeHttpUrl(cert.verificationUrl);
  if (verificationUrl) {
    const verify = element('a', 'btn btn-primary', 'Verify Credential');
    verify.href = verificationUrl;
    verify.target = '_blank';
    verify.rel = 'noopener noreferrer';
    refs.actions.appendChild(verify);
  }
}

let container = null;
let dialogRefs = null;
let lastFocusedElement = null;
let loadSequence = 0;

function openCredentialDialog(cert) {
  if (!dialogRefs || !dialogRefs.dialog || typeof dialogRefs.dialog.showModal !== 'function') return;

  lastFocusedElement = document.activeElement;
  populateDialog(cert, dialogRefs);
  dialogRefs.dialog.showModal();
  document.body.classList.add('credential-dialog-open');
  dialogRefs.close.focus();
}

function closeCredentialDialog() {
  if (dialogRefs && dialogRefs.dialog && dialogRefs.dialog.open) {
    dialogRefs.dialog.close();
  }
}

function wireDialog() {
  if (!dialogRefs || !dialogRefs.dialog) return;

  dialogRefs.close.addEventListener('click', closeCredentialDialog);
  dialogRefs.dialog.addEventListener('click', (event) => {
    if (event.target === dialogRefs.dialog) closeCredentialDialog();
  });
  dialogRefs.dialog.addEventListener('close', () => {
    document.body.classList.remove('credential-dialog-open');
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  });
}

async function loadCertificates() {
  if (!container) return;

  const sequence = ++loadSequence;
  container.setAttribute('aria-busy', 'true');
  container.replaceChildren(renderLoading());

  const apiBase = resolveApiBase();
  if (!apiBase) {
    container.replaceChildren(renderError(loadCertificates));
    container.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const response = await fetch(`${apiBase}${CERTIFICATES_API_PATH}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) throw new Error(`API_HTTP_${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('API_INVALID_CONTENT_TYPE');

    const data = await response.json();
    if (!data || !Array.isArray(data.certificates)) throw new Error('API_INVALID_SHAPE');

    const certificates = selectPublicCertificates(data.certificates);
    if (sequence !== loadSequence) return;

    if (!certificates.length) {
      container.replaceChildren(renderEmpty());
      return;
    }

    const fragment = document.createDocumentFragment();
    certificates.forEach((cert) => {
      fragment.appendChild(renderCredentialCard(cert, openCredentialDialog));
    });
    container.replaceChildren(fragment);
  } catch (error) {
    if (sequence !== loadSequence) return;
    console.error('Error loading certificates:', error);
    container.replaceChildren(renderError(loadCertificates));
  } finally {
    if (sequence === loadSequence) container.setAttribute('aria-busy', 'false');
  }
}

function init() {
  container = document.getElementById('certificates-container');
  if (!container) return;

  dialogRefs = {
    dialog: document.getElementById('credential-dialog'),
    close: document.getElementById('credential-dialog-close'),
    title: document.getElementById('credential-dialog-title'),
    issuer: document.getElementById('credential-dialog-issuer'),
    badges: document.getElementById('credential-dialog-badges'),
    description: document.getElementById('credential-dialog-description'),
    figure: document.getElementById('credential-dialog-figure'),
    image: document.getElementById('credential-dialog-image'),
    meta: document.getElementById('credential-dialog-meta'),
    skillsWrap: document.getElementById('credential-dialog-skills-wrap'),
    skills: document.getElementById('credential-dialog-skills'),
    actions: document.getElementById('credential-dialog-actions'),
  };

  wireDialog();
  loadCertificates();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
