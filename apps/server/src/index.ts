import { cors } from "@elysiajs/cors";
import { env } from "@ziko/env/server";
import { Elysia } from "elysia";
import { api } from "./api";

new Elysia()
	.use(
		cors({
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "OPTIONS"],
		}),
	)
	.get("/", () => "OK")
	.get("/health", () => ({ status: "ok", ml: env.ML_URL }))
	.use(api)
	.listen(3000, () => {
		console.log("Server is running on http://localhost:3000");
	});
