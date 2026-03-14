const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const { authenticate, requireUser } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  bookAppointment, getAppointments, getAppointment,
  updateStatus, cancelAppointment,
} = require("../controllers/appointmentController");

const VALID_STATUSES = ["accepted", "rejected", "ongoing", "completed", "cancelled"];

// POST /api/v1/appointments
router.post(
  "/",
  authenticate,
  requireUser,
  [
    body("providerId").isInt({ min: 1 }).withMessage("Valid provider ID required"),
    body("serviceName").trim().notEmpty().withMessage("Service name required"),
    body("location").trim().notEmpty().withMessage("Location required"),
    body("scheduledDate").isDate().withMessage("Valid date required (YYYY-MM-DD)"),
    body("scheduledStart").matches(/^\d{2}:\d{2}$/).withMessage("Start time format: HH:MM"),
    body("scheduledEnd").matches(/^\d{2}:\d{2}$/).withMessage("End time format: HH:MM"),
    body("agreedPrice").isFloat({ min: 0.01 }).withMessage("Price must be positive"),
  ],
  validate,
  bookAppointment
);

// GET /api/v1/appointments
router.get("/", authenticate, getAppointments);

// GET /api/v1/appointments/:id
router.get("/:id", authenticate, getAppointment);

// PATCH /api/v1/appointments/:id/status
router.patch(
  "/:id/status",
  authenticate,
  [
    body("status").isIn(VALID_STATUSES).withMessage(`Status must be one of: ${VALID_STATUSES.join(", ")}`),
    body("note").optional().isString(),
  ],
  validate,
  updateStatus
);

// DELETE /api/v1/appointments/:id
router.delete("/:id", authenticate, requireUser, cancelAppointment);

module.exports = router;
