import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CERTIFICATES_API_PATH,
  formatDate,
  getCredentialValidity,
  safeHttpUrl,
  selectPublicCertificates,
} from '../js/certificates.js';

test('the public renderer uses the existing read-only certificates endpoint', () => {
  assert.equal(CERTIFICATES_API_PATH, '/api/content/certificates');
});

test('published certificates are rendered in CMS display order and drafts are excluded', () => {
  const selected = selectPublicCertificates([
    {
      title: 'Later credential',
      issuer: 'Example Institute',
      status: 'published',
      displayOrder: 2,
    },
    {
      title: 'Draft credential',
      issuer: 'Example Institute',
      status: 'draft',
      displayOrder: 0,
    },
    {
      title: 'Earlier credential',
      issuer: 'Example Institute',
      status: 'published',
      displayOrder: 1,
    },
  ]);

  assert.deepEqual(
    selected.map((cert) => cert.title),
    ['Earlier credential', 'Later credential']
  );
});

test('the shared schema supplies singular image, skills and optional fields', () => {
  const [cert] = selectPublicCertificates([
    {
      title: 'Cloud Practitioner',
      issuer: 'Cloud Provider',
      status: 'published',
      displayOrder: 0,
      issueDate: '2026-01',
      expiryDate: '2029-01-31',
      credentialId: 'CP-123',
      category: 'Cloud',
      skills: ['Cloud', ' Security ', ''],
      image: {
        src: 'https://example.com/badge.png',
        alt: 'Cloud badge',
        publicId: 'private-id',
      },
      verificationUrl: 'https://example.com/verify/CP-123',
    },
  ]);

  assert.equal(cert.image.src, 'https://example.com/badge.png');
  assert.equal(cert.image.alt, 'Cloud badge');
  assert.deepEqual(cert.skills, ['Cloud', 'Security']);
  assert.equal(cert.issueDate, '2026-01-01');
  assert.equal(cert.expiryDate, '2029-01-31');
  assert.equal(cert.credentialId, 'CP-123');
  assert.equal(cert.category, 'Cloud');
});

test('unsafe URLs are never rendered as links or images', () => {
  assert.equal(safeHttpUrl(' https://example.com/verify '), 'https://example.com/verify');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('data:image/svg+xml,<svg></svg>'), '');
  assert.equal(safeHttpUrl(undefined), '');
});

test('dates are formatted consistently and invalid dates are omitted', () => {
  assert.equal(formatDate('2026-02-03'), '03 Feb 2026');
  assert.equal(formatDate('not-a-date'), '');
  assert.equal(formatDate('2026-02-30'), '');
  assert.equal(formatDate(''), '');
});

test('expiry handling distinguishes active, expired and undated credentials', () => {
  const now = new Date('2026-11-17T12:00:00Z');

  assert.deepEqual(getCredentialValidity({ expiryDate: '2027-01-01' }, now), {
    label: 'Active',
    kind: 'active',
  });
  assert.deepEqual(getCredentialValidity({ expiryDate: '2026-01-01' }, now), {
    label: 'Expired',
    kind: 'expired',
  });
  assert.deepEqual(getCredentialValidity({ expiryDate: '' }, now), {
    label: 'No expiry date',
    kind: 'unknown',
  });
  assert.deepEqual(getCredentialValidity({ expiryDate: 'invalid' }, now), {
    label: '',
    kind: 'unknown',
  });
});
