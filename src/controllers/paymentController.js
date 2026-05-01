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
  sendBookingEmails,
  sendAcceptedEmails,
  sendRejectedEmail,
  sendOngoingEmail,
  sendCompletedEmails,
  sendCancelledEmails,
} = require("../utils/emailService");
const { getAppointmentById } = require("../models/appointmentModel");

// ─── Razorpay instance ────────────────────────────────────────────────────────
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn("⚠️  Razorpay keys are missing — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables");
}

// ─── POST /api/v1/payments/create-order ──────────────────────────────────────
// Called right after BookingModal confirms — creates Razorpay order
const createOrder = async (req, res, next) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: "appointmentId is required" });
    }

    // Verify appointment belongs to this user
    const appointment = await getAppointmentById(parseInt(appointmentId));
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    if (appointment.customer_id !== req.user.id) {
      return res.status(403).json({ error: "Not your appointment" });
    }

    // Check not already paid
    const existing = await getPaymentByAppointment(appointmentId);
    if (existing?.status === "paid") {
      return res.status(400).json({ error: "This appointment is already paid" });
    }

    // Convert ₹ to paise (Razorpay works in smallest currency unit)
    const amountPaise = Math.round(appointment.agreed_price * 100);

    if (!razorpay) {
      return res.status(500).json({ error: "Payment service is not configured" });
    }

    // Create Razorpay order
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

    // Save to DB
    const payment = await createPayment({
      appointmentId,
      razorpayOrderId: order.id,
      amountPaise,
    });

    // Mark appointment as awaiting payment
    await updateAppointmentPaymentStatus(appointmentId, "awaiting_payment");

    res.status(201).json({
      orderId:      order.id,
      amount:       amountPaise,
      currency:     "INR",
      keyId:        process.env.RAZORPAY_KEY_ID,
      appointmentId,
      serviceName:  appointment.service_name,
      paymentId:    payment.id,
      // Prefill data for Razorpay checkout
      prefill: {
        name:  req.user.full_name,
        email: req.user.email,
        phone: req.user.phone || "",
      },
    });
  } catch (err) { next(err); }
};

// ─── POST /api/v1/payments/verify ─────────────────────────────────────────────
// Called after Razorpay checkout succeeds on frontend
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
