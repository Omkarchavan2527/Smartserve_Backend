const express = require("express");
const { body, query } = require("express-validator");
const router = express.Router();
const { authenticate, requireProvider } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  getProviders, getProvider, getMyProfile, updateMyProfile, toggleAvailability,
} = require("../controllers/providerController");

// GET /api/v1/providers  — public, with optional filters
router.get("/", getProviders);

// GET /api/v1/providers/me/profile  — must come BEFORE /:id
router.get("/me/profile", authenticate, requireProvider, getMyProfile);

// PUT /api/v1/providers/me/profile
router.put(
  "/me/profile",
  authenticate,
  requireProvider,
  [
    body("serviceName").optional().trim().notEmpty(),
    body("basePricePerHour").optional().isFloat({ min: 0 }),
  ],
  validate,
  updateMyProfile
);

// PATCH /api/v1/providers/me/availability
router.patch(
  "/me/availability",
  authenticate,
  requireProvider,
  [body("isAvailable").isBoolean().withMessage("isAvailable must be true or false")],
  validate,
  toggleAvailability
);

// GET /api/v1/providers/:id  — public
router.get("/:id", getProvider);

module.exports = router;
