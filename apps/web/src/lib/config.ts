// Runtime endpoints. Read straight from import.meta.env (with sane dev defaults)
// so the app boots even before .env exists — same pattern as lib/api.ts.
const env =
	(import.meta as { env?: Record<string, string | undefined> }).env ?? {};

/** The Bun backend (REST: /api/classify, /health). */
export const SERVER_URL = env.VITE_SERVER_URL ?? "http://localhost:3000";

/** The Python ML service (SSE live stream: /stream). The live dashboard talks to
 *  it directly so decoded frames never cross the network. */
export const ML_URL = env.VITE_ML_URL ?? "http://localhost:8000";
