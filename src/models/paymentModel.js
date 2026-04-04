// ─── models/paymentModel.js ───────────────────────────────────────────────────
const { query } = require("../config/db");

/**
 * Create a payment record when a Razorpay order is created.
 * amount is in PAISE (₹1 = 100 paise).
 */
const createPayment = async ({ appointmentId, razorpayOrderId, amountPaise, currency = "INR" }) => {
  const res = await query(
    `INSERT INTO smartserve.payments
       (appointment_id, razorpay_order_id, amount_paise, currency, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [appointmentId, razorpayOrderId, amountPaise, currency]
  );
  return res.rows[0];
};

/**
 * Mark payment as paid after signature verification succeeds.
 */
const markPaymentPaid = async ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  const res = await query(
    `UPDATE smartserve.payments
     SET status               = 'paid',
         razorpay_payment_id  = $2,
         razorpay_signature   = $3,
         paid_at              = NOW(),
         updated_at           = NOW()
     WHERE razorpay_order_id  = $1
     RETURNING *`,
    [razorpayOrderId, razorpayPaymentId, razorpaySignature]
  );
  return res.rows[0];
};

/**
 * Mark payment as failed.
 */
const markPaymentFailed = async ({ razorpayOrderId, reason }) => {
  const res = await query(
    `UPDATE smartserve.payments
     SET status         = 'failed',
         failure_reason = $2,
         updated_at     = NOW()
     WHERE razorpay_order_id = $1
     RETURNING *`,
    [razorpayOrderId, reason || "Payment failed"]
  );
  return res.rows[0];
};

/**
 * Get payment by appointment ID.
 */
const getPaymentByAppointment = async (appointmentId) => {
  const res = await query(
    `SELECT p.*,
            a.agreed_price,
            a.service_name,
            a.scheduled_date,
            cu.full_name  AS customer_name,
            cu.email      AS customer_email,
            pu.full_name  AS provider_name
     FROM smartserve.payments p
     JOIN smartserve.appointments a   ON a.id  = p.appointment_id
     JOIN smartserve.users cu         ON cu.id = a.customer_id
     JOIN smartserve.provider_profiles pp ON pp.id = a.provider_id
     JOIN smartserve.users pu         ON pu.id = pp.user_id
     WHERE p.appointment_id = $1`,
    [appointmentId]
  );
  return res.rows[0] || null;
};

/**
 * Get payment by Razorpay order ID (used in webhook).
 */
const getPaymentByOrderId = async (razorpayOrderId) => {
  const res = await query(
    `SELECT * FROM smartserve.payments WHERE razorpay_order_id = $1`,
    [razorpayOrderId]
  );
  return res.rows[0] || null;
};

/**
 * Update appointment payment_status column.
 */
const updateAppointmentPaymentStatus = async (appointmentId, paymentStatus) => {
  await query(
    `UPDATE smartserve.appointments
     SET payment_status = $1, updated_at = NOW()
     WHERE id = $2`,
    [paymentStatus, appointmentId]
  );
};

/**
 * Mark payment as refunded.
 */
const markPaymentRefunded = async (razorpayOrderId) => {
  const res = await query(
    `UPDATE smartserve.payments
     SET status      = 'refunded',
         refunded_at = NOW(),
         updated_at  = NOW()
     WHERE razorpay_order_id = $1
     RETURNING *`,
    [razorpayOrderId]
  );
  return res.rows[0];
};

module.exports = {
  createPayment,
  markPaymentPaid,
  markPaymentFailed,
  markPaymentRefunded,
  getPaymentByAppointment,
  getPaymentByOrderId,
  updateAppointmentPaymentStatus,
};