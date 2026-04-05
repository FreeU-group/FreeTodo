"use client";

import { Cloud, FolderOpen, Lock, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/lib/store/auth-store";

export function UserMenu() {
	const router = useRouter();
	const {
		authMode,
		username,
		profileName,
		isBound,
		isAuthenticated,
		logout,
		fetchProfile,
	} = useAuthStore();

	useEffect(() => {
		if (isAuthenticated && !username) {
			fetchProfile();
		}
	}, [isAuthenticated, username, fetchProfile]);

	const handleLogout = useCallback(() => {
		logout();
		router.push("/login");
	}, [logout, router]);

	const handleSwitchWorkspace = useCallback(() => {
		logout();
		router.push("/login");
	}, [logout, router]);

	const isLocal = authMode === "local";
	const displayName = username || profileName || "用户";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="relative gap-1.5 px-2">
					<User className="h-4 w-4 shrink-0" />
					<span className="max-w-[100px] truncate text-sm hidden sm:inline">
						{displayName}
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<div className="px-2 py-1.5 flex items-center justify-between">
					<p className="text-sm font-medium truncate">{displayName}</p>
					<div className="flex items-center gap-1 text-xs text-muted-foreground">
						{isLocal && !isBound ? (
							<>
								<Lock className="h-3 w-3" />
								<span>本地</span>
							</>
						) : (
							<>
								<Cloud className="h-3 w-3" />
								<span>云端</span>
							</>
						)}
					</div>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleSwitchWorkspace}>
					<FolderOpen className="mr-2 h-4 w-4" />
					<span>切换工作空间</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleLogout} className="text-destructive">
					<LogOut className="mr-2 h-4 w-4" />
					<span>退出登录</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
