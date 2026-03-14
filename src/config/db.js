const { Pool } = require("pg");
require("dotenv").config();

const isSupabase = (process.env.DB_HOST || "").includes("supabase.com");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "postgres",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "",
  max:      10,

  // Longer timeouts for Supabase pooler
  idleTimeoutMillis:       60000,
  connectionTimeoutMillis: 10000,   // 10s instead of 2s

  // SSL required for Supabase
  ssl: isSupabase
    ? { rejectUnauthorized: false }
    : false,

  // search_path baked into connection
  options: "-c search_path=smartserve,public",
});

// Set search_path on every new connection
pool.on("connect", (client) => {
  client.query("SET search_path TO smartserve, public");
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌  Database connection failed:", err.message);
    console.error("    Check your .env DB_HOST, DB_USER, DB_PASSWORD, DB_NAME");
    console.error("\n    For Supabase, make sure you are using:");
    console.error("    DB_HOST  = pooler host (aws-0-xxx.pooler.supabase.com)");
    console.error("    DB_USER  = postgres.yourprojectref  (NOT just postgres)");
    console.error("    DB_PORT  = 5432 (Session mode)");
  } else {
    client.query("SET search_path TO smartserve, public", () => {
      console.log("✅  PostgreSQL connected — schema: smartserve");
      console.log(`    Host: ${process.env.DB_HOST}`);
      console.log(`    DB:   ${process.env.DB_NAME}`);
      console.log(`    SSL:  ${isSupabase ? "enabled (Supabase)" : "disabled (local)"}`);
      release();
    });
  }
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (process.env.NODE_ENV === "development") {
    console.log(`[SQL] ${Date.now() - start}ms — ${text.slice(0, 80)}`);
  }
  return res;
};

module.exports = { pool, query };