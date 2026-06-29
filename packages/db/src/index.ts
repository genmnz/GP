import { Database } from "bun:sqlite";
import { env } from "@ziko/env/server";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema";

export function createDb(url: string = env.DATABASE_URL) {
	// bun:sqlite is built into the Bun runtime — no native npm driver needed.
	const sqlite = new Database(url);
	sqlite.exec("PRAGMA journal_mode = WAL;");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	return drizzle({ client: sqlite, schema });
}

export const db = createDb();

export * from "./schema";
export { schema };
