const { verifyToken } = require("../config/jwt");
const { query } = require("../config/db");

/**
 * authenticate — verifies Bearer token, attaches req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = header.slice(7);
    const payload = verifyToken(token);

    if (payload.type !== "access") {
      return res.status(401).json({ error: "Invalid token type" });
    }

    // Fetch user from DB to confirm still active
    const result = await query(
      "SELECT id, full_name, email, phone, city, role, is_active FROM users WHERE id = $1",
      [parseInt(payload.sub)]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "User not found or deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired — please refresh" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};

/** requireUser — customer-only routes */
const requireUser = (req, res, next) => {
  if (req.user?.role !== "user") {
    return res.status(403).json({ error: "Only customers can perform this action" });
  }
  next();
};

/** requireProvider — provider-only routes */
const requireProvider = (req, res, next) => {
  if (req.user?.role !== "provider") {
    return res.status(403).json({ error: "Only service providers can perform this action" });
  }
  next();
};

module.exports = { authenticate, requireUser, requireProvider };
