/**
 * api-base.js
 * Single source of truth for the deployed API origin.
 *
 * Deliberately a classic (non-module) script so it runs synchronously in <head>
 * before any deferred module script that consumes the API. It only sets the
 * production override on non-local hosts; on localhost/127.0.0.1 it leaves the
 * global unset so the shared resolver (js/api-config.js) keeps using
 * http://localhost:8080.
 */

'use strict';

(function () {
  var LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];
  var PRODUCTION_API_BASE = 'https://isaiahwebdev-api.onrender.com';

  var hostname = window.location && window.location.hostname;
  if (LOCAL_HOSTNAMES.indexOf(hostname) !== -1) {
    return;
  }

  window.PORTFOLIO_API_BASE = PRODUCTION_API_BASE;
})();
