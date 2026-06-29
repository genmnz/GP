import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@ziko/ui/components/button";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const TITLE = `
███████╗███╗   ███╗ █████╗ ██████╗ ████████╗
██╔════╝████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝
███████╗██╔████╔██║███████║██████╔╝   ██║
╚════██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║
███████║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║
╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
████████╗██████╗  █████╗ ███████╗███████╗██╗ ██████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝██║██╔════╝
   ██║   ██████╔╝███████║█████╗  █████╗  ██║██║
   ██║   ██╔══██╗██╔══██║██╔══╝  ██╔══╝  ██║██║
   ██║   ██║  ██║██║  ██║██║     ██║     ██║╚██████╗
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝     ╚═╝ ╚═════╝
`;

const LIGHT = `   ┌─────┐
   │ (R) │
   │ (Y) │
   │ (G) │
   └──┬──┘
══════╧══════`;

function HomeComponent() {
	return (
		<div className="container mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-10">
			<pre className="overflow-x-auto font-mono text-[10px] leading-tight sm:text-xs">
				{TITLE}
			</pre>

			<p className="max-w-xl text-center text-muted-foreground">
				A congestion classifier for traffic-signal control. Feed it an
				intersection image — it returns a structured JSON verdict (congestion
				label + confidence, accident / emergency flags) and the signal plan the
				engine derives from it.
			</p>

			<pre className="font-mono text-muted-foreground text-xs">{LIGHT}</pre>

			<div className="flex flex-wrap items-center justify-center gap-3">
				<Link to="/classify" className={buttonVariants({ size: "lg" })}>
					Open the classifier
				</Link>
				<Link
					to="/live"
					className={buttonVariants({ variant: "outline", size: "lg" })}
				>
					Go live
				</Link>
				<a
					href="https://github.com/genmnz/GP"
					target="_blank"
					rel="noreferrer"
					className={buttonVariants({ variant: "outline", size: "lg" })}
				>
					Source
				</a>
			</div>
		</div>
	);
}
