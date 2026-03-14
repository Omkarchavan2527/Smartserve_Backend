/**
 * Global error handler middleware.
 * Must be the LAST middleware added in server.js
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // PostgreSQL unique constraint violation
  if (err.code === "23505") {
    const field = err.detail?.match(/\((.+?)\)/)?.[1] || "field";
    return res.status(409).json({ error: `${field} already exists` });
  }

  // PostgreSQL foreign key violation
  if (err.code === "23503") {
    return res.status(400).json({ error: "Referenced record does not exist" });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
