import test from 'node:test';
import assert from 'node:assert/strict';

import {
  slugify,
  isValidUrl,
  escapeHtml,
  normalizeCertificate,
  normalizeCertificates,
  publishedCertificates,
  sortCertificates,
  certificatePagePath,
} from '../js/certificates-schema.js';

test('slugify produces stable, URL-safe slugs', () => {
  assert.equal(slugify('Responsive Web Design Certificate'), 'responsive-web-design-certificate');
  assert.equal(slugify('Fintech & Design'), 'fintech-and-design');
  assert.equal(slugify('  Cafe Déjà Vu  '), 'cafe-deja-vu');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});

test('isValidUrl only accepts http/https URLs', () => {
  assert.equal(isValidUrl('https://example.com'), true);
  assert.equal(isValidUrl('http://localhost:8080'), true);
  assert.equal(isValidUrl('ftp://example.com'), false);
  assert.equal(isValidUrl('images/recipe/x.jpeg'), false);
  assert.equal(isValidUrl(''), false);
  assert.equal(isValidUrl(undefined), false);
});

test('escapeHtml preserves text without special chars', () => {
  assert.equal(escapeHtml('Hello World'), 'Hello World');
  assert.equal(escapeHtml('Test123'), 'Test123');
});

test('normalizeCertificate derives slug and required fields', () => {
  const cert = normalizeCertificate({
    title: 'Responsive Web Design',
    issuer: 'freeCodeCamp',
  });
  assert.equal(cert.slug, 'responsive-web-design');
  assert.equal(cert.title, 'Responsive Web Design');
  assert.equal(cert.issuer, 'freeCodeCamp');
  assert.equal(cert.status, 'published');
  assert.equal(cert.displayOrder, 0);
  assert.deepEqual(cert.image, null);
  assert.equal(cert.verificationUrl, '');
});

test('normalizeCertificate accepts optional fields', () => {
  const cert = normalizeCertificate({
    title: 'Test Certificate',
    issuer: 'Test Org',
    description: 'A test description',
    issueDate: '2026-05-14',
    expiryDate: '2031-05-14',
    credentialId: 'test-123',
    category: 'Web Development',
    skills: ['HTML', 'CSS'],
    displayOrder: 5,
  });
  assert.equal(cert.description, 'A test description');
  assert.equal(cert.issueDate, '2026-05-14');
  assert.equal(cert.expiryDate, '2031-05-14');
  assert.equal(cert.credentialId, 'test-123');
  assert.equal(cert.category, 'Web Development');
  assert.deepEqual(cert.skills, ['HTML', 'CSS']);
  assert.equal(cert.displayOrder, 5);
});

test('normalizeCertificate image URL fallback', () => {
  const cert = normalizeCertificate({
    title: 'Img Cert',
    issuer: 'Org',
    image: 'https://example.com/cert.png',
  });
  assert.equal(cert.image.src, 'https://example.com/cert.png');
  assert.equal(cert.image.alt, '');
  assert.equal(cert.image.provider, 'external');

  const cert2 = normalizeCertificate({
    title: 'Cloudinary Cert',
    issuer: 'Org',
    image: { src: 'https://res.cloudinary.com/demo/img.jpg', alt: 'A', publicId: 'p/a' },
  });
  assert.equal(cert2.image.src, 'https://res.cloudinary.com/demo/img.jpg');
  assert.equal(cert2.image.alt, 'A');
  assert.equal(cert2.image.publicId, 'p/a');
  assert.equal(cert2.image.provider, 'cloudinary');
});

test('normalizeCertificate verification URL validation', () => {
  const cert = normalizeCertificate({
    title: 'Url Cert',
    issuer: 'Org',
    verificationUrl: 'https://www.example.com/verify',
  });
  assert.equal(cert.verificationUrl, 'https://www.example.com/verify');

  const cert2 = normalizeCertificate({
    title: 'Bad Url Cert',
    issuer: 'Org',
    verificationUrl: 'javascript:alert(1)',
  });
  assert.equal(cert2.verificationUrl, '');

  const cert3 = normalizeCertificate({
    title: 'Empty Url Cert',
    issuer: 'Org',
    verificationUrl: '',
  });
  assert.equal(cert3.verificationUrl, '');
});

test('normalizeCertificate rejects entry without title', () => {
  assert.equal(normalizeCertificate(null), null);
  assert.equal(normalizeCertificate({ description: 'no title' }), null);
  assert.equal(normalizeCertificate({ title: '   ' }), null);
});

test('normalizeCertificates drops unusable entries and de-duplicates slugs', () => {
  const certs = normalizeCertificates([
    { title: 'Same Title', issuer: 'Org', description: 'a', displayOrder: 5 },
    { title: 'Same Title', issuer: 'Org', description: 'b', displayOrder: 2 },
    { description: 'no title' },
    { title: 'Third', issuer: 'Org', description: 'c', displayOrder: 9 },
  ]);
  assert.equal(certs.length, 3);
  const slugs = certs.map((c) => c.slug);
  assert.equal(new Set(slugs).size, 3);
  assert.deepEqual([...slugs].sort(), ['same-title', 'same-title-2', 'third']);
  // Sorted ascending by displayOrder.
  assert.deepEqual(certs.map((c) => c.title), ['Same Title', 'Same Title', 'Third']);
});

test('normalizeCertificates tolerates non-array input', () => {
  assert.deepEqual(normalizeCertificates(null), []);
  assert.deepEqual(normalizeCertificates({}), []);
});

test('publishedCertificates filters by status', () => {
  const certs = [
    { status: 'published', title: 'Published 1' },
    { status: 'draft', title: 'Draft 1', issuer: 'Org' },
    { status: 'published', title: 'Published 2' },
  ];
  assert.equal(publishedCertificates(certs).length, 2);
});

test('sortCertificates orders by displayOrder then issueDate then title', () => {
  const certs = sortCertificates([
    { title: 'C', displayOrder: 1, issueDate: '2026-01-01' },
    { title: 'A', displayOrder: 1, issueDate: '2026-03-01' },
    { title: 'B', displayOrder: 2, issueDate: '2026-02-01' },
    { title: 'D', displayOrder: 0, issueDate: '' },
  ]);
  assert.equal(certs[0].title, 'D'); // displayOrder 0 first
  assert.equal(certs[1].title, 'A'); // same order, later date first
  assert.equal(certs[2].title, 'C'); // same order, earlier date second
  assert.equal(certs[3].title, 'B'); // order 2 last
});

test('certificatePagePath builds an encoded query-string certificate URL', () => {
  assert.equal(certificatePagePath('my-project'), '/certificate?slug=my-project');
  assert.equal(certificatePagePath('a b/c'), '/certificate?slug=a%20b%2Fc');
});

import { DEFAULT_STATUS } from '../js/certificates-schema.js';

test('DEFAULT_STATUS is published', () => {
  assert.equal(DEFAULT_STATUS, 'published');
});

test('normalizeCertificate with expiryDate', () => {
  const cert = normalizeCertificate({
    title: 'Cert with Expiry',
    issuer: 'Org',
    expiryDate: '2030-12-31',
  });
  assert.equal(cert.expiryDate, '2030-12-31');
});

test('normalizeCertificate with YYYY-MM issue date', () => {
  const cert = normalizeCertificate({
    title: 'Cert Partial Date',
    issuer: 'Org',
    issueDate: '2026-06',
  });
  assert.equal(cert.issueDate, '2026-06-01');
});

test('normalizeCertificate with issueDate as Date object', () => {
  const cert = normalizeCertificate({
    title: 'Cert Date Object',
    issuer: 'Org',
    issueDate: new Date('2026-07-15'),
  });
  assert.equal(cert.issueDate, '2026-07-15');
});

test('sortCertificates with same displayOrder and same issueDate sorts by title', () => {
  const certs = sortCertificates([
    { title: 'M', displayOrder: 1, issueDate: '2026-01-01' },
    { title: 'A', displayOrder: 1, issueDate: '2026-01-01' },
    { title: 'L', displayOrder: 1, issueDate: '2026-01-01' },
  ]);
  assert.equal(certs[0].title, 'A');
  assert.equal(certs[1].title, 'L');
  assert.equal(certs[2].title, 'M');
});