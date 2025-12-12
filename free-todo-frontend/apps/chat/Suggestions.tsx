import { cn } from "@/lib/utils";

type SuggestionsProps = {
	suggestions: string[];
	onSelect: (suggestion: string) => void;
};

export function Suggestions({ suggestions, onSelect }: SuggestionsProps) {
	return (
		<div className="mb-3 flex flex-wrap gap-2">
			{suggestions.map((suggestion) => (
				<button
					key={suggestion}
					type="button"
					onClick={() => onSelect(suggestion)}
					className={cn(
						"px-3 py-2 text-sm",
						"rounded-(--radius) border border-foreground/10",
						"text-foreground transition-colors",
						"hover:bg-foreground/5",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					{suggestion}
				</button>
			))}
		</div>
	);
}
