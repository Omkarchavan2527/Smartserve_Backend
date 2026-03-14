require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

// Create a dedicated pool with search_path hardcoded in the connection string
// This guarantees the right schema regardless of any timing issues
const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "smartserve_db",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "",
  // search_path baked directly into connection options — guaranteed to apply
  options:  "-c search_path=smartserve,public",
});

const seed = async () => {
  const client = await pool.connect();
  try {
    // Also set explicitly on this client just to be 100% sure
    await client.query("SET search_path TO smartserve, public");

    console.log("🌱  Seeding SmartServe demo data...");

    // Verify schema exists
    const schemaCheck = await client.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'smartserve'"
    );
    if (schemaCheck.rows.length === 0) {
      console.error("❌  Schema 'smartserve' not found — run 'npm run migrate' first");
      process.exit(1);
    }

    // Verify table exists
    const tableCheck = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'smartserve' AND table_name = 'users'"
    );
    if (tableCheck.rows.length === 0) {
      console.error("❌  Table 'smartserve.users' not found — run 'npm run migrate' first");
      process.exit(1);
    }

    const userHash     = await bcrypt.hash("user1234",     12);
    const providerHash = await bcrypt.hash("provider1234", 12);
    const athravHash   = await bcrypt.hash("athrav1234",   12);

    // Use fully-qualified table names (schema.table) on every query
    await client.query(`
      INSERT INTO smartserve.users (full_name, email, phone, city, hashed_password, role) VALUES
        ('Saksham Shinde',  'user@smartserve.com',     '9876543210', 'Mumbai', $1, 'user'),
        ('Sanket Chavan',   'provider@smartserve.com', '9876543211', 'Mumbai', $2, 'provider'),
        ('Athrav Bhosale',  'athrav@smartserve.com',   '9876543212', 'Pune',   $3, 'provider')
      ON CONFLICT (email) DO NOTHING
    `, [userHash, providerHash, athravHash]);

    console.log("   ✅  Users inserted");

    const sanket = await client.query(
      "SELECT id FROM smartserve.users WHERE email = 'provider@smartserve.com'"
    );
    const athrav = await client.query(
      "SELECT id FROM smartserve.users WHERE email = 'athrav@smartserve.com'"
    );

    if (sanket.rows.length) {
      await client.query(`
        INSERT INTO smartserve.provider_profiles
          (user_id, service_name, service_category, bio, experience_years,
           base_price_per_hour, service_areas, skills, verification_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified')
        ON CONFLICT (user_id) DO NOTHING
      `, [
        sanket.rows[0].id,
        "Sanket Electrical Services",
        "Electrician",
        "Certified electrician with 8+ years of experience.",
        8, 800,
        "Andheri,Bandra,Powai",
        "Wiring,Panel Upgrades,Lighting,Circuit Breakers",
      ]);
      console.log("   ✅  Sanket's provider profile inserted");
    }

    if (athrav.rows.length) {
      await client.query(`
        INSERT INTO smartserve.provider_profiles
          (user_id, service_name, service_category, bio, experience_years,
           base_price_per_hour, service_areas, skills, verification_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified')
        ON CONFLICT (user_id) DO NOTHING
      `, [
        athrav.rows[0].id,
        "Athrav Home Services",
        "Cleaning",
        "Professional deep cleaning specialist. Serving Pune for 5 years.",
        5, 500,
        "Pune,Kothrud,Baner,Wakad",
        "Deep Clean,Kitchen,Bathroom,Disinfection",
      ]);
      console.log("   ✅  Athrav's provider profile inserted");
    }

    console.log("\n✅  Seed complete! Demo accounts:");
    console.log("   📧  user@smartserve.com     / user1234     → Customer");
    console.log("   📧  provider@smartserve.com / provider1234 → Service Provider");
    console.log("   📧  athrav@smartserve.com   / athrav1234   → Service Provider\n");

  } catch (err) {
    console.error("❌  Seed failed:", err.message);
    console.error("    Detail:", err.detail || "none");
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();