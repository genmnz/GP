import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@ziko/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ziko/ui/components/card";
import { cn } from "@ziko/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	CongestionPanel,
	FlagsPanel,
	SignalPanel,
	Sparkline,
	VehiclesPanel,
} from "@/components/verdict/panels";
import { Stat } from "@/components/verdict/primitives";
import { openStream } from "@/lib/stream";
import type { Verdict } from "@/lib/types";
import { LABEL_STYLE, weight } from "@/lib/verdict";

export const Route = createFileRoute("/live")({
	component: LiveComponent,
});

type Status = "idle" | "connecting" | "live" | "error" | "stopped";

const DEFAULT_URL = "https://www.youtube.com/watch?v=M3EYAY2MftI";

const EXAMPLES = [
	{ label: "Roads (default)", url: DEFAULT_URL },
	{
		label: "Jackson Hole town square",
		url: "https://www.youtube.com/watch?v=1-iS7LArMPA",
	},
];

const MAX_POINTS = 60;

function LiveComponent() {
	const [url, setUrl] = useState(DEFAULT_URL);
	const [interval, setInterval] = useState(3);
	const [status, setStatus] = useState<Status>("idle");
	const [err, setErr] = useState<string | null>(null);
	const [verdict, setVerdict] = useState<Verdict | null>(null);
	const [history, setHistory] = useState<number[]>([]);
	const [vehHistory, setVehHistory] = useState<number[]>([]);
	const [frames, setFrames] = useState(0);
	const stopRef = useRef<(() => void) | null>(null);

	const stop = useCallback(() => {
		stopRef.current?.();
		stopRef.current = null;
		setStatus((s) => (s === "error" ? s : "stopped"));
	}, []);

	const start = useCallback(() => {
		if (!url.trim()) return;
		stopRef.current?.();
		setErr(null);
		setVerdict(null);
		setHistory([]);
		setVehHistory([]);
		setFrames(0);
		setStatus("connecting");
		stopRef.current = openStream(url.trim(), interval, {
			onOpen: () => setStatus("live"),
			onVerdict: (v) => {
				setStatus("live");
				setVerdict(v);
				setFrames((n) => n + 1);
				if (v.inference) {
					const w = weight(v.inference.traffic.label);
					setHistory((h) => [...h, w].slice(-MAX_POINTS));
				}
				if (v.vehicles) {
					setVehHistory((h) =>
						[...h, v.vehicles?.count ?? 0].slice(-MAX_POINTS),
					);
				}
			},
			onError: (m) => {
				setErr(m);
				setStatus("error");
			},
		});
	}, [url, interval]);

	// stop the stream when leaving the page
	useEffect(() => () => stopRef.current?.(), []);

	const inf = verdict?.inference;
	const running = status === "live" || status === "connecting";

	return (
		<div className="container mx-auto max-w-6xl px-4 py-8">
			<div className="mb-6 flex flex-col gap-1">
				<h1 className="font-semibold text-xl">Live stream</h1>
				<p className="text-muted-foreground text-sm">
					Plug in a street-camera stream — the model re-verdicts one sampled
					frame every {interval}s and updates in real time.
				</p>
			</div>

			{/* CONTROLS */}
			<Card className="mb-6">
				<CardContent className="flex flex-col gap-3 pt-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
						<label className="flex flex-1 flex-col gap-1">
							<span className="text-[11px] text-muted-foreground uppercase tracking-wide">
								stream URL
							</span>
							<input
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && !running && start()}
								placeholder="YouTube URL · HLS .m3u8 · RTSP · direct video URL"
								disabled={running}
								className="rounded-none border border-foreground/20 bg-foreground/5 px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-foreground/30 disabled:opacity-60"
							/>
						</label>
						<label className="flex flex-col gap-1">
							<span className="text-[11px] text-muted-foreground uppercase tracking-wide">
								interval (s)
							</span>
							<input
								type="number"
								min={1}
								max={30}
								value={interval}
								onChange={(e) => setInterval(Number(e.target.value) || 3)}
								disabled={running}
								className="w-24 rounded-none border border-foreground/20 bg-foreground/5 px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-foreground/30 disabled:opacity-60"
							/>
						</label>
						{running ? (
							<Button variant="destructive" onClick={stop}>
								Stop
							</Button>
						) : (
							<Button onClick={start} disabled={!url.trim()}>
								Go live
							</Button>
						)}
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<StatusDot status={status} />
						{err && <span className="text-red-400 text-xs">{err}</span>}
						<span className="ml-auto flex gap-2 text-muted-foreground text-xs">
							examples:
							{EXAMPLES.map((ex) => (
								<button
									key={ex.url}
									type="button"
									disabled={running}
									onClick={() => setUrl(ex.url)}
									className="underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
								>
									{ex.label}
								</button>
							))}
						</span>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
				{/* LEFT: live frame + telemetry */}
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Live frame</CardTitle>
							<CardDescription>
								sampled every {interval}s · frame #{verdict?.frame ?? 0}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="relative aspect-video overflow-hidden rounded-none bg-black ring-1 ring-foreground/10">
								{verdict?.thumb ? (
									// biome-ignore lint/performance/noImgElement: streamed data URI
									<img
										src={verdict.thumb}
										alt="live frame"
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
										{running ? "waiting for first frame…" : "stream offline"}
									</div>
								)}
								{inf && (
									<div className="absolute top-2 left-2 flex items-center gap-2">
										<span
											className={cn(
												"rounded-none px-2 py-0.5 font-mono font-semibold text-xs uppercase ring-1 backdrop-blur",
												LABEL_STYLE[inf.traffic.label].text,
												LABEL_STYLE[inf.traffic.label].ring,
												"bg-black/50",
											)}
										>
											{inf.traffic.label} ·{" "}
											{(inf.traffic.confidence * 100).toFixed(0)}%
										</span>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Telemetry</CardTitle>
							<CardDescription>
								congestion weight over time (1–4)
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<Sparkline
								data={history}
								min={1}
								max={4}
								hex="#60a5fa"
								height={48}
							/>
							{vehHistory.length > 0 && (
								<>
									<span className="text-[10px] text-muted-foreground uppercase tracking-wide">
										vehicles detected
									</span>
									<Sparkline
										data={vehHistory}
										min={0}
										max={Math.max(4, ...vehHistory)}
										hex="#a78bfa"
										height={40}
									/>
								</>
							)}
							<div className="grid grid-cols-3 gap-2">
								<Stat value={frames} caption="verdicts" />
								<Stat
									value={verdict?.uncertainty?.toFixed(2) ?? "—"}
									caption="uncertainty"
								/>
								<Stat
									value={
										verdict?.ts
											? new Date(verdict.ts * 1000).toLocaleTimeString()
											: "—"
									}
									caption="last update"
								/>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* RIGHT: verdict panels */}
				<div className="flex flex-col gap-4">
					{inf ? (
						<>
							<CongestionPanel inf={inf} uncertainty={verdict?.uncertainty} />
							{verdict?.plan && (
								<SignalPanel plan={verdict.plan} label={inf.traffic.label} />
							)}
							<VehiclesPanel
								vehicles={verdict?.vehicles}
								classifierLabel={inf.traffic.label}
							/>
							<FlagsPanel approach={verdict?.approach} inf={inf} />
						</>
					) : (
						<Card className="flex flex-1 items-center justify-center">
							<CardContent className="py-16 text-center text-muted-foreground text-sm">
								{running
									? "connecting to the model…"
									: "enter a stream URL and hit Go live."}
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
}

function StatusDot({ status }: { status: Status }) {
	const map: Record<Status, { c: string; t: string }> = {
		idle: { c: "bg-foreground/30", t: "idle" },
		connecting: { c: "bg-amber-400 animate-pulse", t: "connecting…" },
		live: { c: "bg-emerald-400 animate-pulse", t: "live" },
		error: { c: "bg-red-500", t: "error" },
		stopped: { c: "bg-foreground/30", t: "stopped" },
	};
	const m = map[status];
	return (
		<span className="inline-flex items-center gap-2 text-xs">
			<span className={cn("h-2 w-2 rounded-full", m.c)} />
			<span className="text-muted-foreground uppercase tracking-wide">
				{m.t}
			</span>
		</span>
	);
}
