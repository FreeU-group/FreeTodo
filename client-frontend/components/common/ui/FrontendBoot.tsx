export function FrontendBoot() {
	return (
		<div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
			<div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-6 py-5 shadow-lg">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
				<div className="text-sm font-medium tracking-wide">Loading interface</div>
				<div className="text-xs text-muted-foreground">Starting up...</div>
			</div>
		</div>
	);
}
