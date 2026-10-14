/**
 * Health endpoint handler.
 * GET /health → 200 + diagnostic JSON
 */

function healthHandler(req, res) {
  if (req.method !== 'GET') {
    return false; // Signal that method is not handled
  }

  const response = {
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(response));
  return true;
}

module.exports = { healthHandler };