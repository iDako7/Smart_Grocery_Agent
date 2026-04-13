/**
 * global-setup.ts
 *
 * Playwright globalSetup hook — runs once before all e2e tests.
 *
 * Ensures the dev test user (00000000-0000-0000-0000-000000000001) exists in
 * PostgreSQL so that the backend's DEV_USER_ID resolves to a valid FK target
 * when creating sessions.
 *
 * Uses Docker exec to psql since the tests run against the Docker-hosted DB.
 * Falls back gracefully if Docker is unavailable (the user may already exist
 * from a previous run).
 */

import { execSync } from "child_process";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEV_USER_EMAIL = "e2e-test@example.com";

export default async function globalSetup() {
  const sql = `INSERT INTO users (id, email, created_at)
    VALUES ('${DEV_USER_ID}', '${DEV_USER_EMAIL}', NOW())
    ON CONFLICT (id) DO NOTHING;
    DELETE FROM user_profiles WHERE user_id = '${DEV_USER_ID}';`;

  try {
    execSync(
      `docker exec sga_v2-db-1 psql -U sga -d sga -c "${sql}"`,
      { stdio: "pipe" }
    );
    console.log(`[global-setup] Dev user ${DEV_USER_ID} seeded.`);
  } catch (err) {
    // If Docker exec fails (e.g., container not running), warn but don't abort.
    // The user may already exist from a prior run.
    console.warn(
      `[global-setup] Could not seed dev user via Docker — proceeding. Error: ${err}`
    );
  }
}
