'use strict';

/**
 * GET /api/admin/me — current-session inspection (Gate 2 Phase 1).
 */

const { meRoute } = require('../../server/lib/auth-service');

module.exports = async function me(req, res) {
  await meRoute(req, res);
};
