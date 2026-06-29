// Reusable "scientific" verdict panels, shared by /classify and /live.
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ziko/ui/components/card";
import { cn } from "@ziko/ui/lib/utils";
import type {
	Approach,
	Inference,
	SignalPlan,
	TrafficLabel,
	Vehicles,
} from "@/lib/types";
import { TRAFFIC_LABELS } from "@/lib/types";
import {
	agreement,
	entropy,
	LABEL_BLURB,
	LABEL_STYLE,
	probsOf,
	W_MAX,
	WEIGHTS,
	weight,
} from "@/lib/verdict";
import {
	Bar,
	FlagPill,
	LabelChip,
	RingGauge,
	Sparkline,
	Stat,
	TrafficLight,
} from "./primitives";

// ─── Congestion ──────────────────────────────────────────────────────────────
export function CongestionPanel({
	inf,
	uncertainty,
}: {
	inf: Inference;
	uncertainty?: number;
}) {
	const label = inf.traffic.label;
	const style = LABEL_STYLE[label];
	const probs = probsOf(inf);
	const u = uncertainty ?? entropy(probs);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Congestion verdict</CardTitle>
				<CardDescription>
					4-class EfficientNetV2 classifier · weight W = {weight(label)}/{W_MAX}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-1.5">
						<LabelChip label={label} />
						<span className="text-muted-foreground text-xs">
							{LABEL_BLURB[label]}
						</span>
					</div>
					<RingGauge
						value={inf.traffic.confidence}
						hex={style.hex}
						label={`${(inf.traffic.confidence * 100).toFixed(0)}%`}
						sub="confidence"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					{TRAFFIC_LABELS.map((l) => (
						<Bar
							key={l}
							label={l}
							value={probs[l]}
							colorClass={LABEL_STYLE[l].bg}
							highlight={l === label}
						/>
					))}
				</div>

				<div className="flex items-center gap-2 border-foreground/10 border-t pt-3">
					<span className="w-20 text-[10px] text-muted-foreground uppercase tracking-wide">
						uncertainty
					</span>
					<div className="h-1.5 flex-1 overflow-hidden rounded-none bg-foreground/10">
						<div
							className="h-full bg-sky-400"
							style={{
								width: `${Math.round(u * 100)}%`,
								transition: "width 500ms",
							}}
						/>
					</div>
					<span className="w-10 text-right font-mono text-xs tabular-nums">
						{u.toFixed(2)}
					</span>
				</div>
				<p className="text-[10px] text-muted-foreground leading-relaxed">
					Uncertainty = normalised entropy of the class distribution (0 =
					certain, 1 = uniform guess).
				</p>
			</CardContent>
		</Card>
	);
}

// ─── Signal plan ─────────────────────────────────────────────────────────────
export function SignalPanel({
	plan,
	label,
}: {
	plan: SignalPlan;
	label: TrafficLabel;
}) {
	const maxGreen = Math.max(1, ...plan.phases.map((p) => p.green));
	return (
		<Card>
			<CardHeader>
				<CardTitle>Signal plan</CardTitle>
				<CardDescription>
					demand-proportional green split · bounded cycle
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<TrafficLight label={label} />
					<div className="grid flex-1 grid-cols-3 gap-2">
						<Stat value={`${plan.cycle}s`} caption="cycle C" />
						<Stat value={plan.demand.toFixed(2)} caption="demand D" />
						<Stat
							value={plan.preempt ? "ON" : "—"}
							caption="preempt"
							accent={plan.preempt ? "text-red-400" : undefined}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					{plan.phases.map((ph) => (
						<div key={ph.approachId} className="flex items-center gap-2">
							<span className="w-24 truncate text-muted-foreground text-xs">
								{ph.approachId}
							</span>
							<div className="h-2.5 flex-1 overflow-hidden rounded-none bg-foreground/10">
								<div
									className="h-full bg-emerald-500"
									style={{
										width: `${Math.round((ph.green / maxGreen) * 100)}%`,
										transition: "width 500ms",
									}}
								/>
							</div>
							<span className="w-12 text-right font-mono text-xs tabular-nums">
								{ph.green}s
							</span>
						</div>
					))}
				</div>
				<p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
					D = ΣW(labelᵢ) / (W_max·N) · C = clamp(C_min + (C_max−C_min)·D)
				</p>
			</CardContent>
		</Card>
	);
}

// ─── Emergency / accident flags ──────────────────────────────────────────────
export function FlagsPanel({
	approach,
	inf,
}: {
	approach?: Approach;
	inf: Inference;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Event flags</CardTitle>
				<CardDescription>
					accident / emergency fusion · drives preemption
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				<FlagPill on={inf.accident.detected} label="accident" />
				<FlagPill on={inf.ambulance.detected} label="ambulance" />
				<FlagPill on={inf.siren.detected} label="siren" />
				<FlagPill on={!!approach?.emergency} label="emergency" />
			</CardContent>
		</Card>
	);
}

// ─── Vehicle count cross-check (the literal "detect cars") ───────────────────
export function VehiclesPanel({
	vehicles,
	classifierLabel,
}: {
	vehicles?: Vehicles;
	classifierLabel: TrafficLabel;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Vehicle count</CardTitle>
				<CardDescription>
					COCO-pretrained YOLO · objective density cross-check
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{!vehicles ? (
					<p className="text-muted-foreground text-xs leading-relaxed">
						Vehicle counting is an optional ML-service feature (YOLO). Not
						active for this verdict.
					</p>
				) : (
					<>
						<div className="flex items-center justify-between">
							<div className="flex items-baseline gap-2">
								<span className="font-mono font-semibold text-3xl tabular-nums">
									{vehicles.count}
								</span>
								<span className="text-muted-foreground text-xs">vehicles</span>
							</div>
							<LabelChip label={vehicles.label} size="sm" />
						</div>
						<AgreementBadge
							classifier={classifierLabel}
							counter={vehicles.label}
						/>
						<p className="text-[10px] text-muted-foreground leading-relaxed">
							Count → label via calibrated thresholds. Agreement with the
							classifier is a free, viewpoint-robust sanity check.
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function AgreementBadge({
	classifier,
	counter,
}: {
	classifier: TrafficLabel;
	counter: TrafficLabel;
}) {
	const a = agreement(classifier, counter);
	const map = {
		match: {
			txt: "classifier ✓ counter agree",
			cls: "text-emerald-400 ring-emerald-500/40",
		},
		near: {
			txt: "adjacent (±1 level)",
			cls: "text-amber-400 ring-amber-500/40",
		},
		off: { txt: "disagree (≥2 levels)", cls: "text-red-400 ring-red-500/40" },
	} as const;
	const m = map[a];
	return (
		<span
			className={cn(
				"inline-flex w-fit items-center rounded-none bg-foreground/5 px-2 py-0.5 font-medium text-xs ring-1",
				m.cls,
			)}
		>
			{m.txt}
		</span>
	);
}

// ─── Method / equations (the academic panel) ─────────────────────────────────
export function MethodPanel({
	inf,
	plan,
}: {
	inf: Inference;
	plan?: SignalPlan;
}) {
	const probs = probsOf(inf);
	const u = entropy(probs);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Method</CardTitle>
				<CardDescription>how the verdict becomes a decision</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-xs">
				<div className="grid grid-cols-4 gap-2">
					{TRAFFIC_LABELS.map((l) => (
						<div
							key={l}
							className="flex flex-col items-center rounded-none bg-foreground/5 py-1.5 ring-1 ring-foreground/10"
						>
							<span className={cn("font-mono text-sm", LABEL_STYLE[l].text)}>
								{WEIGHTS[l]}
							</span>
							<span className="text-[10px] text-muted-foreground">{l}</span>
						</div>
					))}
				</div>
				<dl className="flex flex-col gap-1.5 font-mono text-[11px] text-muted-foreground">
					<Row k="W(pred)" v={`${weight(inf.traffic.label)} / ${W_MAX}`} />
					<Row k="confidence" v={inf.traffic.confidence.toFixed(3)} />
					<Row k="entropy (uncertainty)" v={u.toFixed(3)} />
					{plan && <Row k="demand D" v={plan.demand.toFixed(3)} />}
					{plan && <Row k="cycle C" v={`${plan.cycle}s`} />}
				</dl>
				<p className="text-[10px] text-muted-foreground leading-relaxed">
					Report metric is <b>mean weighted error</b> e = |W(pred)−W(true)| /
					W_max — an empty→jam miss is penalised 3× a low→high slip, because
					that is the error that actually breaks a signal.
				</p>
			</CardContent>
		</Card>
	);
}

function Row({ k, v }: { k: string; v: string }) {
	return (
		<div className="flex items-center justify-between border-foreground/5 border-b pb-1">
			<span>{k}</span>
			<span className="text-foreground tabular-nums">{v}</span>
		</div>
	);
}

// re-export the timeline sparkline for the live page
export { Sparkline };
