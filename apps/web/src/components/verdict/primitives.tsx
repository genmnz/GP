// Small, dependency-free SVG/Tailwind building blocks for the verdict panels.
import { cn } from "@ziko/ui/lib/utils";
import type { TrafficLabel } from "@/lib/types";
import { LABEL_STYLE } from "@/lib/verdict";

/** Circular progress ring with a value in the center. value ∈ [0,1]. */
export function RingGauge({
	value,
	hex = "#34d399",
	label,
	sub,
	size = 104,
}: {
	value: number;
	hex?: string;
	label: string;
	sub?: string;
	size?: number;
}) {
	const stroke = 8;
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const v = Math.max(0, Math.min(1, value));
	return (
		<div className="relative inline-flex items-center justify-center">
			<svg
				width={size}
				height={size}
				className="-rotate-90"
				role="img"
				aria-label={`${label} ${sub ?? ""}`}
			>
				<title>{`${label} ${sub ?? ""}`}</title>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					stroke="currentColor"
					strokeWidth={stroke}
					className="text-foreground/10"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					stroke={hex}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c * (1 - v)}
					style={{ transition: "stroke-dashoffset 500ms ease" }}
				/>
			</svg>
			<div className="absolute flex flex-col items-center">
				<span className="font-mono font-semibold text-lg leading-none">
					{label}
				</span>
				{sub && (
					<span className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
						{sub}
					</span>
				)}
			</div>
		</div>
	);
}

/** Labeled horizontal bar (probability / share). value ∈ [0,1]. */
export function Bar({
	label,
	value,
	colorClass,
	highlight,
}: {
	label: string;
	value: number;
	colorClass: string;
	highlight?: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<span
				className={cn(
					"w-12 text-xs",
					highlight ? "font-semibold text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
			<div className="h-2.5 flex-1 overflow-hidden rounded-none bg-foreground/10">
				<div
					className={cn("h-full", colorClass)}
					style={{
						width: `${Math.round(value * 100)}%`,
						transition: "width 500ms ease",
					}}
				/>
			</div>
			<span className="w-10 text-right font-mono text-xs tabular-nums">
				{(value * 100).toFixed(0)}%
			</span>
		</div>
	);
}

/** Compact stat cell: big value + caption. */
export function Stat({
	value,
	caption,
	accent,
}: {
	value: React.ReactNode;
	caption: string;
	accent?: string;
}) {
	return (
		<div className="flex flex-col gap-0.5 rounded-none bg-foreground/5 p-2.5 ring-1 ring-foreground/10">
			<span
				className={cn("font-mono font-semibold text-base leading-none", accent)}
			>
				{value}
			</span>
			<span className="text-[10px] text-muted-foreground uppercase tracking-wide">
				{caption}
			</span>
		</div>
	);
}

/** A 3-lamp traffic light; the lamp matching `label` glows. */
export function TrafficLight({ label }: { label: TrafficLabel }) {
	// empty/low -> green, high -> amber, jam -> red
	const lit: "red" | "amber" | "green" =
		label === "jam" ? "red" : label === "high" ? "amber" : "green";
	const lamp = (on: boolean, onClass: string) =>
		cn(
			"h-5 w-5 rounded-full transition-all",
			on ? `${onClass} shadow-[0_0_16px_-1px]` : "bg-foreground/10",
		);
	return (
		<div className="flex flex-col items-center gap-1.5 rounded-none bg-foreground/5 px-2.5 py-2 ring-1 ring-foreground/10">
			<span
				className={lamp(
					lit === "red",
					"bg-red-500 text-red-500 shadow-red-500/70",
				)}
			/>
			<span
				className={lamp(
					lit === "amber",
					"bg-amber-500 text-amber-500 shadow-amber-500/70",
				)}
			/>
			<span
				className={lamp(
					lit === "green",
					"bg-emerald-500 text-emerald-500 shadow-emerald-500/70",
				)}
			/>
		</div>
	);
}

/** Big label chip with color + glow. */
export function LabelChip({
	label,
	size = "lg",
}: {
	label: TrafficLabel;
	size?: "lg" | "sm";
}) {
	const s = LABEL_STYLE[label];
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-none px-3 py-1 font-mono font-semibold uppercase tracking-wider ring-1",
				s.text,
				s.ring,
				s.glow,
				"bg-foreground/5",
				size === "lg" ? "text-xl" : "text-xs",
			)}
		>
			<span className={cn("h-2.5 w-2.5 rounded-full", s.bg)} />
			{label}
		</span>
	);
}

/** Inline sparkline for a numeric series (e.g. congestion weight 1..4 over time). */
export function Sparkline({
	data,
	min,
	max,
	hex = "#60a5fa",
	height = 40,
}: {
	data: number[];
	min: number;
	max: number;
	hex?: string;
	height?: number;
}) {
	const w = 100;
	const n = data.length;
	if (n === 0) return <div style={{ height }} />;
	const span = max - min || 1;
	const pts = data.map((d, i) => {
		const x = n === 1 ? w : (i / (n - 1)) * w;
		const y = height - ((d - min) / span) * height;
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	});
	return (
		<svg
			viewBox={`0 0 ${w} ${height}`}
			preserveAspectRatio="none"
			className="w-full"
			style={{ height }}
			role="img"
			aria-label="timeline"
		>
			<title>timeline</title>
			<polyline
				points={pts.join(" ")}
				fill="none"
				stroke={hex}
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** yes/no flag pill. */
export function FlagPill({ on, label }: { on: boolean; label: string }) {
	return (
		<span
			className={cn(
				"rounded-none px-2 py-0.5 font-medium text-xs ring-1",
				on
					? "bg-red-500/15 text-red-400 ring-red-500/40"
					: "bg-foreground/5 text-muted-foreground ring-foreground/10",
			)}
		>
			{label}: {on ? "yes" : "no"}
		</span>
	);
}
