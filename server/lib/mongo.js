'use strict';

/**
 * lib/mongo.js — serverless-safe MongoDB client (Gate 1).
 *
 * - Reads only `MONGODB_URI` (staging: database `portfolio_staging` in the URI).
 * - Module-level cached promise: warm Vercel invocations reuse one client;
 *   concurrent calls in the same invocation coalesce onto one connect.
 * - Small pool (`maxPoolSize: 5`) and bounded server selection so a dead
 *   database fails fast instead of hanging the function.
 * - Errors are mapped to fixed codes/messages by `toSafeDbError()`; the URI,
 *   credentials, and stack traces never reach clients.
 */

const { MongoClient } = require('mongodb');
const nodeDns = require('node:dns');

/**
 * Public resolvers used for Atlas SRV lookups. Some local stub resolvers
 * (e.g. 127.0.0.1 forwarders that refuse SRV-type queries) break the driver's
 * seedlist resolution with ECONNREFUSED; pinning public resolvers works around
 * it. Applied process-wide at load and kept for the process lifetime because
 * the driver also re-polls SRV records in the background.
 */
const DEFAULT_DNS_SERVERS = Object.freeze(['8.8.8.8', '1.1.1.1']);

function configurePublicDns(resolver = nodeDns, servers = DEFAULT_DNS_SERVERS) {
  resolver.setServers(servers);
  return servers;
}

configurePublicDns();

const CONNECT_OPTIONS = Object.freeze({
  maxPoolSize: 5,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
});

function readUri(env = process.env) {
  const uri = env.MONGODB_URI;
  if (typeof uri !== 'string' || uri.trim().length === 0) {
    const err = new Error('Database unavailable: connection string is not configured.');
    err.code = 'DB_UNCONFIGURED';
    throw err;
  }
  return uri.trim();
}

function validateUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    const err = new Error('Database unavailable: invalid configuration.');
    err.code = 'DB_URI_INVALID';
    throw err;
  }
  if (parsed.protocol !== 'mongodb:' && parsed.protocol !== 'mongodb+srv:') {
    const err = new Error('Database unavailable: invalid configuration.');
    err.code = 'DB_URI_INVALID';
    throw err;
  }
  return uri;
}

function createMongoPool({ clientFactory, env = process.env, options = CONNECT_OPTIONS } = {}) {
  const makeClient =
    clientFactory ||
    ((uri, opts) => {
      const client = new MongoClient(uri, opts);
      return client.connect().then(() => client);
    });
  let cached = null;
  let inFlight = null;

  async function getClient() {
    if (cached) return cached;
    if (inFlight) return inFlight;
    const uri = validateUri(readUri(env));
    inFlight = Promise.resolve()
      .then(() => makeClient(uri, options))
      .then((client) => {
        cached = client;
        inFlight = null;
        return client;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
    return inFlight;
  }

  async function getDb() {
    const client = await getClient();
    return client.db();
  }

  function __resetForTests() {
    cached = null;
    inFlight = null;
  }

  function isConnected() {
    return cached !== null;
  }

  return { getClient, getDb, isConnected, __resetForTests };
}

// Default pool used by functions (single URI per deployment environment).
const defaultPool = createMongoPool();

function toSafeDbError(err) {
  if (err && (err.code === 'DB_UNCONFIGURED' || err.code === 'DB_URI_INVALID')) {
    return { status: 503, code: err.code, message: 'Database unavailable: invalid configuration.' };
  }
  return { status: 503, code: 'DB_UNAVAILABLE', message: 'Database temporarily unavailable.' };
}

module.exports = { createMongoPool, defaultPool, toSafeDbError, CONNECT_OPTIONS, configurePublicDns, DEFAULT_DNS_SERVERS };
