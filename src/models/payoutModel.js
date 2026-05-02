// ─── models/payoutModel.js ────────────────────────────────────────────────────
const { query } = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// BANK DETAILS
// ─────────────────────────────────────────────────────────────────────────────

const getBankDetails = async (providerId) => {
  const res = await query(
    `SELECT * FROM smartserve.provider_bank_details WHERE provider_id = $1`,
    [providerId]
  );
  return res.rows[0] || null;
};

const hasBankDetails = async (providerId) => {
  const res = await query(
    `SELECT id FROM smartserve.provider_bank_details WHERE provider_id = $1`,
    [providerId]
  );
  return res.rows.length > 0;
};

const saveBankDetails = async ({
  providerId, accountHolder, accountNumber, confirmNumber,
  ifscCode, bankName, branchName, accountType, upiId,
}) => {
  const res = await query(
    `INSERT INTO smartserve.provider_bank_details
       (provider_id, account_holder, account_number, confirm_number,
        ifsc_code, bank_name, branch_name, account_type, upi_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (provider_id) DO UPDATE SET
       account_holder = EXCLUDED.account_holder,
       account_number = EXCLUDED.account_number,
       confirm_number = EXCLUDED.confirm_number,
       ifsc_code      = EXCLUDED.ifsc_code,
       bank_name      = EXCLUDED.bank_name,
       branch_name    = EXCLUDED.branch_name,
       account_type   = EXCLUDED.account_type,
       upi_id         = EXCLUDED.upi_id,
       is_verified    = FALSE,        -- re-verify after any change
       verified_at    = NULL,
       updated_at     = NOW()
     RETURNING *`,
    [
      providerId, accountHolder, accountNumber, confirmNumber || accountNumber,
      ifscCode, bankName, branchName || null, accountType || "savings", upiId || null,
    ]
  );
  return res.rows[0];
};

const deleteBankDetails = async (providerId) => {
  await query(
    `DELETE FROM smartserve.provider_bank_details WHERE provider_id = $1`,
    [providerId]
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUTS
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_FEE_PERCENT = 0; // set to e.g. 10 for 10% commission

const createPayout = async ({ paymentId, providerId, appointmentId, grossAmountPaise }) => {
  const platformFeePaise = Math.round(grossAmountPaise * PLATFORM_FEE_PERCENT / 100);
  const netAmountPaise   = grossAmountPaise - platformFeePaise;

  const res = await query(
    `INSERT INTO smartserve.payouts
       (payment_id, provider_id, appointment_id,
        gross_amount_paise, platform_fee_paise, net_amount_paise,
        status, held_reason)
     VALUES ($1,$2,$3,$4,$5,$6,'held','no_bank_details')
     RETURNING *`,
    [paymentId, providerId, appointmentId, grossAmountPaise, platformFeePaise, netAmountPaise]
  );
  return res.rows[0];
};

// Promote held → pending_transfer (called when bank details are added)
const markPayoutPendingTransfer = async (payoutId) => {
  const res = await query(
    `UPDATE smartserve.payouts
     SET status = 'pending_transfer', held_reason = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'held'
     RETURNING *`,
    [payoutId]
  );
  return res.rows[0];
};

// Admin: mark as processing
const markPayoutProcessing = async (payoutId) => {
  const res = await query(
    `UPDATE smartserve.payouts
     SET status = 'processing', initiated_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [payoutId]
  );
  return res.rows[0];
};

// Mark completed with Razorpay payout id + transfer reference
const markPayoutCompleted = async ({ payoutId, transferMode, transferReference, transferNote, razorpayPayoutId }) => {
  const res = await query(
    `UPDATE smartserve.payouts
     SET status             = 'completed',
         transfer_mode      = $2,
         transfer_reference = $3,
         transfer_note      = $4,
         razorpay_payout_id = $5,
         completed_at       = NOW(),
         updated_at         = NOW()
     WHERE id = $1
     RETURNING *`,
    [payoutId, transferMode, transferReference, transferNote || null, razorpayPayoutId || null]
  );
  return res.rows[0];
};

// Mark failed with reason
const markPayoutFailed = async ({ payoutId, reason }) => {
  const res = await query(
    `UPDATE smartserve.payouts
     SET status = 'failed', failure_reason = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [payoutId, reason]
  );
  return res.rows[0];
};

// Get all held payouts for provider (no bank details yet)
const getHeldPayoutsForProvider = async (providerId) => {
  const res = await query(
    `SELECT po.*, a.service_name, a.scheduled_date, a.agreed_price
     FROM smartserve.payouts po
     JOIN smartserve.appointments a ON a.id = po.appointment_id
     WHERE po.provider_id = $1 AND po.status = 'held'
     ORDER BY po.created_at ASC`,
    [providerId]
  );
  return res.rows;
};

// Get all payouts for a provider (all statuses)
const getPayoutsForProvider = async (providerId) => {
  const res = await query(
    `SELECT po.*, a.service_name, a.scheduled_date
     FROM smartserve.payouts po
     JOIN smartserve.appointments a ON a.id = po.appointment_id
     WHERE po.provider_id = $1
     ORDER BY po.created_at DESC`,
    [providerId]
  );
  return res.rows;
};

// Provider earnings summary
const getEarningsSummary = async (providerId) => {
  const res = await query(
    `SELECT
       COUNT(*)                                        AS total_payouts,
       COALESCE(SUM(net_amount_paise), 0)              AS total_earned_paise,
       COALESCE(SUM(CASE WHEN status='completed'
         THEN net_amount_paise END), 0)                AS received_paise,
       COALESCE(SUM(CASE WHEN status IN ('held','pending_transfer','processing')
         THEN net_amount_paise END), 0)                AS pending_paise,
       COUNT(CASE WHEN status='held'   THEN 1 END)     AS held_count,
       COUNT(CASE WHEN status='pending_transfer' OR status='processing'
                  THEN 1 END)                          AS processing_count,
       COUNT(CASE WHEN status='completed' THEN 1 END)  AS completed_count
     FROM smartserve.payouts
     WHERE provider_id = $1`,
    [providerId]
  );
  return res.rows[0];
};

module.exports = {
  // Bank details
  getBankDetails,
  hasBankDetails,
  saveBankDetails,
  deleteBankDetails,
  // Payouts
  createPayout,
  markPayoutPendingTransfer,
  markPayoutProcessing,
  markPayoutCompleted,
  markPayoutFailed,
  getHeldPayoutsForProvider,
  getPayoutsForProvider,
  getEarningsSummary,
  PLATFORM_FEE_PERCENT,
};