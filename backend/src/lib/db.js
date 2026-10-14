/**
 * Database connection module for MongoDB Atlas.
 * Provides connection lifecycle management for the portfolio_staging database.
 */

const { MongoClient } = require('mongodb');
const dns = require('dns');

const DB_NAME = 'portfolio_staging';

/**
 * Configures DNS servers for SRV record resolution.
 * Supports MONGODB_DNS_SERVERS environment variable with comma-separated DNS server addresses.
 * When configured, calls dns.setServers() before MongoDB driver performs SRV discovery.
 * When absent, preserves system's existing DNS configuration.
 * @returns {string[] | null} The configured DNS servers or null if using system defaults
 */
function configureDnsServers() {
  const dnsServersEnv = process.env.MONGODB_DNS_SERVERS;
  if (!dnsServersEnv || dnsServersEnv.trim() === '') {
    return null;
  }

  const servers = dnsServersEnv.split(',').map(s => s.trim()).filter(Boolean);
  if (servers.length === 0) {
    throw new Error('MONGODB_DNS_SERVERS contains no valid addresses');
  }

  // Validate each server address (basic IP address validation)
  for (const server of servers) {
    if (!isValidIpAddress(server)) {
      throw new Error(`Invalid DNS server address: ${server}`);
    }
  }

  dns.setServers(servers);
  return servers;
}

/**
 * Validates an IP address (IPv4 or IPv6).
 * @param {string} address - The address to validate
 * @returns {boolean}
 */
function isValidIpAddress(address) {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(address)) {
    const parts = address.split('.');
    return parts.every(part => parseInt(part, 10) <= 255);
  }

  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  if (ipv6Pattern.test(address)) {
    return true;
  }

  return false;
}

/**
 * Database connection state.
 * @type {{
 *   client: import('mongodb').MongoClient | null,
 *   db: import('mongodb').Db | null,
 *   connected: boolean,
 *   connecting: boolean,
 *   lastError: Error | null
 * }}
 */
const state = {
  client: null,
  db: null,
  connected: false,
  connecting: false,
  lastError: null,
};

/**
 * Maximum number of initial connection attempts.
 * @type {number}
 */
const MAX_INITIAL_RETRIES = process.env.NODE_ENV === 'test' ? 1 : 3;

/**
 * Delay between connection retry attempts in milliseconds.
 * @type {number}
 */
const RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 100 : 1000;

/**
 * Validates that the MongoDB URI is provided and non-empty.
 * @param {string|undefined} uri - The MongoDB URI from environment variable
 * @throws {Error} If URI is missing or empty
 */
function validateUri(uri) {
  if (!uri || uri.trim() === '') {
    throw new Error('MONGODB_URI environment variable is required but not set');
  }
}

/**
 * Creates a new MongoClient with safe default options.
 * @param {string} uri - MongoDB connection URI
 * @returns {import('mongodb').MongoClient}
 */
function createClient(uri) {
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  return new MongoClient(uri, {
    // Use safe defaults - the driver handles connection pooling and monitoring
    // maxPoolSize defaults to 100, minPoolSize defaults to 0
    // Use shorter serverSelectionTimeoutMS for faster failure detection in tests
    serverSelectionTimeoutMS: isTest ? 5000 : 30000,
    socketTimeoutMS: 360000,
    // The driver handles reconnection and server monitoring automatically
  });
}

/**
 * Attempts to connect to MongoDB with bounded retries.
 * @param {import('mongodb').MongoClient} client - The MongoClient instance
 * @param {number} retries - Number of retry attempts remaining
 * @returns {Promise<import('mongodb').Db>} The connected database handle
 */
async function connectWithRetry(client, retries = MAX_INITIAL_RETRIES) {
  try {
    await client.connect();
    // Verify the connection by pinging the database
    await client.db('admin').command({ ping: 1 });
    return client.db(DB_NAME);
  } catch (err) {
    if (retries > 0) {
      console.warn(`MongoDB connection attempt failed (${MAX_INITIAL_RETRIES - retries + 1}/${MAX_INITIAL_RETRIES}): ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return connectWithRetry(client, retries - 1);
    }
    throw err;
  }
}

/**
 * Establishes a connection to MongoDB Atlas.
 * Uses bounded retries on initial connection failure.
 * Updates global state on success or failure.
 * @returns {Promise<import('mongodb').Db>} The connected database handle
 * @throws {Error} If connection fails after all retries or if URI is invalid
 */
async function connect() {
  if (state.connected && state.db) {
    return state.db;
  }

  if (state.connecting) {
    // Wait for existing connection attempt to complete
    while (state.connecting) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (state.connected && state.db) {
      return state.db;
    }
  }

  const uri = process.env.MONGODB_URI;
  validateUri(uri);

  // Configure DNS servers before creating the MongoDB client
  configureDnsServers();

  state.connecting = true;
  state.lastError = null;

  const client = createClient(process.env.MONGODB_URI);

  try {
    const db = await connectWithRetry(client);
    state.client = client;
    state.db = db;
    state.connected = true;
    console.log(`MongoDB connected to database: ${DB_NAME}`);
    return db;
  } catch (err) {
    state.lastError = err;
    state.connecting = false;
    console.error(`MongoDB connection failed after ${MAX_INITIAL_RETRIES} attempts: ${err.message}`);
    throw err;
  } finally {
    state.connecting = false;
  }
}

/**
 * Returns the database handle if connected.
 * @returns {import('mongodb').Db | null} The database handle or null if not connected
 */
function getDb() {
  return state.db;
}

/**
 * Checks if the database is currently connected.
 * @returns {boolean}
 */
function isConnected() {
  return state.connected && state.db !== null;
}

/**
 * Returns the last connection error, if any.
 * @returns {Error | null}
 */
function getLastError() {
  return state.lastError;
}

/**
 * Closes the MongoDB connection cleanly.
 * Resets global state.
 * @returns {Promise<void>}
 */
async function close() {
  if (state.client) {
    try {
      await state.client.close();
      console.log('MongoDB connection closed');
    } catch (err) {
      console.error('Error closing MongoDB connection:', err.message);
    } finally {
      state.client = null;
      state.db = null;
      state.connected = false;
      state.connecting = false;
    }
  }
}

/**
 * Gets the current connection state for health/status reporting.
 * @returns {{ connected: boolean, database: string | null, error: string | null }}
 */
function getConnectionStatus() {
  return {
    connected: state.connected,
    database: state.connected ? DB_NAME : null,
    error: state.lastError ? state.lastError.message : null,
  };
}

module.exports = {
  connect,
  getDb,
  isConnected,
  getLastError,
  close,
  getConnectionStatus,
  DB_NAME,
};