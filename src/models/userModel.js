const { query } = require("../config/db");

// ── Users ─────────────────────────────────────────────────────────────────────

const findUserByEmail = async (email) => {
  const res = await query(
    "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
    [email.toLowerCase()]
  );
  return res.rows[0] || null;
};

const findUserById = async (id) => {
  const res = await query(
    "SELECT id, full_name, email, phone, city, role, is_active, created_at FROM users WHERE id = $1",
    [id]
  );
  return res.rows[0] || null;
};

const createUser = async ({ fullName, email, phone, city, hashedPassword, role }) => {
  const res = await query(
    `INSERT INTO users (full_name, email, phone, city, hashed_password, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, full_name, email, phone, city, role, created_at`,
    [fullName, email.toLowerCase(), phone, city, hashedPassword, role]
  );
  return res.rows[0];
};

const emailExists = async (email) => {
  const res = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  return res.rows.length > 0;
};

const phoneExists = async (phone) => {
  const res = await query("SELECT id FROM users WHERE phone = $1", [phone]);
  return res.rows.length > 0;
};

// ── Provider Profiles ─────────────────────────────────────────────────────────

const createProviderProfile = async (userId, data) => {
  const res = await query(
    `INSERT INTO provider_profiles
      (user_id, service_name, service_category, bio, experience_years,
       base_price_per_hour, service_areas, skills, id_proof_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      userId,
      data.serviceName,
      data.serviceCategory,
      data.bio || null,
      data.experienceYears || 0,
      data.basePricePerHour,
      data.serviceAreas || null,
      data.skills || null,
      data.idProofType || null,
    ]
  );
  return res.rows[0];
};

const getProviderByUserId = async (userId) => {
  const res = await query(
    `SELECT pp.*, u.full_name, u.email, u.phone, u.city
     FROM provider_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
};

const getProviderById = async (providerId) => {
  const res = await query(
    `SELECT pp.*, u.full_name, u.email, u.phone, u.city
     FROM provider_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.id = $1`,
    [providerId]
  );
  return res.rows[0] || null;
};

const listProviders = async ({ category, city, availableOnly, minRating, skip, limit, verificationStatus = 'verified' }) => {
  let conditions = ["u.is_active = TRUE"];
  let params = [];
  let idx = 1;

  // Handle verification status filtering
  if (verificationStatus === 'all') {
    // Include all verification statuses
  } else if (verificationStatus === 'verified') {
    conditions.push(`pp.verification_status = 'verified'`);
  } else {
    conditions.push(`pp.verification_status = $${idx++}`);
    params.push(verificationStatus);
  }

  if (category) { conditions.push(`pp.service_category ILIKE $${idx++}`); params.push(`%${category}%`); }
  if (city)     { conditions.push(`u.city ILIKE $${idx++}`);              params.push(`%${city}%`); }
  if (availableOnly) { conditions.push(`pp.is_available = TRUE`); }
  if (minRating > 0) { conditions.push(`pp.avg_rating >= $${idx++}`);     params.push(minRating); }

  params.push(limit, skip);

  const res = await query(
    `SELECT pp.id, pp.user_id, u.full_name, pp.service_name, pp.service_category,
            u.city, pp.avg_rating, pp.total_reviews, pp.experience_years,
            pp.base_price_per_hour, pp.is_available, pp.verification_status
     FROM provider_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY pp.avg_rating DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );
  return res.rows;
};

const updateProviderProfile = async (userId, fields) => {
  const allowed = [
    "service_name", "service_category", "bio", "experience_years",
    "base_price_per_hour", "service_areas", "skills",
    "available_days", "work_start_time", "work_end_time", "is_available",
  ];

  const sets = [];
  const vals = [];
  let i = 1;

  for (const [key, val] of Object.entries(fields)) {
    const col = key.replace(/([A-Z])/g, "_$1").toLowerCase(); // camelCase → snake_case
    if (allowed.includes(col)) {
      sets.push(`${col} = $${i++}`);
      vals.push(val);
    }
  }

  if (sets.length === 0) return null;
  sets.push(`updated_at = NOW()`);
  vals.push(userId);

  const res = await query(
    `UPDATE provider_profiles SET ${sets.join(", ")} WHERE user_id = $${i} RETURNING *`,
    vals
  );
  return res.rows[0] || null;
};

const setProviderAvailability = async (userId, isAvailable) => {
  const res = await query(
    `UPDATE provider_profiles SET is_available = $1, updated_at = NOW()
     WHERE user_id = $2 RETURNING is_available`,
    [isAvailable, userId]
  );
  return res.rows[0];
};

const updateProviderRating = async (providerId, rating) => {
  await query(
    `UPDATE provider_profiles
     SET avg_rating    = (
           SELECT ROUND(AVG(rating)::numeric, 2)
           FROM reviews WHERE provider_id = $1
         ),
         total_reviews = (
           SELECT COUNT(*) FROM reviews WHERE provider_id = $1
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [providerId]
  );
};

const updateVerificationStatus = async (providerId, status) => {
  const validStatuses = ['pending', 'verified', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid verification status');
  }

  const res = await query(
    `UPDATE provider_profiles
     SET verification_status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, verification_status`,
    [status, providerId]
  );
  return res.rows[0] || null;
};

module.exports = {
  findUserByEmail, findUserById, createUser, emailExists, phoneExists,
  createProviderProfile, getProviderByUserId, getProviderById,
  listProviders, updateProviderProfile, setProviderAvailability, updateProviderRating,
  updateVerificationStatus,
};
