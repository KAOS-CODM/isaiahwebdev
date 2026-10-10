'use strict';

/**
 * POST /api/admin/publish/sweep — stale publish-job recovery (Gate 0 placeholder).
 *
 * The durable recovery contract is documented in
 * docs/PUBLISH_RECOVERY_CONTRACT.md. The executable sweep arrives with
 * publishing (Gate 2). Until then this route exists so the API surface is
 * stable and returns an explicit 501 instead of an ambiguous 404.
 */

const { applyApiHeaders } = require('../../../server/lib/security');
const { notImplemented } = require('../../../server/lib/errors');

module.exports = async function sweep(req, res) {
  applyApiHeaders(res);
  if (req.method !== 'POST') {
    const { badMethod } = require('../../../server/lib/errors');
    badMethod(res, ['POST']);
    return;
  }
  notImplemented(res, 'Publish-job sweep is not implemented in Gate 0. See docs/PUBLISH_RECOVERY_CONTRACT.md.');
};
