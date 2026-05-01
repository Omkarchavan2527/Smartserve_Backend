// ─── controllers/paymentController.js ────────────────────────────────────────
const Razorpay  = require("razorpay");
const crypto    = require("crypto");
const { query } = require("../config/db");
const {
  createPayment,
  markPaymentPaid,
  markPaymentFailed,
  getPaymentByAppointment,
  getPaymentByOrderId,
  updateAppointmentPaymentStatus,
  markPaymentRefunded,
} = require("../models/paymentModel");

const {
  getAppointmentById,
  updateAppointmentStatus,
  incrementProviderJobs,
} = require("../models/appointmentModel");

// ── emailService — optional, never crashes payment flow ──────────────────────
let sendPaymentReceiptEmail = null;
try {
  const emailService = require("../utils/emailService");
  sendPaymentReceiptEmail = emailService.sendPaymentReceiptEmail || null;
} catch (e) {
  console.warn("[Payment] emailService not available — receipt emails disabled:", e.message);
}

// ── payoutController — optional, never crashes payment flow ──────────────────
let disburseToProvider = null;
try {
  disburseToProvider = require("./payoutController").disburseToProvider;
} catch (e) {
  console.warn("[Payment] payoutController not available — payouts disabled:", e.message);
}

// ─── Razorpay instance ────────────────────────────────────────────────────────
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn("⚠️  Razorpay keys missing — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
}

// ─── POST /api/v1/payments/create-order ──────────────────────────────────────
const createOrder = async (req, res, next) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: "appointmentId is required" });
    }

    const appointment = await getAppointmentById(parseInt(appointmentId));
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    if (appointment.customer_id !== req.user.id) {
      return res.status(403).json({ error: "Not your appointment" });
    }

    // Payment only allowed when provider has started work
    if (appointment.status !== "ongoing") {
      return res.status(400).json({
        error: `Payment only allowed when status is 'ongoing'. Current status: '${appointment.status}'.`,
      });
    }

    // Block duplicate payment
    const existing = await getPaymentByAppointment(appointmentId);
    if (existing?.status === "paid") {
      return res.status(400).json({ error: "This appointment is already paid" });
    }

    if (!razorpay) {
      return res.status(500).json({ error: "Payment service is not configured" });
    }

    const amountPaise = Math.round(appointment.agreed_price * 100);

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  `appt_${appointmentId}_${Date.now()}`,
      notes: {
        appointment_id: String(appointmentId),
        service_name:   appointment.service_name,
        customer_id:    String(req.user.id),
      },
    });

    const payment = await createPayment({
      appointmentId,
      razorpayOrderId: order.id,
      amountPaise,
    });

    await updateAppointmentPaymentStatus(appointmentId, "awaiting_payment");

    res.status(201).json({
      orderId:      order.id,
      amount:       amountPaise,
      currency:     "INR",
      keyId:        process.env.RAZORPAY_KEY_ID,
      appointmentId,
      serviceName:  appointment.service_name,
      paymentId:    payment.id,
      prefill: {
        name:  req.user.full_name,
        email: req.user.email,
        phone: req.user.phone || "",
      },
    });
  } catch (err) { next(err); }
};

// ─── POST /api/v1/payments/verify ─────────────────────────────────────────────
const verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appointmentId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    // ── Step 1: Verify HMAC-SHA256 signature ─────────────────────────────────
    const bodyStr  = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(bodyStr)
      .digest("hex");

    if (expected !== razorpay_signature) {
      await markPaymentFailed({
        razorpayOrderId: razorpay_order_id,
        reason: "Signature verification failed",
      });
      if (appointmentId) {
        await updateAppointmentPaymentStatus(appointmentId, "failed");
      }
      return res.status(400).json({ error: "Payment verification failed — invalid signature" });
    }

    // ── Step 2: Mark payment as paid in DB ────────────────────────────────────
    const payment = await markPaymentPaid({
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment record not found — contact support" });
    }

    // ── Step 3: Update payment_status on appointment → paid ───────────────────
    await updateAppointmentPaymentStatus(payment.appointment_id, "paid");

    // ── Step 4: Change appointment.status → completed ─────────────────────────
    await updateAppointmentStatus(
      payment.appointment_id,
      "completed",
      "Job completed — payment received"
    );
    console.log(`[Payment] Appointment ${payment.appointment_id} marked completed`);

    // ── Step 5: Increment provider job count ──────────────────────────────────
    const apptRes = await query(
      "SELECT provider_id FROM appointments WHERE id = $1",
      [payment.appointment_id]
    );
    const providerId = apptRes.rows[0]?.provider_id;

    if (providerId) {
      await incrementProviderJobs(providerId);
      console.log(`[Payment] Provider ${providerId} job count incremented`);
    }

    // ── Step 6: Trigger payout (non-fatal) ────────────────────────────────────
    if (providerId && disburseToProvider) {
      try {
        const payoutResult = await disburseToProvider({
          paymentId:     payment.id,
          providerId,
          appointmentId: payment.appointment_id,
          amountPaise:   payment.amount_paise,
        });
        if (payoutResult.needsBankDetails) {
          console.log(`[Payment] Provider ${providerId} needs bank details — payout held`);
        } else if (payoutResult.success) {
          console.log(`[Payment] Payout ${payoutResult.status} for provider ${providerId}`);
        }
      } catch (payoutErr) {
        // Non-fatal — payment is already marked paid
        console.error("[Payment] Payout trigger failed (non-fatal):", payoutErr.message);
      }
    }

    // ── Step 7: Send receipt email (non-fatal) ────────────────────────────────
    if (sendPaymentReceiptEmail) {
      try {
        const details = await getPaymentByAppointment(payment.appointment_id);
        if (details) {
          sendPaymentReceiptEmail({
            customerEmail: details.customer_email,
            customerName:  details.customer_name,
            providerName:  details.provider_name,
            serviceName:   details.service_name,
            amountPaise:   details.amount_paise,
            paymentId:     razorpay_payment_id,
            appointmentId: payment.appointment_id,
            scheduledDate: details.scheduled_date,
          }).catch(e => console.error("[Payment] Receipt email failed:", e.message));
        }
      } catch (emailErr) {
        console.error("[Payment] Email setup failed (non-fatal):", emailErr.message);
      }
    }

    // ── Step 8: Return success ────────────────────────────────────────────────
    res.json({
      success:       true,
      message:       "Payment verified successfully",
      paymentId:     razorpay_payment_id,
      appointmentId: payment.appointment_id,
      amountPaid:    payment.amount_paise / 100,
    });

  } catch (err) { next(err); }
};

// ─── POST /api/v1/payments/webhook ────────────────────────────────────────────
const handleWebhook = async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature     = req.headers["x-razorpay-signature"];
    const bodyStr       = JSON.stringify(req.body);
    const expected      = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyStr)
      .digest("hex");

    if (signature !== expected) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;
    if (!paymentEntity) return res.json({ received: true });

    const orderId = paymentEntity.order_id;

    if (event === "payment.captured") {
      const payment = await getPaymentByOrderId(orderId);
      if (payment && payment.status !== "paid") {
        await markPaymentPaid({
          razorpayOrderId:   orderId,
          razorpayPaymentId: paymentEntity.id,
          razorpaySignature: "",
        });
        await updateAppointmentPaymentStatus(payment.appointment_id, "paid");
        // Also complete appointment (idempotent — safe if already completed)
        await updateAppointmentStatus(
          payment.appointment_id,
          "completed",
          "Job completed — payment confirmed via webhook"
        );
      }
    }

    if (event === "payment.failed") {
      const payment = await getPaymentByOrderId(orderId);
      if (payment && payment.status === "pending") {
        await markPaymentFailed({
          razorpayOrderId: orderId,
          reason: paymentEntity.error_description || "Payment failed",
        });
        await updateAppointmentPaymentStatus(payment.appointment_id, "failed");
      }
    }

    if (event === "refund.processed") {
      const payment = await getPaymentByOrderId(orderId);
      if (payment) {
        await markPaymentRefunded(orderId);
        await updateAppointmentPaymentStatus(payment.appointment_id, "refunded");
      }
    }

    res.json({ received: true });
  } catch (err) { next(err); }
};

// ─── GET /api/v1/payments/status/:appointmentId ───────────────────────────────
const getPaymentStatus = async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId);

    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (appointment.customer_id !== req.user.id && req.user.role !== "provider") {
      return res.status(403).json({ error: "Access denied" });
    }

    const payment = await getPaymentByAppointment(appointmentId);
    if (!payment) return res.json({ status: "not_initiated", appointmentId });

    res.json({
      status:       payment.status,
      appointmentId,
      amountPaise:  payment.amount_paise,
      amountRupees: payment.amount_paise / 100,
      paymentId:    payment.razorpay_payment_id,
      orderId:      payment.razorpay_order_id,
      paidAt:       payment.paid_at,
    });
  } catch (err) { next(err); }
};

// ─── POST /api/v1/payments/refund ─────────────────────────────────────────────
const initiateRefund = async (req, res, next) => {
  try {
    const { appointmentId, reason } = req.body;

    const payment = await getPaymentByAppointment(appointmentId);
    if (!payment) return res.status(404).json({ error: "No payment found for this appointment" });
    if (payment.status !== "paid") return res.status(400).json({ error: "Only paid appointments can be refunded" });

    if (!razorpay) {
      return res.status(500).json({ error: "Payment service is not configured" });
    }

    const refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: payment.amount_paise,
      notes:  { reason: reason || "Customer requested refund", appointment_id: String(appointmentId) },
    });

    res.json({
      success:  true,
      refundId: refund.id,
      amount:   refund.amount / 100,
      status:   refund.status,
    });
  } catch (err) { next(err); }
};

module.exports = {
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
  initiateRefund,
};// Called after Razorpay checkout succeeds on frontend
// Verifies HMAC signature to confirm payment is genuine
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    // ── HMAC-SHA256 signature verification ───────────────────────────────────
    const body      = razorpay_order_id + "|" + razorpay_payment_id;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      // Signature mismatch — possible tampering
      await markPaymentFailed({ razorpayOrderId: razorpay_order_id, reason: "Signature verification failed" });
      await updateAppointmentPaymentStatus(appointmentId, "failed");
      return res.status(400).json({ error: "Payment verification failed — invalid signature" });
    }

    // ── Signature valid — mark as paid ───────────────────────────────────────
    const payment = await markPaymentPaid({
      razorpayOrderId:    razorpay_order_id,
      razorpayPaymentId:  razorpay_payment_id,
      razorpaySignature:  razorpay_signature,
    });

    await updateAppointmentPaymentStatus(payment.appointment_id, "paid");

    // Fetch full details to send receipt email
    const details = await getPaymentByAppointment(payment.appointment_id);
    if (details) {
      // Send receipt email — non-blocking
      
      sendPaymentReceiptEmail({
        customerEmail: details.customer_email,
        customerName:  details.customer_name,
        providerName:  details.provider_name,
        serviceName:   details.service_name,
        amountPaise:   details.amount_paise,
        paymentId:     razorpay_payment_id,
        appointmentId: payment.appointment_id,
        scheduledDate: details.scheduled_date,
      }).catch(console.error);
    }

    res.json({
      success:        true,
      message:        "Payment verified successfully",
      paymentId:      razorpay_payment_id,
      appointmentId:  payment.appointment_id,
      amountPaid:     payment.amount_paise / 100,
    });
  } catch (err) { next(err); }
};

// ─── POST /api/v1/payments/webhook ────────────────────────────────────────────
// Razorpay server-to-server webhook — secondary confirmation layer
// Set this URL in Razorpay dashboard → Settings → Webhooks
const handleWebhook = async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature
    const signature = req.headers["x-razorpay-signature"];
    const body      = JSON.stringify(req.body);
    const expected  = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expected) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;

    if (!paymentEntity) return res.json({ received: true });

    const orderId = paymentEntity.order_id;

    if (event === "payment.captured") {
      // Payment successful — idempotent (may already be verified via /verify)
      const payment = await getPaymentByOrderId(orderId);
      if (payment && payment.status !== "paid") {
        await markPaymentPaid({
          razorpayOrderId:   orderId,
          razorpayPaymentId: paymentEntity.id,
          razorpaySignature: "",
        });
        await updateAppointmentPaymentStatus(payment.appointment_id, "paid");
      }
    }

    if (event === "payment.failed") {
      const payment = await getPaymentByOrderId(orderId);
      if (payment && payment.status === "pending") {
        await markPaymentFailed({
          razorpayOrderId: orderId,
          reason: paymentEntity.error_description || "Payment failed",
        });
        await updateAppointmentPaymentStatus(payment.appointment_id, "failed");
      }
    }

    if (event === "refund.processed") {
      const payment = await getPaymentByOrderId(orderId);
      if (payment) {
        await markPaymentRefunded(orderId);
        await updateAppointmentPaymentStatus(payment.appointment_id, "refunded");
      }
    }

    res.json({ received: true });
  } catch (err) { next(err); }
};

// ─── GET /api/v1/payments/status/:appointmentId ───────────────────────────────
// Frontend polls this to check payment status
const getPaymentStatus = async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId);

    // Verify ownership
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (appointment.customer_id !== req.user.id && req.user.role !== "provider") {
      return res.status(403).json({ error: "Access denied" });
    }

    const payment = await getPaymentByAppointment(appointmentId);
    if (!payment) {
      return res.json({ status: "not_initiated", appointmentId });
    }

    res.json({
      status:         payment.status,
      appointmentId,
      amountPaise:    payment.amount_paise,
      amountRupees:   payment.amount_paise / 100,
      paymentId:      payment.razorpay_payment_id,
      orderId:        payment.razorpay_order_id,
      paidAt:         payment.paid_at,
    });
  } catch (err) { next(err); }
};

// ─── POST /api/v1/payments/refund ─────────────────────────────────────────────
// Admin / provider-initiated refund
const initiateRefund = async (req, res, next) => {
  try {
    const { appointmentId, reason } = req.body;

    const payment = await getPaymentByAppointment(appointmentId);
    if (!payment) return res.status(404).json({ error: "No payment found for this appointment" });
    if (payment.status !== "paid") return res.status(400).json({ error: "Only paid appointments can be refunded" });

    if (!razorpay) {
      return res.status(500).json({ error: "Payment service is not configured" });
    }

    // Call Razorpay refund API
    const refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: payment.amount_paise,
      notes:  { reason: reason || "Customer requested refund", appointment_id: String(appointmentId) },
    });

    // Will be confirmed via webhook event refund.processed
    res.json({
      success:  true,
      refundId: refund.id,
      amount:   refund.amount / 100,
      status:   refund.status,
    });
  } catch (err) { next(err); }
};

module.exports = {
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
  initiateRefund,
};
