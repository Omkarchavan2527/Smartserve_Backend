const {
  createReview, reviewExistsForAppointment,
  getReviewsByProvider, getMyReviews,
} = require("../models/reviewModel");
const { updateProviderRating } = require("../models/userModel");
const { query } = require("../config/db");

// ── POST /api/v1/reviews ──────────────────────────────────────────────────────
const postReview = async (req, res, next) => {
  try {
    const { appointmentId, rating, comment } = req.body;

    // Verify appointment: must be completed and belong to this customer
    const apptRes = await query(
      `SELECT * FROM appointments
       WHERE id = $1 AND customer_id = $2 AND status = 'completed'`,
      [appointmentId, req.user.id]
    );

    if (apptRes.rows.length === 0) {
      return res.status(404).json({
        error: "Appointment not found, not completed, or not yours",
      });
    }

    const appointment = apptRes.rows[0];

    // Prevent duplicate reviews
    if (await reviewExistsForAppointment(appointmentId)) {
      return res.status(409).json({ error: "You already reviewed this appointment" });
    }

    // Create review
    const review = await createReview({
      appointmentId,
      reviewerId: req.user.id,
      providerId: appointment.provider_id,
      rating,
      comment,
    });

    // Recalculate provider avg_rating
    await updateProviderRating(appointment.provider_id);

    res.status(201).json({ ...review, reviewer_name: req.user.full_name });
  } catch (err) { next(err); }
};

// ── GET /api/v1/reviews/provider/:providerId ──────────────────────────────────
const getProviderReviews = async (req, res, next) => {
  try {
    const { skip = "0", limit = "10" } = req.query;
    const reviews = await getReviewsByProvider(
      parseInt(req.params.providerId),
      parseInt(skip),
      Math.min(parseInt(limit), 50)
    );
    res.json(reviews);
  } catch (err) { next(err); }
};

// ── GET /api/v1/reviews/my ────────────────────────────────────────────────────
const getMyReviewsHandler = async (req, res, next) => {
  try {
    const reviews = await getMyReviews(req.user.id);
    res.json(reviews);
  } catch (err) { next(err); }
};

module.exports = { postReview, getProviderReviews, getMyReviewsHandler };
