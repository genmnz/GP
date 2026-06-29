import { SERVER_URL as BASE } from "./config";
import type { ClassifyResponse } from "./types";

/** Send one image (+ optional audio) to the backend classifier and get JSON back. */
export async function classify(
	image: File,
	audio?: File,
): Promise<ClassifyResponse> {
	const fd = new FormData();
	fd.append("image", image);
	if (audio) fd.append("audio", audio);

	const res = await fetch(`${BASE}/api/classify`, { method: "POST", body: fd });
	const json = (await res.json()) as ClassifyResponse;
	if (!res.ok && json.error === undefined) {
		return { ok: false, error: `server returned ${res.status}` };
	}
	return json;
}
