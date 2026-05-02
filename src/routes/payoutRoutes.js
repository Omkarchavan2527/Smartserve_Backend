// ─── routes/payoutRoutes.js ───────────────────────────────────────────────────
const express  = require("express");
const { body } = require("express-validator");
const router   = express.Router();
const { authenticate, requireProvider } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  checkNeedsBankDetails,
  getBankDetailsHandler,
  saveBankDetailsHandler,
  deleteBankDetailsHandler,
  getMyPayouts,
  getEarningsSummaryHandler,
} = require("../controllers/payoutController");

// ── GET  /api/v1/payouts/needs-bank-details ───────────────────────────────────
router.get("/needs-bank-details", authenticate, requireProvider, checkNeedsBankDetails);

// ── GET  /api/v1/payouts/bank-details ─────────────────────────────────────────
router.get("/bank-details", authenticate, requireProvider, getBankDetailsHandler);

// ── POST /api/v1/payouts/bank-details ─────────────────────────────────────────
router.post(
  "/bank-details",
  authenticate,
  requireProvider,
  [
    body("accountHolder").trim().notEmpty().withMessage("Account holder name required"),
    body("accountNumber").trim().notEmpty().withMessage("Account number required"),
    body("confirmNumber").trim().notEmpty().withMessage("Confirm account number required"),
    body("ifscCode").trim().notEmpty().withMessage("IFSC code required"),
    body("bankName").trim().notEmpty().withMessage("Bank name required"),
    body("branchName").optional().isString(),
    body("accountType").optional().isIn(["savings", "current"]),
    body("upiId").optional().isString(),
  ],
  validate,
  saveBankDetailsHandler
);

// ── DELETE /api/v1/payouts/bank-details ───────────────────────────────────────
router.delete("/bank-details", authenticate, requireProvider, deleteBankDetailsHandler);

// ── GET  /api/v1/payouts/my ───────────────────────────────────────────────────
// Returns all payouts + earnings summary for the logged-in provider
router.get("/my", authenticate, requireProvider, getMyPayouts);

// ── GET  /api/v1/payouts/summary ──────────────────────────────────────────────
router.get("/summary", authenticate, requireProvider, getEarningsSummaryHandler);

module.exports = router;
