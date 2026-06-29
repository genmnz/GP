import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@ziko/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ziko/ui/components/card";
import { useRef, useState } from "react";
import {
	CongestionPanel,
	FlagsPanel,
	MethodPanel,
	SignalPanel,
} from "@/components/verdict/panels";
import { classify } from "@/lib/api";
import type { ClassifyResponse } from "@/lib/types";

export const Route = createFileRoute("/classify")({
	component: ClassifyComponent,
});

function ClassifyComponent() {
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<ClassifyResponse | null>(null);
	const [showJson, setShowJson] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function onPick(f: File | null) {
		setResult(null);
		setFile(f);
		setPreview(f ? URL.createObjectURL(f) : null);
	}

	async function onClassify() {
		if (!file) return;
		setLoading(true);
		try {
			setResult(await classify(file));
		} catch (e) {
			setResult({
				ok: false,
				error: e instanceof Error ? e.message : String(e),
			});
		} finally {
			setLoading(false);
		}
	}

	const inf = result?.inference;
	const plan = result?.plan;

	return (
		<div className="container mx-auto max-w-6xl px-4 py-8">
			<div className="mb-6 flex flex-col gap-1">
				<h1 className="font-semibold text-xl">Single-image classifier</h1>
				<p className="text-muted-foreground text-sm">
					Drop an intersection image — the ML service returns a structured
					verdict and the signal engine derives a plan from it.
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-[360px_1fr]">
				{/* INPUT */}
				<Card className="h-fit">
					<CardHeader>
						<CardTitle>Frame in</CardTitle>
						<CardDescription>road / intersection image</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<button
							type="button"
							onClick={() => inputRef.current?.click()}
							className="flex aspect-video items-center justify-center overflow-hidden rounded-none border border-foreground/20 border-dashed bg-foreground/5"
						>
							{preview ? (
								// biome-ignore lint/performance/noImgElement: local preview
								<img
									src={preview}
									alt="preview"
									className="h-full w-full object-cover"
								/>
							) : (
								<span className="text-muted-foreground text-sm">
									click to choose an image
								</span>
							)}
						</button>
						<input
							ref={inputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => onPick(e.target.files?.[0] ?? null)}
						/>
						<Button onClick={onClassify} disabled={!file || loading}>
							{loading ? "Classifying…" : "Classify"}
						</Button>
						{result && !result.ok && (
							<p className="text-red-400 text-sm">Error: {result.error}</p>
						)}
						{result?.ok && (
							<button
								type="button"
								onClick={() => setShowJson((s) => !s)}
								className="text-left text-muted-foreground text-xs underline-offset-2 hover:underline"
							>
								{showJson ? "hide" : "show"} raw JSON
							</button>
						)}
						{showJson && result && (
							<pre className="max-h-72 overflow-auto rounded-none bg-foreground/5 p-3 font-mono text-[10px] ring-1 ring-foreground/10">
								{JSON.stringify(result, null, 2)}
							</pre>
						)}
					</CardContent>
				</Card>

				{/* OUTPUT PANELS */}
				{inf ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<CongestionPanel inf={inf} />
						{plan && <SignalPanel plan={plan} label={inf.traffic.label} />}
						<FlagsPanel approach={result?.approach} inf={inf} />
						<MethodPanel inf={inf} plan={plan} />
					</div>
				) : (
					<Card className="flex items-center justify-center">
						<CardContent className="py-16 text-center text-muted-foreground text-sm">
							No verdict yet — pick an image and hit Classify.
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
