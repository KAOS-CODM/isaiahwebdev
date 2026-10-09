'use strict';

/**
 * GET /api/health — liveness probe (Gate 0).
 *
 * Reports database wiring state without opening connections or leaking
 * configuration: `db` is "unconfigured" until Gate 1 provides a URI, and
 * "not-checked" once configured (live checks arrive with Gate 1+).
 */

const { applyApiHeaders } = require('./lib/security');
const { badMethod } = require('./lib/errors');

module.exports = async function health(req, res) {
  applyApiHeaders(res);
  if (req.method !== 'GET') {
    badMethod(res, ['GET']);
    return;
  }
  const configured = Boolean(process.env.MONGODB_URI);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'isaiahwebdev-api',
      gate: 0,
      db: configured ? 'not-checked' : 'unconfigured',
      time: new Date().toISOString(),
    })
  );
};
