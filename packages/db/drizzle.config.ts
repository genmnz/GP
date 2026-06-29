import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "sqlite",
	dbCredentials: {
		// resolves to repo root from either packages/db or apps/server (both 2 levels deep)
		url: process.env.DATABASE_URL || "../../local.db",
	},
});
