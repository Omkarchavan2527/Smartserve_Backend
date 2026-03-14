const { query } = require("../config/db");

const createReview = async ({ appointmentId, reviewerId, providerId, rating, comment }) => {
  const res = await query(
    `INSERT INTO reviews (appointment_id, reviewer_id, provider_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [appointmentId, reviewerId, providerId, rating, comment || null]
  );
  return res.rows[0];
};

const reviewExistsForAppointment = async (appointmentId) => {
  const res = await query(
    "SELECT id FROM reviews WHERE appointment_id = $1",
    [appointmentId]
  );
  return res.rows.length > 0;
};

const getReviewsByProvider = async (providerId, skip, limit) => {
  const res = await query(
    `SELECT r.*, u.full_name AS reviewer_name
     FROM reviews r
     JOIN users u ON u.id = r.reviewer_id
     WHERE r.provider_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [providerId, limit, skip]
  );
  return res.rows;
};

const getMyReviews = async (reviewerId) => {
  const res = await query(
    `SELECT r.*, u.full_name AS reviewer_name
     FROM reviews r
     JOIN users u ON u.id = r.reviewer_id
     WHERE r.reviewer_id = $1
     ORDER BY r.created_at DESC`,
    [reviewerId]
  );
  return res.rows;
};

module.exports = { createReview, reviewExistsForAppointment, getReviewsByProvider, getMyReviews };
