import { Search } from "lucide-react";

interface ActivityHeaderProps {
	searchValue: string;
	onSearchChange: (value: string) => void;
}

export function ActivityHeader({
	searchValue,
	onSearchChange,
}: ActivityHeaderProps) {
	return (
		<header className="flex items-center rounded-xl border border-border bg-card p-4 shadow-lg">
			<div className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
				<Search className="h-4 w-4 text-muted-foreground" />
				<input
					value={searchValue}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Find activities..."
					className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
				/>
				<span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
					/
				</span>
			</div>
		</header>
	);
}
