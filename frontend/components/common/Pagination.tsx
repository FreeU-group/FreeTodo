"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import Button from "./Button";

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	className?: string;
}

export default function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	className = "",
}: PaginationProps) {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const maxVisiblePages = 7;

	const getPageNumbers = () => {
		if (totalPages <= maxVisiblePages) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		const halfVisible = Math.floor(maxVisiblePages / 2);
		let startPage: number, endPage: number;

		if (currentPage <= halfVisible + 1) {
			startPage = 1;
			endPage = maxVisiblePages - 2;
		} else if (currentPage >= totalPages - halfVisible) {
			startPage = totalPages - maxVisiblePages + 3;
			endPage = totalPages;
		} else {
			startPage = currentPage - halfVisible + 1;
			endPage = currentPage + halfVisible - 1;
		}

		const pages: (number | string)[] = [];

		if (startPage > 1) {
			pages.push(1);
			if (startPage > 2) pages.push("...");
		}

		for (let i = startPage; i <= endPage; i++) {
			pages.push(i);
		}

		if (endPage < totalPages) {
			if (endPage < totalPages - 1) pages.push("...");
			pages.push(totalPages);
		}

		return pages;
	};

	if (totalPages <= 1) return null;

	const pageNumbers = getPageNumbers();

	return (
		<div className={`flex items-center justify-center gap-2 ${className}`}>
			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={currentPage <= 1}
			>
				<ChevronLeft className="h-4 w-4" />
				<span className="ml-1">{t.common.prev}</span>
			</Button>

			<div className="flex items-center gap-1">
				{pageNumbers.map((page, index) => {
					if (page === "...") {
						const prev = pageNumbers[index - 1];
						const next = pageNumbers[index + 1];
						const key =
							typeof prev === "number" && typeof next === "number"
								? `ellipsis-${prev}-${next}`
								: `ellipsis-${index}-${pageNumbers.length}`;
						return (
							<span
								key={key}
								className="px-2 font-semibold text-muted-foreground"
							>
								⋯
							</span>
						);
					}

					const pageNum = page as number;
					const isActive = pageNum === currentPage;

					return (
						<Button
							key={pageNum}
							variant={isActive ? "primary" : "outline"}
							size="sm"
							onClick={() => onPageChange(pageNum)}
							className="min-w-[2.5rem]"
						>
							{pageNum}
						</Button>
					);
				})}
			</div>

			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={currentPage >= totalPages}
			>
				<span className="mr-1">{t.common.next}</span>
				<ChevronRight className="h-4 w-4" />
			</Button>

			<div className="ml-4 rounded-lg border border-border bg-background px-3 py-1 text-sm font-semibold text-foreground dark:bg-card">
				{t.common.page
					.replace("{current}", String(currentPage))
					.replace("{total}", String(totalPages))}
			</div>
		</div>
	);
}
