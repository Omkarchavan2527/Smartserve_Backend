require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const morgan  = require("morgan");

const authRoutes        = require("./routes/authRoutes");
const providerRoutes    = require("./routes/providerRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const reviewRoutes      = require("./routes/reviewRoutes");
const { errorHandler }  = require("./middleware/errorHandler");

const app  = express();
const PORT = process.env.PORT || 8000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status:  "ok",
    app:     "SmartServe API",
    version: "1.0.0",
    docs:    "See README.md for API reference",
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/v1/auth",         authRoutes);
app.use("/api/v1/providers",    providerRoutes);
app.use("/api/v1/appointments", appointmentRoutes);
app.use("/api/v1/reviews",      reviewRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  SmartServe API running on http://localhost:${PORT}`);
  console.log(`📦  Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = app;
