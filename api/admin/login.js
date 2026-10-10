'use strict';

/**
 * POST /api/admin/login — administrator login (Gate 2 Phase 1).
 */

const { loginRoute } = require('../../server/lib/auth-service');

module.exports = async function login(req, res) {
  await loginRoute(req, res);
};
