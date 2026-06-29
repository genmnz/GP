/**
 * Apply Drizzle migrations against a bun:sqlite database.
 * Run with: `bun run db:migrate` (from the @ziko/db package).
 *
 * We avoid `drizzle-kit push` for the local file DB and instead generate SQL
 * (`db:generate`) + apply it with the bun-sqlite migrator, which needs no
 * external sqlite driver.
 */
import dotenv from "dotenv";

dotenv.config({ path: "../../apps/server/.env" });

const { Database } = await import("bun:sqlite");
const { drizzle } = await import("drizzle-orm/bun-sqlite");
const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");

const url = process.env.DATABASE_URL ?? "../../local.db";
const sqlite = new Database(url);
const db = drizzle({ client: sqlite });

migrate(db, { migrationsFolder: "./src/migrations" });
console.log(`migrations applied to ${url}`);
sqlite.close();
