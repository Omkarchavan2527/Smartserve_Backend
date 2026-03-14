const {
  listProviders, getProviderById, getProviderByUserId,
  updateProviderProfile, setProviderAvailability,
} = require("../models/userModel");

// ── GET /api/v1/providers ─────────────────────────────────────────────────────
const getProviders = async (req, res, next) => {
  try {
    const {
      category, city,
      available_only: availableOnly = "false",
      min_rating: minRating = "0",
      skip = "0", limit = "20",
    } = req.query;

    const providers = await listProviders({
      category,
      city,
      availableOnly: availableOnly === "true",
      minRating: parseFloat(minRating),
      skip: parseInt(skip),
      limit: Math.min(parseInt(limit), 100),
    });

    res.json(providers);
  } catch (err) { next(err); }
};

// ── GET /api/v1/providers/:id ─────────────────────────────────────────────────
const getProvider = async (req, res, next) => {
  try {
    const provider = await getProviderById(parseInt(req.params.id));
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  } catch (err) { next(err); }
};

// ── GET /api/v1/providers/me/profile ─────────────────────────────────────────
const getMyProfile = async (req, res, next) => {
  try {
    const profile = await getProviderByUserId(req.user.id);
    if (!profile) return res.status(404).json({ error: "Provider profile not found" });
    res.json(profile);
  } catch (err) { next(err); }
};

// ── PUT /api/v1/providers/me/profile ─────────────────────────────────────────
const updateMyProfile = async (req, res, next) => {
  try {
    const updated = await updateProviderProfile(req.user.id, req.body);
    if (!updated) return res.status(404).json({ error: "Profile not found" });
    res.json(updated);
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/providers/me/availability ───────────────────────────────────
const toggleAvailability = async (req, res, next) => {
  try {
    const { isAvailable } = req.body;
    const result = await setProviderAvailability(req.user.id, isAvailable);
    res.json({
      isAvailable: result.is_available,
      message: `Status set to ${result.is_available ? "Online" : "Offline"}`,
    });
  } catch (err) { next(err); }
};

module.exports = { getProviders, getProvider, getMyProfile, updateMyProfile, toggleAvailability };
