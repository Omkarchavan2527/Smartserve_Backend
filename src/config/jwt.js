const jwt = require("jsonwebtoken");
require("dotenv").config();

const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 32) {
  console.warn("⚠️  JWT_SECRET is missing or too short — set it in .env");
}

/**
 * Create an access or refresh token.
 * Payload includes: sub (user id), role, type
 */
const createToken = (userId, role, type = "access") => {
  const expiresIn =
    type === "access"
      ? process.env.JWT_ACCESS_EXPIRES  || "60m"
      : process.env.JWT_REFRESH_EXPIRES || "7d";

  return jwt.sign(
    { sub: String(userId), role, type },
    SECRET,
    { expiresIn }
  );
};

/** Returns { sub, role, type } or throws JsonWebTokenError */
const verifyToken = (token) => jwt.verify(token, SECRET);

/** Create both tokens at once */
const createTokenPair = (userId, role) => ({
  accessToken:  createToken(userId, role, "access"),
  refreshToken: createToken(userId, role, "refresh"),
  tokenType:    "Bearer",
  role,
  userId,
});

module.exports = { createToken, verifyToken, createTokenPair };
