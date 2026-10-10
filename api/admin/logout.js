'use strict';

/**
 * POST /api/admin/logout — revoke the current session (Gate 2 Phase 1).
 */

const { logoutRoute } = require('../../server/lib/auth-service');

module.exports = async function logout(req, res) {
  await logoutRoute(req, res);
};
