// ─── controllers/payoutController.js ─────────────────────────────────────────
// Automatic Razorpay X payout flow.
//
// Flow:
//   1. paymentController.verifyPayment → calls disburseToProvider()
//   2. disburseToProvider checks bank details:
//        YES → promote to pending_transfer → fireRazorpayPayout()
//               (test keys → mockTestPayout, no real API call)
//        NO  → stays 'held', frontend shows BankDetailsModal
//   3. Provider adds bank details → saveBankDetailsHandler auto-retries all held payouts

const Razorpay = require("razorpay");
const {
  getBankDetails,
  hasBankDetails,
  saveBankDetails,
  deleteBankDetails,
  createPayout,
  markPayoutPendingTransfer,
  markPayoutCompleted,
  markPayoutFailed,
  getHeldPayoutsForProvider,
  getPayoutsForProvider,
  getEarningsSummary,
} = require("../models/payoutModel");
const { query } = require("../config/db");

// ─── Razorpay instance ────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

// Razorpay test keys always begin with "rzp_test_".
// The live Payouts API requires a Razorpay X current account and is NOT
// available with test credentials — so we mock the transfer in test mode.
const IS_RAZORPAY_TEST = (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_");

if (IS_RAZORPAY_TEST) {
  console.warn(
    "[Payout] ⚠️  TEST MODE ACTIVE — payouts will be SIMULATED.\n" +
    "           No real money will be transferred to providers.\n" +
    "           Switch to rzp_live_ keys for real payouts."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST MODE — mock a payout without hitting Razorpay API
// ─────────────────────────────────────────────────────────────────────────────
async function mockTestPayout({ payoutId, netAmountPaise, paymentId, providerId }) {
  const fakeId = `pout_TEST_${Date.now()}_${payoutId}`;

  console.log(
    `[Payout][TEST] Simulated ₹${netAmountPaise / 100} payout` +
    ` → provider ${providerId} | fake id: ${fakeId}`
  );

  await markPayoutCompleted({
    payoutId,
    transferMode:      "TEST_IMPS",
    transferReference: fakeId,
    transferNote:      "Test mode — simulated payout, no real money moved",
    razorpayPayoutId:  fakeId,
  });

  return { id: fakeId, mode: "TEST_IMPS", status: "processed" };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE MODE — real Razorpay X payout via IMPS
// ─────────────────────────────────────────────────────────────────────────────
async function liveRazorpayPayout({ payoutId, bankDetails, netAmountPaise, paymentId, providerId }) {
  const razorpayPayout = await razorpay.payouts.create({
    account_number: process.env.RAZORPAY_ACCOUNT_NUMBER, // your Razorpay X current account
    fund_account: {
      account_type: "bank_account",
      bank_account: {
        name:           bankDetails.account_holder,
        ifsc:           bankDetails.ifsc_code,
        account_number: bankDetails.account_number,
      },
      contact: {
        name:         bankDetails.account_holder,
        type:         "vendor",
        reference_id: `provider_${providerId}`,
      },
    },
    amount:               netAmountPaise,   // paise
    currency:             "INR",
    mode:                 "IMPS",           // instant; Razorpay falls back to NEFT if needed
    purpose:              "payout",
    queue_if_low_balance: true,
    notes: {
      payment_id:  String(paymentId),
      provider_id: String(providerId),
      payout_id:   String(payoutId),
    },
  });

  await markPayoutCompleted({
    payoutId,
    transferMode:      razorpayPayout.mode,
    transferReference: razorpayPayout.id,
    transferNote:      `Razorpay auto-payout: ${razorpayPayout.id}`,
    razorpayPayoutId:  razorpayPayout.id,
  });

  return razorpayPayout;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED — routes to mock or live based on key type
// ─────────────────────────────────────────────────────────────────────────────
async function fireRazorpayPayout({ payoutId, bankDetails, netAmountPaise, paymentId, providerId }) {
  if (IS_RAZORPAY_TEST) {
    // Test keys — skip Razorpay API entirely, simulate success
    return await mockTestPayout({ payoutId, netAmountPaise, paymentId, providerId });
  }
  // Live keys — real Razorpay X IMPS transfer
  return await liveRazorpayPayout({ payoutId, bankDetails, netAmountPaise, paymentId, providerId });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL — called by paymentController.verifyPayment after payment confirmed
// ─────────────────────────────────────────────────────────────────────────────
async function disburseToProvider({ paymentId, providerId, appointmentId, amountPaise }) {
  try {
    const bankDetails = await getBankDetails(providerId);

    // Always create as 'held' — heldReason depends on whether bank details exist
    // This avoids 'no_bank_details' being stored even when provider has bank info
    const payout = await createPayout({
      paymentId,
      providerId,
      appointmentId,
      grossAmountPaise: amountPaise,
      hasBankInfo:      !!bankDetails,
    });

    if (!bankDetails) {
      // No bank info on file → stay held, frontend will show BankDetailsModal
      console.log(`[Payout] HELD — provider ${providerId} has no bank details`);
      return { success: false, needsBankDetails: true, payoutId: payout.id };
    }

    // Promote held → pending_transfer, then fire payout immediately
    await markPayoutPendingTransfer(payout.id);

    try {
      const result = await fireRazorpayPayout({
        payoutId:       payout.id,
        bankDetails,                          // full DB row (not masked)
        netAmountPaise: payout.net_amount_paise,
        paymentId,
        providerId,
      });

      console.log(
        `[Payout] ${IS_RAZORPAY_TEST ? "SIMULATED" : "SUCCESS"} —` +
        ` ₹${payout.net_amount_paise / 100} to provider ${providerId} (${result.id})`
      );

      return {
        success:         true,
        status:          "completed",
        payoutId:        payout.id,
        razorpayPayoutId: result.id,
        testMode:        IS_RAZORPAY_TEST,
      };

    } catch (razorpayErr) {
      // Payout call failed — mark failed, don't lose the record
      await markPayoutFailed({ payoutId: payout.id, reason: razorpayErr.message });
      console.error(`[Payout] FAILED — provider ${providerId}:`, razorpayErr.message);
      return { success: false, error: razorpayErr.message, payoutId: payout.id };
    }

  } catch (err) {
    console.error("[Payout] disburseToProvider error:", err.message);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/payouts/needs-bank-details
const checkNeedsBankDetails = async (req, res, next) => {
  try {
    let providerId;
    try {
      const profile = await getProviderProfile(req.user.id);
      providerId = profile.id;
    } catch {
      return res.json({ needsBankDetails: false, heldCount: 0, heldAmountPaise: 0, testMode: IS_RAZORPAY_TEST });
    }

    const has  = await hasBankDetails(providerId);
    const held = has ? [] : await getHeldPayoutsForProvider(providerId);

    res.json({
      needsBankDetails: !has,
      heldCount:        held.length,
      heldAmountPaise:  held.reduce((s, p) => s + p.net_amount_paise, 0),
      testMode:         IS_RAZORPAY_TEST,
    });
  } catch (err) { next(err); }
};

// GET /api/v1/payouts/bank-details
const getBankDetailsHandler = async (req, res, next) => {
  try {
    // Gracefully handle missing provider profile — return hasDetails:false
    // instead of throwing 404 (which would make the frontend show wrong state)
    let providerId;
    try {
      const profile = await getProviderProfile(req.user.id);
      providerId = profile.id;
    } catch {
      return res.json({ hasDetails: false });
    }

    const details = await getBankDetails(providerId);

    if (!details) return res.json({ hasDetails: false });

    // Mask account number — never send raw digits to frontend
    const masked = details.account_number
      ? `${"*".repeat(Math.max(0, details.account_number.length - 4))}${details.account_number.slice(-4)}`
      : "****";

    res.json({
      hasDetails:    true,
      accountHolder: details.account_holder,
      accountNumber: masked,
      ifscCode:      details.ifsc_code,
      bankName:      details.bank_name,
      branchName:    details.branch_name  || null,
      accountType:   details.account_type || "savings",
      upiId:         details.upi_id       || null,
      isVerified:    details.is_verified  || false,
      updatedAt:     details.updated_at,
    });
  } catch (err) { next(err); }
};

// POST /api/v1/payouts/bank-details
const saveBankDetailsHandler = async (req, res, next) => {
  try {
    const { id: providerId } = await getProviderProfile(req.user.id);

    const {
      accountHolder, accountNumber, confirmNumber,
      ifscCode, bankName, branchName, accountType, upiId,
    } = req.body;

    // Validate
    if (!accountHolder?.trim()) return res.status(400).json({ error: "Account holder name required" });
    if (!accountNumber?.trim()) return res.status(400).json({ error: "Account number required" });
    if (!confirmNumber?.trim()) return res.status(400).json({ error: "Confirm account number required" });
    if (accountNumber !== confirmNumber) return res.status(400).json({ error: "Account numbers do not match" });
    if (!ifscCode?.trim())      return res.status(400).json({ error: "IFSC code required" });
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
      return res.status(400).json({ error: "Invalid IFSC format (example: SBIN0001234)" });
    }
    if (!bankName?.trim())      return res.status(400).json({ error: "Bank name required" });

    await saveBankDetails({
      providerId,
      accountHolder: accountHolder.trim(),
      accountNumber: accountNumber.trim(),
      confirmNumber: confirmNumber.trim(),
      ifscCode:      ifscCode.toUpperCase().trim(),
      bankName:      bankName.trim(),
      branchName:    branchName?.trim() || null,
      accountType:   accountType || "savings",
      upiId:         upiId?.trim() || null,
    });

    // Auto-retry all held payouts now that bank details are saved
    const heldPayouts = await getHeldPayoutsForProvider(providerId);
    const bankDetails = await getBankDetails(providerId); // fresh full row for Razorpay
    const totalHeld   = heldPayouts.reduce((s, p) => s + p.net_amount_paise, 0);
    let transferred   = 0;
    let failed        = 0;

    for (const p of heldPayouts) {
      try {
        await markPayoutPendingTransfer(p.id);
        await fireRazorpayPayout({
          payoutId:       p.id,
          bankDetails,
          netAmountPaise: p.net_amount_paise,
          paymentId:      p.payment_id,
          providerId,
        });
        transferred++;
      } catch (err) {
        await markPayoutFailed({ payoutId: p.id, reason: err.message });
        console.error(`[Payout] Held retry failed for payout ${p.id}:`, err.message);
        failed++;
      }
    }

    const modeNote = IS_RAZORPAY_TEST ? " (test mode — simulated, no real transfer)" : "";

    res.json({
      success: true,
      message:
        transferred > 0
          ? `Bank details saved! ₹${(totalHeld / 100).toLocaleString("en-IN")} from ${transferred} payout(s) transferred${modeNote}.`
          : failed > 0
            ? `Bank details saved. ${failed} payout(s) failed to transfer — please contact support.`
            : "Bank details saved successfully.",
      transferred,
      failed,
      testMode: IS_RAZORPAY_TEST,
    });
  } catch (err) { next(err); }
};

// DELETE /api/v1/payouts/bank-details
const deleteBankDetailsHandler = async (req, res, next) => {
  try {
    const { id: providerId } = await getProviderProfile(req.user.id);
    await deleteBankDetails(providerId);
    res.json({ success: true, message: "Bank details removed" });
  } catch (err) { next(err); }
};

// GET /api/v1/payouts/my
const getMyPayouts = async (req, res, next) => {
  try {
    const { id: providerId } = await getProviderProfile(req.user.id);
    const [payouts, summary] = await Promise.all([
      getPayoutsForProvider(providerId),
      getEarningsSummary(providerId),
    ]);
    res.json({ payouts, summary, testMode: IS_RAZORPAY_TEST });
  } catch (err) { next(err); }
};

// GET /api/v1/payouts/summary
const getEarningsSummaryHandler = async (req, res, next) => {
  try {
    const { id: providerId } = await getProviderProfile(req.user.id);
    const summary = await getEarningsSummary(providerId);
    res.json({ ...summary, testMode: IS_RAZORPAY_TEST });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper — get provider_id from user_id
// ─────────────────────────────────────────────────────────────────────────────
async function getProviderProfile(userId) {
  const result = await query(
    "SELECT id FROM smartserve.provider_profiles WHERE user_id = $1",
    [userId]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error("Provider profile not found"), { status: 404 });
  }
  return result.rows[0];
}

module.exports = {
  disburseToProvider,        // called internally by paymentController
  checkNeedsBankDetails,
  getBankDetailsHandler,
  saveBankDetailsHandler,
  deleteBankDetailsHandler,
  getMyPayouts,
  getEarningsSummaryHandler,
};