// ─── routes/paymentRoutes.js ──────────────────────────────────────────────────
const express = require("express");
const { body } = require("express-validator");
const router  = express.Router();
const { authenticate, requireUser } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
  initiateRefund,
} = require("../controllers/paymentController");

// ── POST /api/v1/payments/create-order ───────────────────────────────────────
// Customer creates a Razorpay order for their appointment
router.post(
  "/create-order",
  authenticate,
  requireUser,
  [body("appointmentId").isInt({ min: 1 }).withMessage("Valid appointment ID required")],
  validate,
  createOrder
);

// ── POST /api/v1/payments/verify ──────────────────────────────────────────────
// Customer verifies payment after Razorpay checkout completes
router.post(
  "/verify",
  authenticate,
  requireUser,
  [
    body("razorpay_order_id").notEmpty().withMessage("razorpay_order_id required"),
    body("razorpay_payment_id").notEmpty().withMessage("razorpay_payment_id required"),
    body("razorpay_signature").notEmpty().withMessage("razorpay_signature required"),
    body("appointmentId").isInt({ min: 1 }).withMessage("appointmentId required"),
  ],
  validate,
  verifyPayment
);

// ── POST /api/v1/payments/webhook ─────────────────────────────────────────────
// Razorpay server → your server (no auth — verified by HMAC signature)
// IMPORTANT: This route needs raw body, NOT JSON parsed.
// In server.js, register this route BEFORE express.json() middleware.
router.post("/webhook", handleWebhook);

// ── GET /api/v1/payments/status/:appointmentId ────────────────────────────────
// Check payment status for an appointment
router.get("/status/:appointmentId", authenticate, getPaymentStatus);

// ── POST /api/v1/payments/refund ──────────────────────────────────────────────
// Initiate a refund (provider or admin only — adjust as needed)
router.post(
  "/refund",
  authenticate,
  [
    body("appointmentId").isInt({ min: 1 }).withMessage("appointmentId required"),
    body("reason").optional().isString(),
  ],
  validate,
  initiateRefund
);

module.exports = router;