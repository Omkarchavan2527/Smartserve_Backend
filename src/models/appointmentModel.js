const { query } = require("../config/db");

// Valid status transitions — same logic as Python version
const TRANSITIONS = {
  pending:   ["accepted", "rejected"],
  accepted:  ["ongoing",  "cancelled"],
  ongoing:   ["completed"],
  completed: [],
  rejected:  [],
  cancelled: [],
};

const createAppointment = async (data) => {
  const res = await query(
    `INSERT INTO appointments
       (customer_id, provider_id, service_name, description, location, area,
        scheduled_date, scheduled_start, scheduled_end, agreed_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.customerId, data.providerId, data.serviceName,
      data.description || null, data.location, data.area || null,
      data.scheduledDate, data.scheduledStart, data.scheduledEnd,
      data.agreedPrice,
    ]
  );
  return res.rows[0];
};

const getAppointmentById = async (id) => {
  const res = await query(
    `SELECT a.*,
            u.full_name  AS customer_name,
            pp.service_name AS provider_service_name
     FROM appointments a
     JOIN users u           ON u.id  = a.customer_id
     JOIN provider_profiles pp ON pp.id = a.provider_id
     WHERE a.id = $1`,
    [id]
  );
  return res.rows[0] || null;
};

const listAppointments = async ({ role, userId, providerId, status, skip, limit }) => {
  let conditions = [];
  let params = [];
  let i = 1;

  if (role === "user") {
    conditions.push(`a.customer_id = $${i++}`);
    params.push(userId);
  } else {
    conditions.push(`a.provider_id = $${i++}`);
    params.push(providerId);
  }

  if (status) {
    conditions.push(`a.status = $${i++}`);
    params.push(status);
  }

  params.push(limit, skip);

  const res = await query(
    `SELECT a.*,
            u.full_name       AS customer_name,
            pp.service_name   AS provider_service_name
     FROM appointments a
     JOIN users u             ON u.id  = a.customer_id
     JOIN provider_profiles pp ON pp.id = a.provider_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params
  );
  return res.rows;
};

const updateAppointmentStatus = async (id, newStatus, note) => {
  const fields = ["status = $1", "updated_at = NOW()"];
  const vals   = [newStatus];
  let i = 2;

  if (newStatus === "rejected")  { fields.push(`rejection_note  = $${i++}`); vals.push(note); }
  if (newStatus === "completed") { fields.push(`completion_note = $${i++}`); vals.push(note); fields.push(`completed_at = NOW()`); }
  if (newStatus === "accepted")  { fields.push(`accepted_at = NOW()`); }

  vals.push(id);
  const res = await query(
    `UPDATE appointments SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    vals
  );
  return res.rows[0];
};

const incrementProviderJobs = async (providerId) => {
  await query(
    "UPDATE provider_profiles SET total_jobs = total_jobs + 1 WHERE id = $1",
    [providerId]
  );
};

module.exports = {
  TRANSITIONS,
  createAppointment, getAppointmentById,
  listAppointments, updateAppointmentStatus, incrementProviderJobs,
};
