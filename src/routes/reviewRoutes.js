const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const { authenticate, requireUser } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { postReview, getProviderReviews, getMyReviewsHandler } = require("../controllers/reviewController");

// POST /api/v1/reviews
router.post(
  "/",
  authenticate,
  requireUser,
  [
    body("appointmentId").isInt({ min: 1 }).withMessage("Valid appointment ID required"),
    body("rating").isFloat({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
    body("comment").optional().isString().isLength({ max: 1000 }),
  ],
  validate,
  postReview
);

// GET /api/v1/reviews/my  — must come BEFORE /provider/:id
router.get("/my", authenticate, getMyReviewsHandler);

// GET /api/v1/reviews/provider/:providerId  — public
router.get("/provider/:providerId", getProviderReviews);

module.exports = router;
