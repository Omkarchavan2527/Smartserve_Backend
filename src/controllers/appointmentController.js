const {
  createAppointment, getAppointmentById, listAppointments,
  updateAppointmentStatus, incrementProviderJobs, TRANSITIONS,
} = require("../models/appointmentModel");
const { getProviderByUserId,getProviderById } = require("../models/userModel");
const { query } = require("../config/db");
const { sendEmail } = require("../utils/emailService");
// ── POST /api/v1/appointments ─────────────────────────────────────────────────
const bookAppointment = async (req, res, next) => {
  try {
    const {
      providerId, serviceName, description,
      location, area, scheduledDate,
      scheduledStart, scheduledEnd, agreedPrice,
    } = req.body;
    console.log("✅ Booking appointment with data:", req.body);
    process.stdout.write(`📝 Appointment data received at ${new Date().toISOString()}\n`);
    
    // Verify provider is verified + available
    const provCheck = await query(
      `SELECT id FROM provider_profiles
       WHERE id = $1 AND is_available = TRUE AND verification_status = 'verified'`,
      [providerId]
    );
    if (provCheck.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found or unavailable" });
    }

    const appointment = await createAppointment({
      customerId: req.user.id,
      providerId,
      serviceName, description, location, area,
      scheduledDate, scheduledStart, scheduledEnd,
      agreedPrice,
    });

    // Send booking confirmation email to customer
    try {
      await sendEmail({
        to: req.user.email,
        subject: "Appointment Booking Confirmed",
        template: "appointmentBooked",
        data: {
          customerName: req.user.full_name,
          serviceName,
          scheduledDate,
          scheduledStart,
          scheduledEnd,
          location,
          agreedPrice,
          appointmentId: appointment.id,
        },
      }).then(() => {
        console.log("Booking confirmation email sent successfully");
      }).catch((emailErr) => {
        console.error("Failed to send booking confirmation email:", emailErr);
      });
    } catch (emailErr) {
      console.error("Failed to send booking confirmation email:", emailErr);
      // Don't fail the booking if email fails
    }

     const provider = await getProviderById(providerId);

     try {
      await sendEmail({
        to: provider.email,
        subject: "New Appointment Booking",
        template: "newAppointmentProvider",
        data: {
          providerName: provider.full_name,
          customerName: req.user.full_name,
          serviceName,
          scheduledDate,
          scheduledStart,
          scheduledEnd,
          location,
          area,
          agreedPrice,
          appointmentId: appointment.id,
        },
      });
      console.log("New booking notification email sent to provider");
    } catch (emailErr) {
      console.error("Failed to send booking notification email to provider:", emailErr);
    }

    res.status(201).json(appointment);
  } catch (err) { next(err); }
};

// ── GET /api/v1/appointments ──────────────────────────────────────────────────
const getAppointments = async (req, res, next) => {
  try {
    const { status, skip = "0", limit = "20" } = req.query;
    const user = req.user;

    let providerId = null;
    if (user.role === "provider") {
      const profile = await getProviderByUserId(user.id);
      if (!profile) return res.json([]);
      providerId = profile.id;
    }

    const appointments = await listAppointments({
      role: user.role,
      userId: user.id,
      providerId,
      status,
      skip: parseInt(skip),
      limit: Math.min(parseInt(limit), 100),
    });

    res.json(appointments);
  } catch (err) { next(err); }
};

// ── GET /api/v1/appointments/:id ──────────────────────────────────────────────
const getAppointment = async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(parseInt(req.params.id));
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    checkOwnership(appointment, req.user, res);
    res.json(appointment);
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/appointments/:id/status ────────────────────────────────────
const updateStatus = async (req, res, next) => {
  try {
    const { status: newStatus, note } = req.body;
    const appointment = await getAppointmentById(parseInt(req.params.id));

    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (!checkOwnership(appointment, req.user, res)) return;

    // Validate transition
    const allowed = TRANSITIONS[appointment.status] || [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Cannot move from '${appointment.status}' to '${newStatus}'`,
        allowed,
      });
    }

    // Role restrictions
    const providerActions = ["accepted", "rejected", "ongoing", "completed"];
    const userActions     = ["cancelled"];

    if (providerActions.includes(newStatus) && req.user.role !== "provider") {
      return res.status(403).json({ error: "Only the provider can perform this action" });
    }
    if (userActions.includes(newStatus) && req.user.role !== "user") {
      return res.status(403).json({ error: "Only the customer can cancel" });
    }

    const updated = await updateAppointmentStatus(appointment.id, newStatus, note);

    // Get customer details for email
    const customerResult = await query(
      `SELECT email, full_name FROM users WHERE id = $1`,
      [appointment.customer_id]
    );
    const customer = customerResult.rows[0];

    // Send email notifications based on status change
    try {
      if (newStatus === "accepted") {
        // Email customer when appointment is accepted
        await sendEmail({
          to: customer.email,
          subject: "Appointment Accepted",
          template: "appointmentAccepted",
          data: {
            customerName: customer.full_name,
            serviceName: appointment.service_name,
            scheduledDate: appointment.scheduled_date,
            scheduledStart: appointment.scheduled_start,
            scheduledEnd: appointment.scheduled_end,
            location: appointment.location,
            appointmentId: appointment.id,
            note,
          },
        });
      } else if (newStatus === "completed") {
        // Email customer when appointment is completed
        await sendEmail({
          to: customer.email,
          subject: "Appointment Completed",
          template: "appointmentCompleted",
          data: {
            customerName: customer.full_name,
            serviceName: appointment.service_name,
            scheduledDate: appointment.scheduled_date,
            agreedPrice: appointment.agreed_price,
            appointmentId: appointment.id,
            note,
          },
        });
      }
    } catch (emailErr) {
      console.error("Failed to send status update email:", emailErr);
      // Don't fail the status update if email fails
    }

    // Increment provider job count on completion
    if (newStatus === "completed") {
      await incrementProviderJobs(appointment.provider_id);
    }

    res.json(updated);
  } catch (err) { next(err); }
};

// ── DELETE /api/v1/appointments/:id ──────────────────────────────────────────
const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = await getAppointmentById(parseInt(req.params.id));

    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    if (appointment.customer_id !== req.user.id) {
      return res.status(403).json({ error: "Not your appointment" });
    }
    if (!["pending", "accepted"].includes(appointment.status)) {
      return res.status(400).json({
        error: `Cannot cancel an appointment with status '${appointment.status}'`,
      });
    }

    await updateAppointmentStatus(appointment.id, "cancelled", null);
    res.status(204).send();
  } catch (err) { next(err); }
};

// ── Helper ────────────────────────────────────────────────────────────────────
function checkOwnership(appointment, user, res) {
  if (user.role === "user" && appointment.customer_id !== user.id) {
    res.status(403).json({ error: "Not your appointment" });
    return false;
  }
  return true;
}

module.exports = { bookAppointment, getAppointments, getAppointment, updateStatus, cancelAppointment };