/**
 * Authentication and authorization middleware
 */

/**
 * Require admin role for protected routes
 */
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Require authenticated user
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Debug middleware to log sessions
 */
function logSession(req, res, next) {
  console.log(`Session ID: ${req.sessionID}`);
  console.log(`Session User: ${req.session.user ? req.session.user.username : 'undefined'}`);
  console.log(`Request URL: ${req.url}`);
  next();
}

module.exports = {
  requireAdmin,
  requireAuth,
  logSession
};
