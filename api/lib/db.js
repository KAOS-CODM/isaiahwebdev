'use strict';

/**
 * lib/db.js — cached Atlas connector contract (Gate 0).
 *
 * Gate 0 ships the connection-reuse pattern with an injectable driver so it
 * is fully testable without a database. Mongoose (or the native driver) is
 * introduced in Gate 1; nothing here opens a real connection.
 *
 * Usage in Gate 1+:
 *   const { createConnector } = require('./lib/db');
 *   const connector = createConnector({ driver: require('mongoose'), uri: process.env.MONGODB_URI });
 *   const conn = await connector.connect(); // cached across serverless invocations
 */

function createConnector({ driver, uri, options = {} } = {}) {
  if (!driver || typeof driver.connect !== 'function') {
    throw new TypeError('createConnector requires a driver with a connect(uri, options) function.');
  }
  let cached = null;
  let inFlight = null;

  async function connect() {
    if (cached) return cached;
    if (inFlight) return inFlight;
    if (!uri || typeof uri !== 'string' || uri.length === 0) {
      const err = new Error('Database unavailable: connection string is not configured.');
      err.code = 'DB_UNCONFIGURED';
      throw err;
    }
    inFlight = Promise.resolve()
      .then(() => driver.connect(uri, options))
      .then((conn) => {
        cached = conn;
        inFlight = null;
        return conn;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
    return inFlight;
  }

  function __resetForTests() {
    cached = null;
    inFlight = null;
  }

  function isConnected() {
    return cached !== null;
  }

  return { connect, isConnected, __resetForTests };
}

module.exports = { createConnector };
