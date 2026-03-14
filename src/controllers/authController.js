const bcrypt = require("bcryptjs");
const { createTokenPair, verifyToken } = require("../config/jwt");
const {
  findUserByEmail, findUserById, createUser,
  emailExists, phoneExists, createProviderProfile,
} = require("../models/userModel");

// ── POST /api/v1/auth/lookup-email ────────────────────────────────────────────
// Auto-detect: frontend sends email on blur → returns role if account exists
const lookupEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await findUserByEmail(email);

    if (!user) {
      return res.json({ found: false, message: "No account found with this email" });
    }

    res.json({ found: true, role: user.role, message: `Account found — ${user.role}` });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/register/user ──────────────────────────────────────────
const registerUser = async (req, res, next) => {
  try {
    const { fullName, email, phone, city, password } = req.body;

    if (await emailExists(email)) return res.status(409).json({ error: "Email already registered" });
    if (await phoneExists(phone))  return res.status(409).json({ error: "Phone number already registered" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await createUser({ fullName, email, phone, city, hashedPassword, role: "user" });

    const tokens = createTokenPair(user.id, user.role);
    res.status(201).json({ ...tokens, fullName: user.full_name });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/register/provider ──────────────────────────────────────
const registerProvider = async (req, res, next) => {
  try {
    const {
      fullName, email, phone, city, password,
      serviceName, serviceCategory, bio, experienceYears,
      basePricePerHour, serviceAreas, skills, idProofType,
    } = req.body;

    if (await emailExists(email)) return res.status(409).json({ error: "Email already registered" });
    if (await phoneExists(phone))  return res.status(409).json({ error: "Phone number already registered" });

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user account
    const user = await createUser({ fullName, email, phone, city, hashedPassword, role: "provider" });

    // Create provider profile
    await createProviderProfile(user.id, {
      serviceName, serviceCategory, bio, experienceYears,
      basePricePerHour, serviceAreas, skills, idProofType,
    });

    const tokens = createTokenPair(user.id, user.role);
    res.status(201).json({ ...tokens, fullName: user.full_name });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password, roleHint } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordValid = await bcrypt.compare(password, user.hashed_password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // If frontend sent a role hint (manual toggle mode), validate it
    if (roleHint && roleHint !== user.role) {
      return res.status(403).json({
        error: `This account is registered as '${user.role}'. Please sign in with the correct role.`,
      });
    }

    const tokens = createTokenPair(user.id, user.role);
    res.json({ ...tokens, fullName: user.full_name });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    if (payload.type !== "refresh") {
      return res.status(401).json({ error: "Not a refresh token" });
    }

    const user = await findUserById(parseInt(payload.sub));
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "User not found" });
    }

    const tokens = createTokenPair(user.id, user.role);
    res.json({ ...tokens, fullName: user.full_name });
  } catch (err) { next(err); }
};

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────
const getMe = async (req, res) => {
  const { hashed_password, ...safeUser } = req.user;
  res.json(safeUser);
};

module.exports = { lookupEmail, registerUser, registerProvider, login, refreshToken, getMe };
