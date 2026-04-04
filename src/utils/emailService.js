// ─── emailService.js ──────────────────────────────────────────────────────────
// Uses Resend (HTTPS API) instead of Nodemailer/SMTP.
// Render.com blocks outbound SMTP (port 587/465) on free tier.
// Resend uses HTTPS (port 443) which works everywhere.
//
// Setup:
//   1. npm install resend
//   2. Sign up at resend.com (free: 3,000 emails/month)
//   3. Add to .env:
//        RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
//        EMAIL_FROM=SmartServe <onboarding@resend.dev>
//
// Dev tip: use "onboarding@resend.dev" as from address — no domain needed.
// Production: add your own domain in Resend dashboard → Domains.

const { Resend } = require("resend");

let _resend = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn("⚠️  RESEND_API_KEY not set — emails will be logged only");
      return null;
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
    console.log("✅  Resend email client ready");
  }
  return _resend;
}

const ORANGE   = "#F97316";
const DARK     = "#1A1A2E";
const LIGHT_BG = "#F9FAFB";

function wrap(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:${DARK};padding:24px 32px;text-align:center;">
  <span style="font-size:26px;font-weight:800;color:${ORANGE};letter-spacing:-0.5px;">SmartServe</span>
  <p style="color:#9CA3AF;font-size:13px;margin:4px 0 0;">Professional Home Services</p>
</td></tr>
<tr><td style="padding:32px;">${content}</td></tr>
<tr><td style="background:${LIGHT_BG};padding:20px 32px;text-align:center;border-top:1px solid #E5E7EB;">
  <p style="font-size:12px;color:#9CA3AF;margin:0;">
    © 2026 SmartServe ·
    <a href="#" style="color:${ORANGE};text-decoration:none;">Help Center</a> ·
    <a href="#" style="color:${ORANGE};text-decoration:none;">Privacy Policy</a>
  </p>
  <p style="font-size:11px;color:#D1D5DB;margin:6px 0 0;">You received this because you have an account on SmartServe.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function apptBlock(appt) {
  const date = new Date(appt.scheduled_date).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:${LIGHT_BG};border-radius:12px;padding:20px;margin:20px 0;">
    <tr><td>
      ${row("Service",    appt.service_name)}
      ${row("Date",       date)}
      ${row("Time",       `${appt.scheduled_start} – ${appt.scheduled_end}`)}
      ${row("Location",   `${appt.location}${appt.area ? ", " + appt.area : ""}`)}
      ${row("Price",      `&#8377;${appt.agreed_price}`)}
      ${row("Booking ID", `#${appt.id}`)}
    </td></tr></table>`;
}

function row(label, value) {
  return `<tr><td style="padding:6px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:12px;color:#9CA3AF;font-weight:600;text-transform:uppercase;
                 letter-spacing:0.04em;width:110px;">${label}</td>
      <td style="font-size:14px;color:#374151;font-weight:500;">${value}</td>
    </tr></table>
  </td></tr>`;
}

function pill(label, color) {
  return `<span style="display:inline-block;background:${color}18;color:${color};
    border-radius:99px;padding:4px 14px;font-size:13px;font-weight:700;">${label}</span>`;
}

function cta(label, href) {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${href}" style="display:inline-block;background:${ORANGE};color:#fff;
      text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:12px;">
      ${label}
    </a>
  </div>`;
}

// ─── Core sender ──────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const client = getResend();
  if (!client) {
    console.log(`[Email skipped] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    const from = process.env.EMAIL_FROM || "SmartServe <onboarding@resend.dev>";
    const { data, error } = await client.emails.send({ from, to, subject, html });
    if (error) {
      console.error(`❌ Resend error to ${to}:`, error.message || JSON.stringify(error));
      return;
    }
    console.log(`✉️  Email sent → ${to} (ID: ${data?.id})`);
  } catch (err) {
    console.error(`❌ Email failed → ${to}:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Customer books
// ═══════════════════════════════════════════════════════════════════════════════
async function sendBookingEmails({ appointment, customerEmail, customerName, providerEmail, providerName }) {
  await sendEmail({
    to: customerEmail,
    subject: `📅 Booking Submitted – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Booking Submitted! 🎉</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>,<br>
      Your booking has been submitted. The provider will confirm shortly.</p>
      ${apptBlock(appointment)}
      <p style="font-size:13px;color:#6B7280;"><strong>Provider:</strong> ${providerName}</p>
      <div style="background:#FFF7ED;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid ${ORANGE};">
        <p style="font-size:13px;color:#92400E;margin:0;">
          ⏳ <strong>Awaiting Confirmation</strong> — ${providerName} will respond within 30 minutes.
        </p>
      </div>
      ${cta("View My Bookings", "https://smartserve.app/bookings")}
    `),
  });

  await sendEmail({
    to: providerEmail,
    subject: `🔔 New Booking Request – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">New Booking Request! 📅</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${providerName}</strong>,<br>
      You have a new request from <strong>${customerName}</strong>. Please respond within 30 minutes.</p>
      ${apptBlock(appointment)}
      <div style="background:#FFF7ED;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid ${ORANGE};">
        <p style="font-size:13px;color:#92400E;margin:0;">
          ⚡ Quick responses improve your rating and ranking on SmartServe.
        </p>
      </div>
      ${cta("Accept or Reject →", "https://smartserve.app/dashboard")}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Provider accepts
// ═══════════════════════════════════════════════════════════════════════════════
async function sendAcceptedEmails({ appointment, customerEmail, customerName, providerEmail, providerName }) {
  await sendEmail({
    to: customerEmail,
    subject: `✅ Booking Confirmed – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Booking Confirmed! ✅</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>,<br>
      <strong>${providerName}</strong> has accepted your booking.</p>
      ${pill("Accepted", "#22c55e")}
      ${apptBlock(appointment)}
      <div style="background:#F0FDF4;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #22c55e;">
        <p style="font-size:13px;color:#14532D;margin:0;">
          💳 <strong>Payment:</strong> You'll be prompted to pay once the provider starts work.
        </p>
      </div>
      ${cta("View Booking", "https://smartserve.app/bookings")}
    `),
  });

  await sendEmail({
    to: providerEmail,
    subject: `📋 You Accepted a Booking – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Booking Accepted 📋</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${providerName}</strong>,
      you accepted this booking. Customer: <strong>${customerName}</strong>.</p>
      ${apptBlock(appointment)}
      <div style="background:#EFF6FF;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #3b82f6;">
        <p style="font-size:13px;color:#1E3A8A;margin:0;">
          📍 Use the map in your dashboard to navigate to the customer's location.
        </p>
      </div>
      ${cta("Open Dashboard", "https://smartserve.app/dashboard")}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Provider rejects
// ═══════════════════════════════════════════════════════════════════════════════
async function sendRejectedEmail({ appointment, customerEmail, customerName, providerName, rejectionNote }) {
  await sendEmail({
    to: customerEmail,
    subject: `❌ Booking Unavailable – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Booking Could Not Be Confirmed</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>,<br>
      <strong>${providerName}</strong> is unable to take your booking at this time.</p>
      ${pill("Rejected", "#ef4444")}
      ${apptBlock(appointment)}
      ${rejectionNote ? `<div style="background:#FEF2F2;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #ef4444;">
        <p style="font-size:13px;color:#7F1D1D;margin:0;"><strong>Reason:</strong> ${rejectionNote}</p>
      </div>` : ""}
      <div style="background:#FFF7ED;border-radius:12px;padding:16px;margin:16px 0;">
        <p style="font-size:13px;color:#92400E;margin:0;">💡 Browse other available providers and rebook in seconds!</p>
      </div>
      ${cta("Find Another Provider", "https://smartserve.app")}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Provider starts work → customer must pay now
// ═══════════════════════════════════════════════════════════════════════════════
async function sendOngoingEmail({ appointment, customerEmail, customerName, providerName }) {
  await sendEmail({
    to: customerEmail,
    subject: `🔧 Work Started – Please Pay Now | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Service In Progress 🔧</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>,<br>
      <strong>${providerName}</strong> has started working on your service.</p>
      ${pill("In Progress", "#8b5cf6")}
      ${apptBlock(appointment)}
      <div style="background:linear-gradient(135deg,#FFF7ED,#FFEDD5);border-radius:14px;padding:20px;
        margin:20px 0;text-align:center;border:2px solid ${ORANGE};">
        <p style="font-size:18px;font-weight:800;color:#92400E;margin:0 0 6px;">💳 Payment Required</p>
        <p style="font-size:14px;color:#B45309;margin:0 0 16px;">
          Please pay <strong style="color:${ORANGE};font-size:18px;">&#8377;${appointment.agreed_price}</strong> to proceed.
        </p>
        ${cta("Pay Now →", "https://smartserve.app/bookings")}
      </div>
      <p style="font-size:12px;color:#9CA3AF;text-align:center;">🔒 Secured by Razorpay · PCI DSS Compliant</p>
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Job completed (after payment verified)
// ═══════════════════════════════════════════════════════════════════════════════
async function sendCompletedEmails({ appointment, customerEmail, customerName, providerEmail, providerName, completionNote }) {
  await sendEmail({
    to: customerEmail,
    subject: `🎉 Service Completed – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Service Completed! 🎉</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>,<br>
      <strong>${providerName}</strong> has completed your service!</p>
      ${pill("Completed", "#22c55e")}
      ${apptBlock(appointment)}
      ${completionNote ? `<div style="background:#F0FDF4;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid #22c55e;">
        <p style="font-size:13px;color:#14532D;margin:0;"><strong>Provider Note:</strong> ${completionNote}</p>
      </div>` : ""}
      <div style="background:linear-gradient(135deg,#FFF7ED,#FFEDD5);border-radius:14px;padding:20px;
        margin:20px 0;text-align:center;">
        <p style="font-size:16px;font-weight:700;color:#92400E;margin:0 0 6px;">⭐ How was your experience?</p>
        <p style="font-size:13px;color:#B45309;margin:0 0 14px;">Your feedback helps other customers find great providers.</p>
        ${cta("Leave a Review", "https://smartserve.app/bookings")}
      </div>
    `),
  });

  await sendEmail({
    to: providerEmail,
    subject: `💵 Job Completed – Payment Received | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Great Job! Payment Received 💵</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${providerName}</strong>,
      payment has been confirmed for this job!</p>
      ${apptBlock(appointment)}
      <div style="background:#F0FDF4;border-radius:12px;padding:20px;margin:16px 0;text-align:center;">
        <p style="font-size:13px;color:#9CA3AF;margin:0 0 4px;">Amount Earned</p>
        <p style="font-size:32px;font-weight:800;color:#16a34a;margin:0;">&#8377;${appointment.agreed_price}</p>
        <p style="font-size:12px;color:#9CA3AF;margin:6px 0 0;">Will be credited within 24 hours</p>
      </div>
      ${cta("View Earnings", "https://smartserve.app/dashboard")}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Customer cancels
// ═══════════════════════════════════════════════════════════════════════════════
async function sendCancelledEmails({ appointment, customerEmail, customerName, providerEmail, providerName }) {
  await sendEmail({
    to: customerEmail,
    subject: `🚫 Booking Cancelled – ${appointment.service_name} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Booking Cancelled</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>, your booking has been cancelled.</p>
      ${pill("Cancelled", "#9CA3AF")}
      ${apptBlock(appointment)}
      <div style="background:${LIGHT_BG};border-radius:12px;padding:16px;margin:16px 0;">
        <p style="font-size:13px;color:#6B7280;margin:0;">Need the service again? Rebook anytime from your bookings page.</p>
      </div>
      ${cta("Book Again", "https://smartserve.app")}
    `),
  });

  await sendEmail({
    to: providerEmail,
    subject: `🚫 Appointment Cancelled by Customer | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Appointment Cancelled</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${providerName}</strong>,
      this appointment was cancelled by <strong>${customerName}</strong>.</p>
      ${apptBlock(appointment)}
      <p style="font-size:13px;color:#6B7280;">This slot is now free in your calendar.</p>
      ${cta("View Dashboard", "https://smartserve.app/dashboard")}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. New review
// ═══════════════════════════════════════════════════════════════════════════════
async function sendReviewEmail({ providerEmail, providerName, reviewerName, rating, comment, serviceName }) {
  const stars = "⭐".repeat(Math.round(rating));
  await sendEmail({
    to: providerEmail,
    subject: `⭐ New Review – ${rating}/5 for ${serviceName} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">New Review! ${stars}</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${providerName}</strong>,
      <strong>${reviewerName}</strong> reviewed your <strong>${serviceName}</strong> service.</p>
      <div style="background:#FFF7ED;border-radius:14px;padding:24px;margin:16px 0;text-align:center;border:1px solid #FED7AA;">
        <div style="font-size:36px;margin-bottom:8px;">${stars}</div>
        <div style="font-size:28px;font-weight:800;color:${ORANGE};">${rating} / 5</div>
        ${comment ? `<p style="font-size:15px;color:#4B5563;margin:16px 0 0;font-style:italic;line-height:1.6;">"${comment}"</p>` : ""}
        <p style="font-size:13px;color:#9CA3AF;margin:12px 0 0;">— ${reviewerName}</p>
      </div>
      ${cta("View All Reviews", "https://smartserve.app/dashboard")}
    `),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Payment receipt
// ═══════════════════════════════════════════════════════════════════════════════
async function sendPaymentReceiptEmail({ customerEmail, customerName, providerName, serviceName, amountPaise, paymentId, appointmentId, scheduledDate }) {
  const amountRupees = (amountPaise / 100).toLocaleString("en-IN");
  const dateStr = new Date(scheduledDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  await sendEmail({
    to: customerEmail,
    subject: `💳 Payment Confirmed – &#8377;${amountRupees} for ${serviceName} | SmartServe`,
    html: wrap(`
      <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px;">Payment Successful ✅</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">Hi <strong>${customerName}</strong>, your payment has been received!</p>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
        <div style="font-size:13px;color:#16a34a;font-weight:600;margin-bottom:4px;">Amount Paid</div>
        <div style="font-size:36px;font-weight:800;color:#16a34a;">&#8377;${amountRupees}</div>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${LIGHT_BG};border-radius:12px;padding:16px;margin-bottom:20px;">
        <tr><td>
          ${row("Service",    serviceName)}
          ${row("Provider",   providerName)}
          ${row("Date",       dateStr)}
          ${row("Booking #",  `#${appointmentId}`)}
          ${row("Payment ID", paymentId.slice(-12))}
        </td></tr>
      </table>
      <p style="font-size:12px;color:#9CA3AF;text-align:center;">🔒 Payments secured by Razorpay · PCI DSS Compliant</p>
    `),
  });
}

module.exports = {
  sendBookingEmails,
  sendAcceptedEmails,
  sendRejectedEmail,
  sendOngoingEmail,
  sendCompletedEmails,
  sendCancelledEmails,
  sendReviewEmail,
  sendPaymentReceiptEmail,
};