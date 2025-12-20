import { Activity, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/common/PanelHeader";

interface ActivityHeaderProps {
	searchValue: string;
	onSearchChange: (value: string) => void;
}

export function ActivityHeader({
	searchValue,
	onSearchChange,
}: ActivityHeaderProps) {
	const t = useTranslations("page");

	return (
		<PanelHeader
			icon={Activity}
			title={t("activityLabel")}
			actions={
				<div className="relative">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						value={searchValue}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Find activities..."
						className="h-7 w-48 rounded-md border border-primary/20 px-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
				</div>
			}
		/>
	);
}
