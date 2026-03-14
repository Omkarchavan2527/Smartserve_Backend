const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  lookupEmail, registerUser, registerProvider,
  login, refreshToken, getMe,
} = require("../controllers/authController");

// POST /api/v1/auth/lookup-email
router.post(
  "/lookup-email",
  [body("email").isEmail().withMessage("Valid email required")],
  validate,
  lookupEmail
);

// POST /api/v1/auth/register/user
router.post(
  "/register/user",
  [
    body("fullName").trim().notEmpty().withMessage("Full name required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("phone").isMobilePhone().withMessage("Valid phone required"),
    body("city").trim().notEmpty().withMessage("City required"),
    body("password").isLength({ min: 8 }).withMessage("Password min 8 chars"),
  ],
  validate,
  registerUser
);

// POST /api/v1/auth/register/provider
router.post(
  "/register/provider",
  [
    body("fullName").trim().notEmpty().withMessage("Full name required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("phone").isMobilePhone().withMessage("Valid phone required"),
    body("city").trim().notEmpty().withMessage("City required"),
    body("password").isLength({ min: 8 }).withMessage("Password min 8 chars"),
    body("serviceName").trim().notEmpty().withMessage("Service name required"),
    body("serviceCategory").trim().notEmpty().withMessage("Service category required"),
    body("basePricePerHour").isFloat({ min: 0 }).withMessage("Base price must be a positive number"),
  ],
  validate,
  registerProvider
);

// POST /api/v1/auth/login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password required"),
    body("roleHint").optional().isIn(["user", "provider"]).withMessage("roleHint must be user or provider"),
  ],
  validate,
  login
);

// POST /api/v1/auth/refresh
router.post(
  "/refresh",
  [body("refreshToken").notEmpty().withMessage("Refresh token required")],
  validate,
  refreshToken
);

// GET /api/v1/auth/me
router.get("/me", authenticate, getMe);

module.exports = router;
